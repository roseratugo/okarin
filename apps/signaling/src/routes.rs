use axum::{response::Json, routing::get, Router};
use serde_json::json;

pub fn create_router() -> Router {
  Router::new()
    .route("/", get(root))
    .route("/health", get(health))
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
