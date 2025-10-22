use axum::{
    routing::get,
    Router,
    response::Json,
};
use serde_json::json;
use tower_http::cors::CorsLayer;
use tracing::info;
use tracing_subscriber;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Build our application with routes
    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .layer(CorsLayer::permissive());

    // Run our app
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
        .await
        .unwrap();

    info!("Signaling server listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app)
        .await
        .unwrap();
}

// Basic handler that responds with a static string
async fn root() -> &'static str {
    "Podcast Recorder Signaling Server"
}

// Health check endpoint
async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "signaling",
        "version": env!("CARGO_PKG_VERSION")
    }))
}