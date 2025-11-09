use crate::handlers::{self, AppState};
use axum::{
  response::Json,
  routing::{delete, get, post},
  Router,
};
use serde_json::json;

pub fn create_router(state: AppState) -> Router {
  Router::new()
    .route("/", get(root))
    .route("/health", get(health))
    .route("/api/rooms", post(handlers::create_room))
    .route("/api/rooms/{id}", get(handlers::get_room))
    .route("/api/rooms/{id}", delete(handlers::delete_room))
    .route("/api/rooms/{id}/join", post(handlers::join_room))
    .with_state(state)
}

async fn root() -> &'static str {
  "Podcast Recorder Signaling Server"
}

async fn health() -> Json<serde_json::Value> {
  Json(json!({
      "status": "ok",
      "service": "signaling",
      "version": env!("CARGO_PKG_VERSION")
  }))
}
