use axum::{response::Json, routing::get, Router};
use serde_json::json;
use tower_http::cors::CorsLayer;
use tracing::info;

#[tokio::main]
async fn main() {
  tracing_subscriber::fmt::init();

  let app = Router::new()
    .route("/", get(root))
    .route("/health", get(health))
    .layer(CorsLayer::permissive());

  let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
    .await
    .unwrap();

  info!(
    "Signaling server listening on {}",
    listener.local_addr().unwrap()
  );

  axum::serve(listener, app).await.unwrap();
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
