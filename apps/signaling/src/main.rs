mod config;
mod handlers;
mod models;
mod routes;
mod shutdown;
mod storage;
mod websocket;

use axum::Router;
use config::Config;
use handlers::AppState;
use storage::RoomStorage;
use tower_http::{
  cors::CorsLayer,
  trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer},
};
use tracing::{info, Level};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
  let config = Config::from_env()?;

  tracing_subscriber::registry()
    .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&config.log_level)))
    .with(tracing_subscriber::fmt::layer())
    .init();

  info!(
    "Starting Podcast Recorder Signaling Server v{}",
    env!("CARGO_PKG_VERSION")
  );
  info!("Configuration loaded: {:?}", config);

  let storage = RoomStorage::new();
  let app = create_app(storage.clone());

  let storage_clone = storage.clone();
  let config_clone = config.clone();
  tokio::spawn(async move {
    cleanup_task(storage_clone, config_clone).await;
  });

  let listener = tokio::net::TcpListener::bind(config.addr()).await?;
  let addr = listener.local_addr()?;

  info!("Server listening on {}", addr);
  info!("Health check available at http://{}/health", addr);

  axum::serve(listener, app)
    .with_graceful_shutdown(shutdown::shutdown_signal())
    .await?;

  info!("Server shutdown complete");

  Ok(())
}

fn create_app(storage: RoomStorage) -> Router {
  let state = AppState { storage };

  routes::create_router(state)
    .layer(
      TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO)),
    )
    .layer(CorsLayer::permissive())
}

async fn cleanup_task(storage: RoomStorage, config: Config) {
  use tokio::time::{interval, Duration};

  let mut interval = interval(Duration::from_secs(config.cleanup_interval_seconds));

  info!(
    "Starting room cleanup task (TTL: {}s, interval: {}s)",
    config.room_ttl_seconds, config.cleanup_interval_seconds
  );

  loop {
    interval.tick().await;

    let removed_rooms = storage.cleanup_inactive_rooms(config.room_ttl_seconds);

    if !removed_rooms.is_empty() {
      info!(
        "Cleaned up {} inactive room(s): {:?}",
        removed_rooms.len(),
        removed_rooms
      );
    }
  }
}
