# Podcast Recorder Signaling Server

A high-performance WebRTC signaling server built with Rust, Axum, and Tokio.

## Features

- **Axum Web Framework**: Fast, ergonomic HTTP server with WebSocket support
- **Tokio Runtime**: Efficient async runtime with configurable thread pool
- **Graceful Shutdown**: Handles SIGTERM/SIGINT signals properly
- **Structured Logging**: JSON-formatted logs with tracing
- **CORS Support**: Configurable cross-origin resource sharing
- **Health Checks**: Built-in health check endpoint
- **Environment Configuration**: Flexible configuration via environment variables

## Quick Start

### Prerequisites

- Rust 1.70 or later
- Cargo

### Installation

```bash
# Clone the repository
cd apps/signaling

# Build the project
cargo build --release

# Run the server
cargo run --release
```

### Configuration

The server can be configured using environment variables. Create a `.env` file in the `apps/signaling` directory:

```env
# Server Configuration
HOST=0.0.0.0
PORT=3001

# Logging Configuration
RUST_LOG=info
```

Available configuration options:

- `HOST`: Server host address (default: `0.0.0.0`)
- `PORT`: Server port (default: `3001`)
- `RUST_LOG`: Log level - `trace`, `debug`, `info`, `warn`, `error` (default: `info`)

## API Endpoints

### Root

```
GET /
```

Returns the server name and version.

**Response:**

```
Podcast Recorder Signaling Server
```

### Health Check

```
GET /health
```

Returns the server health status.

**Response:**

```json
{
  "status": "ok",
  "service": "signaling",
  "version": "0.1.0"
}
```

## Development

### Running in Development Mode

```bash
cargo run
```

### Running with Custom Configuration

```bash
HOST=127.0.0.1 PORT=8080 RUST_LOG=debug cargo run
```

### Running Tests

```bash
cargo test
```

### Linting

```bash
cargo clippy
```

### Formatting

```bash
cargo fmt
```

## Architecture

The server is built with the following components:

- **Axum**: Web framework for routing and middleware
- **Tower**: Middleware and service composition
- **Tower-HTTP**: HTTP-specific middleware (CORS, tracing)
- **Tokio**: Async runtime
- **Tracing**: Structured logging

### Project Structure

```
apps/signaling/
├── src/
│   ├── main.rs       # Application entry point
│   ├── config.rs     # Configuration management
│   ├── routes.rs     # HTTP routes and handlers
│   └── shutdown.rs   # Graceful shutdown handler
├── Cargo.toml        # Dependencies and metadata
└── README.md         # This file
```

## Production Deployment

### Building for Production

```bash
cargo build --release
```

The optimized binary will be available at `target/release/podcast-recorder-signaling`.

### Running in Production

```bash
# Set environment variables
export HOST=0.0.0.0
export PORT=3001
export RUST_LOG=info

# Run the server
./target/release/podcast-recorder-signaling
```

### Docker Deployment

(To be implemented in future)

## License

MIT
