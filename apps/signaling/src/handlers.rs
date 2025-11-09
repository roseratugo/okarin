use crate::models::{CreateRoomRequest, CreateRoomResponse, JoinRoomRequest, JoinRoomResponse};
use crate::storage::{RoomStorage, StorageError};
use axum::{
  extract::{Path, State},
  http::StatusCode,
  response::{IntoResponse, Response},
  Json,
};
use serde_json::json;

#[derive(Clone)]
pub struct AppState {
  pub storage: RoomStorage,
}

pub async fn create_room(
  State(state): State<AppState>,
  Json(request): Json<CreateRoomRequest>,
) -> Result<Json<CreateRoomResponse>, AppError> {
  let room = state
    .storage
    .create_room(request.name, request.created_by, request.max_participants);

  Ok(Json(CreateRoomResponse {
    room_id: room.id,
    created_at: room.created_at,
  }))
}

pub async fn get_room(
  State(state): State<AppState>,
  Path(room_id): Path<String>,
) -> Result<Response, AppError> {
  let room = state.storage.get_room(&room_id)?;
  let room_info = room.to_public_info();

  Ok(Json(room_info).into_response())
}

pub async fn join_room(
  State(state): State<AppState>,
  Path(room_id): Path<String>,
  Json(request): Json<JoinRoomRequest>,
) -> Result<Json<JoinRoomResponse>, AppError> {
  let (participant, token) = state
    .storage
    .join_room(&room_id, request.participant_name, false)?;

  let room = state.storage.get_room(&room_id)?;

  Ok(Json(JoinRoomResponse {
    token,
    participant_id: participant.id,
    ice_servers: room.ice_servers,
  }))
}

pub async fn delete_room(
  State(state): State<AppState>,
  Path(room_id): Path<String>,
  Json(requester_id): Json<String>,
) -> Result<StatusCode, AppError> {
  state.storage.delete_room(&room_id, &requester_id)?;
  Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug)]
pub struct AppError(StorageError);

impl IntoResponse for AppError {
  fn into_response(self) -> Response {
    let (status, message) = match self.0 {
      StorageError::RoomNotFound => (StatusCode::NOT_FOUND, "Room not found"),
      StorageError::RoomFull => (StatusCode::CONFLICT, "Room is full"),
      StorageError::Unauthorized => (StatusCode::FORBIDDEN, "Unauthorized"),
      StorageError::TokenGenerationFailed(_) => {
        (StatusCode::INTERNAL_SERVER_ERROR, "Token generation failed")
      }
    };

    let body = Json(json!({
        "error": message,
        "details": self.0.to_string()
    }));

    (status, body).into_response()
  }
}

impl From<StorageError> for AppError {
  fn from(error: StorageError) -> Self {
    AppError(error)
  }
}
