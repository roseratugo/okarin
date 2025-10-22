# Podcast Recorder

Professional podcast recording application with local high-quality recording for distributed teams.

## Features

- 🎙️ **Local Recording**: Each participant records locally for maximum quality
- 🎬 **Separate Tracks**: Individual audio/video tracks per participant for professional editing
- 🌐 **WebRTC P2P**: Direct peer-to-peer communication for low latency
- 🚀 **SFU Support**: Scalable to 5+ participants with LiveKit integration
- 🎯 **Cross-platform**: Windows and macOS support via Tauri
- 🔒 **Privacy-first**: No media data passes through servers, only signaling

## Architecture

This is a monorepo managed with pnpm workspaces containing:

- `apps/desktop` - Tauri desktop application with React
- `apps/signaling` - WebRTC signaling server (Rust/Axum)
- `packages/proto` - Shared TypeScript types and protocols
- `packages/ui` - Reusable React components

## Prerequisites

- Node.js >= 18
- pnpm >= 8
- Rust >= 1.70
- Tauri CLI

## Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install

# Install Rust dependencies (for signaling server)
cd apps/signaling && cargo build
```

## Development

```bash
# Run all apps in development mode
pnpm dev

# Run specific apps
pnpm dev:desktop   # Desktop app only
pnpm dev:signaling # Signaling server only

# Build all packages
pnpm build

# Lint and format
pnpm lint
pnpm format
```

## Project Structure

```
podcast-recorder/
├── apps/
│   ├── desktop/          # Tauri + React desktop app
│   └── signaling/        # Rust WebRTC signaling server
├── packages/
│   ├── proto/            # Shared types and protocols
│   └── ui/               # Reusable UI components
├── pnpm-workspace.yaml   # Workspace configuration
└── package.json          # Root package configuration
```

## Scripts

- `pnpm dev` - Start all apps in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run tests
- `pnpm lint` - Lint all packages
- `pnpm clean` - Clean all build artifacts

## Technology Stack

### Frontend

- **Tauri** - Desktop application framework
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Zustand** - State management
- **Tailwind CSS** - Styling

### Backend

- **Rust** - Performance and reliability
- **Axum** - Web framework
- **Tokio** - Async runtime
- **Tungstenite** - WebSocket support

### WebRTC

- **P2P Mesh** - Direct connections for 2-4 participants
- **LiveKit SFU** - Scalable solution for 5+ participants
- **TURN Server** - NAT traversal with Coturn

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT
