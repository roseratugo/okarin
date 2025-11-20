# Podcast Recorder

Professional podcast recording application with local high-quality recording for distributed teams.

## Features

- 🎙️ **Local Recording**: Each participant records locally for maximum quality
- 🎬 **Separate Tracks**: Individual audio/video tracks per participant for professional editing
- 🌐 **Cloudflare Calls SFU**: Scalable WebRTC with Selective Forwarding Unit
- 🚀 **Global Edge**: Signaling server deployed on Cloudflare Workers worldwide
- 🎯 **Cross-platform**: macOS support via Tauri (Windows coming soon)
- 🔒 **Privacy-first**: Media routed through Cloudflare's secure infrastructure

## Architecture

This is a monorepo managed with pnpm workspaces containing:

- `apps/desktop` - Tauri desktop application with React
- `apps/signaling` - Cloudflare Worker for WebRTC signaling
- `packages/ui` - Reusable React components

```
podcast-recorder/
├── apps/
│   ├── desktop/          # Tauri + React desktop app
│   └── signaling/        # Cloudflare Worker signaling server
├── packages/
│   └── ui/               # Reusable UI components
├── pnpm-workspace.yaml   # Workspace configuration
└── package.json          # Root package configuration
```

## Prerequisites

- Node.js >= 18
- pnpm >= 8
- Rust >= 1.70 (for Tauri)
- Cloudflare account (for signaling server)

## Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install
```

## Development

```bash
# Run desktop app in development mode
pnpm dev:desktop

# Run signaling server locally
pnpm dev:signaling

# Build all packages
pnpm build

# Build desktop app for distribution
pnpm tauri:build

# Lint and format
pnpm lint
pnpm format
```

## Deployment

### Signaling Server (Cloudflare Worker)

```bash
cd apps/signaling

# Configure secrets
npx wrangler secret put JWT_SECRET
npx wrangler secret put CLOUDFLARE_APP_SECRET

# Deploy
npx wrangler deploy
```

### Desktop App

```bash
pnpm tauri:build
```

The DMG will be created in `apps/desktop/src-tauri/target/release/bundle/dmg/`.

## Configuration

### Desktop App

Create `apps/desktop/.env`:

```env
VITE_SIGNALING_SERVER_URL=https://your-worker.workers.dev
```

### Signaling Server

Configure in `apps/signaling/wrangler.jsonc`:

```json
{
  "vars": {
    "CLOUDFLARE_APP_ID": "your-cloudflare-calls-app-id",
    "CORS_ORIGIN": "*"
  }
}
```

## Technology Stack

### Frontend

- **Tauri** - Desktop application framework
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Zustand** - State management
- **Tailwind CSS** - Styling

### Backend

- **Cloudflare Workers** - Edge computing
- **Durable Objects** - Stateful WebSocket rooms
- **KV Storage** - Room metadata

### WebRTC

- **Cloudflare Calls** - SFU for scalable media routing
- **STUN/TURN** - NAT traversal via Cloudflare

## Scripts

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `pnpm dev:desktop`   | Start desktop app in dev mode      |
| `pnpm dev:signaling` | Start signaling server locally     |
| `pnpm build`         | Build all packages                 |
| `pnpm tauri:build`   | Build desktop app for distribution |
| `pnpm lint`          | Lint all packages                  |
| `pnpm format`        | Format all files                   |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT + Commons Clause - See [LICENSE](LICENSE)

This means you can use, modify, and distribute freely, but you cannot sell the software commercially.
