use crate::models::{Participant, Room};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StorageError {
  #[error("Room not found")]
  RoomNotFound,
  #[error("Room is full")]
  RoomFull,
  #[error("Unauthorized")]
  Unauthorized,
  #[error("Token generation failed: {0}")]
  TokenGenerationFailed(String),
}

#[derive(Debug, Clone)]
pub struct RoomStorage {
  rooms: Arc<RwLock<HashMap<String, Room>>>,
  jwt_secret: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TokenClaims {
  room_id: String,
  participant_id: String,
  participant_name: String,
  exp: i64,
  iat: i64,
}

impl RoomStorage {
  pub fn new() -> Self {
    Self {
      rooms: Arc::new(RwLock::new(HashMap::new())),
      jwt_secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| {
        use rand::Rng;
        let random_bytes: Vec<u8> = (0..32).map(|_| rand::rng().random()).collect();
        hex::encode(random_bytes)
      }),
    }
  }

  pub fn create_room(&self, name: String, created_by: String, max_participants: usize) -> Room {
    let room = Room::new(name, created_by, max_participants);
    let room_id = room.id.clone();

    let mut rooms = self.rooms.write().unwrap();
    rooms.insert(room_id, room.clone());

    room
  }

  pub fn get_room(&self, room_id: &str) -> Result<Room, StorageError> {
    let rooms = self.rooms.read().unwrap();
    rooms
      .get(room_id)
      .cloned()
      .ok_or(StorageError::RoomNotFound)
  }

  pub fn delete_room(&self, room_id: &str, requester_id: &str) -> Result<(), StorageError> {
    let mut rooms = self.rooms.write().unwrap();

    let room = rooms.get(room_id).ok_or(StorageError::RoomNotFound)?;

    if room.created_by != requester_id {
      return Err(StorageError::Unauthorized);
    }

    rooms.remove(room_id);
    Ok(())
  }

  pub fn join_room(
    &self,
    room_id: &str,
    participant_name: String,
    is_host: bool,
  ) -> Result<(Participant, String), StorageError> {
    let mut rooms = self.rooms.write().unwrap();
    let room = rooms.get_mut(room_id).ok_or(StorageError::RoomNotFound)?;

    if !room.can_join() {
      return Err(StorageError::RoomFull);
    }

    let participant = Participant::new(participant_name.clone(), is_host);
    let participant_id = participant.id.clone();

    room.add_participant(participant.clone());

    let token = self.generate_token(room_id, &participant_id, &participant_name)?;

    Ok((participant, token))
  }

  fn generate_token(
    &self,
    room_id: &str,
    participant_id: &str,
    participant_name: &str,
  ) -> Result<String, StorageError> {
    let now = Utc::now();
    let expiration = now + Duration::hours(24);

    let claims = TokenClaims {
      room_id: room_id.to_string(),
      participant_id: participant_id.to_string(),
      participant_name: participant_name.to_string(),
      iat: now.timestamp(),
      exp: expiration.timestamp(),
    };

    encode(
      &Header::default(),
      &claims,
      &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
    )
    .map_err(|e| StorageError::TokenGenerationFailed(e.to_string()))
  }
}

impl Default for RoomStorage {
  fn default() -> Self {
    Self::new()
  }
}
