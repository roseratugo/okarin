use std::net::SocketAddr;

#[derive(Debug, Clone)]
pub struct Config {
  pub host: String,
  pub port: u16,
  pub log_level: String,
  pub room_ttl_seconds: i64,
  pub cleanup_interval_seconds: u64,
}

impl Config {
  pub fn from_env() -> anyhow::Result<Self> {
    dotenvy::dotenv().ok();

    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("PORT")
      .unwrap_or_else(|_| "3001".to_string())
      .parse::<u16>()?;
    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let room_ttl_seconds = std::env::var("ROOM_TTL_SECONDS")
      .unwrap_or_else(|_| "7200".to_string())
      .parse::<i64>()?;
    let cleanup_interval_seconds = std::env::var("CLEANUP_INTERVAL_SECONDS")
      .unwrap_or_else(|_| "300".to_string())
      .parse::<u64>()?;

    Ok(Self {
      host,
      port,
      log_level,
      room_ttl_seconds,
      cleanup_interval_seconds,
    })
  }

  pub fn addr(&self) -> SocketAddr {
    format!("{}:{}", self.host, self.port)
      .parse()
      .expect("Invalid socket address")
  }
}
