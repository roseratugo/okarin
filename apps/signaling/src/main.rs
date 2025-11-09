mod config;
mod routes;
mod shutdown;

use axum::Router;
use config::Config;
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

  let app = create_app();

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

fn create_app() -> Router {
  routes::create_router()
    .layer(
      TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO)),
    )
    .layer(CorsLayer::permissive())
}
