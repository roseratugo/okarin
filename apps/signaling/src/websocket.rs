use axum::{
  extract::{
    ws::{Message, WebSocket},
    Query, State, WebSocketUpgrade,
  },
  response::{IntoResponse, Response},
};
use futures::{sink::SinkExt, stream::StreamExt};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info, warn};

use crate::handlers::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsMessage {
  #[serde(rename = "type")]
  pub msg_type: MessageType,
  pub from: String,
  pub to: String,
  pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageType {
  Join,
  Leave,
  Offer,
  Answer,
  Ice,
}

#[derive(Debug, Clone, Deserialize)]
struct TokenClaims {
  room_id: String,
  participant_id: String,
  participant_name: String,
  #[allow(dead_code)]
  exp: i64,
}

#[derive(Debug, Deserialize)]
pub struct WsQuery {
  token: String,
}

type Tx = mpsc::UnboundedSender<Message>;
type PeerMap = Arc<RwLock<HashMap<String, HashMap<String, Tx>>>>;

pub async fn ws_handler(
  ws: WebSocketUpgrade,
  Query(query): Query<WsQuery>,
  State(state): State<AppState>,
) -> Response {
  let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| {
    use rand::Rng;
    let random_bytes: Vec<u8> = (0..32).map(|_| rand::rng().random()).collect();
    hex::encode(random_bytes)
  });

  let claims = match decode::<TokenClaims>(
    &query.token,
    &DecodingKey::from_secret(jwt_secret.as_bytes()),
    &Validation::default(),
  ) {
    Ok(token_data) => token_data.claims,
    Err(e) => {
      error!("Token validation failed: {}", e);
      return (axum::http::StatusCode::UNAUTHORIZED, "Invalid token").into_response();
    }
  };

  info!(
    "WebSocket connection request for room {} from participant {}",
    claims.room_id, claims.participant_id
  );

  ws.on_upgrade(move |socket| handle_socket(socket, claims, state))
}

async fn handle_socket(socket: WebSocket, claims: TokenClaims, state: AppState) {
  let (mut sender, mut receiver) = socket.split();
  let (tx, mut rx) = mpsc::unbounded_channel();

  let room_id = claims.room_id.clone();
  let participant_id = claims.participant_id.clone();

  let peers: PeerMap = Arc::new(RwLock::new(HashMap::new()));
  let peers_clone = peers.clone();

  {
    let mut peers_lock = peers.write().await;
    peers_lock
      .entry(room_id.clone())
      .or_insert_with(HashMap::new)
      .insert(participant_id.clone(), tx);
  }

  info!(
    "Participant {} connected to room {}",
    participant_id, room_id
  );

  let join_message = WsMessage {
    msg_type: MessageType::Join,
    from: participant_id.clone(),
    to: "all".to_string(),
    data: serde_json::json!({
        "participant_id": participant_id,
        "participant_name": claims.participant_name,
    }),
  };

  if let Ok(msg) = serde_json::to_string(&join_message) {
    broadcast_to_room(&peers, &room_id, &participant_id, Message::Text(msg.into())).await;
  }

  let mut send_task = tokio::spawn(async move {
    while let Some(msg) = rx.recv().await {
      if sender.send(msg).await.is_err() {
        break;
      }
    }
  });

  let room_id_clone = room_id.clone();
  let peers_clone2 = peers_clone.clone();

  let state_clone = state.clone();
  let room_id_clone2 = room_id.clone();

  let mut recv_task = tokio::spawn(async move {
    while let Some(Ok(msg)) = receiver.next().await {
      if let Message::Text(text) = msg {
        match serde_json::from_str::<WsMessage>(&text) {
          Ok(ws_msg) => {
            info!(
              "Received message type {:?} from {} to {}",
              ws_msg.msg_type, ws_msg.from, ws_msg.to
            );

            let _ = state_clone.storage.update_room_activity(&room_id_clone2);

            if ws_msg.to == "all" {
              broadcast_to_room(
                &peers_clone2,
                &room_id_clone,
                &ws_msg.from,
                Message::Text(text),
              )
              .await;
            } else {
              send_to_participant(
                &peers_clone2,
                &room_id_clone,
                &ws_msg.to,
                Message::Text(text),
              )
              .await;
            }
          }
          Err(e) => {
            warn!("Failed to parse WebSocket message: {}", e);
          }
        }
      }
    }
  });

  tokio::select! {
      _ = (&mut send_task) => recv_task.abort(),
      _ = (&mut recv_task) => send_task.abort(),
  };

  info!(
    "Participant {} disconnected from room {}",
    participant_id, room_id
  );

  {
    let mut peers_lock = peers.write().await;
    if let Some(room_peers) = peers_lock.get_mut(&room_id) {
      room_peers.remove(&participant_id);
      if room_peers.is_empty() {
        peers_lock.remove(&room_id);
      }
    }
  }

  let leave_message = WsMessage {
    msg_type: MessageType::Leave,
    from: participant_id.clone(),
    to: "all".to_string(),
    data: serde_json::json!({
        "participant_id": participant_id,
    }),
  };

  if let Ok(msg) = serde_json::to_string(&leave_message) {
    broadcast_to_room(&peers, &room_id, &participant_id, Message::Text(msg.into())).await;
  }

  let _ = state.storage.delete_room(&room_id, &participant_id);
}

async fn broadcast_to_room(peers: &PeerMap, room_id: &str, exclude_id: &str, msg: Message) {
  let peers_lock = peers.read().await;
  if let Some(room_peers) = peers_lock.get(room_id) {
    for (peer_id, tx) in room_peers.iter() {
      if peer_id != exclude_id {
        let _ = tx.send(msg.clone());
      }
    }
  }
}

async fn send_to_participant(peers: &PeerMap, room_id: &str, participant_id: &str, msg: Message) {
  let peers_lock = peers.read().await;
  if let Some(room_peers) = peers_lock.get(room_id) {
    if let Some(tx) = room_peers.get(participant_id) {
      let _ = tx.send(msg);
    }
  }
}
