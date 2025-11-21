<div align="center">
  <img src="./.github/assets/thumbnail.jpg" alt="@boringnode/bus">
</div>

<div align="center">

[![typescript-image]][typescript-url]
[![tauri-image]][tauri-url]
[![cloudflare-image]][cloudflare-url]
[![gh-workflow-image]][gh-workflow-url]
[![licence-image]][licence-url]

</div>

<br />

## Why Okarin?

Recording a podcast remotely usually means one compressed audio stream for everyone. Okarin captures each participant as a separate track, giving you individual files for professional post-production.

- **Multi-track recording** - Each participant recorded as a separate audio/video file
- **Full quality** - No compression from centralized recording
- **WebRTC SFU** - Scalable media routing via Cloudflare Calls
- **Edge signaling** - Sub-50ms latency with global Cloudflare Workers

## Installation

Download the latest release from [GitHub Releases](https://github.com/roseratugo/okarin/releases).

**macOS**: Download `.dmg`, drag to Applications
**Windows**: Coming soon
**Linux**: Coming soon

## Development

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Rust >= 1.70

### Setup

```bash
pnpm install
```

### Commands

```bash
# Development
pnpm dev:desktop      # Desktop app with hot reload
pnpm dev:signaling    # Local signaling server

# Build
pnpm build            # All packages
pnpm tauri:build      # Desktop distributable

# Quality
pnpm lint             # Check code
pnpm typecheck        # Type validation
```

## Architecture

```
apps/
├── desktop/       # Tauri + React
├── signaling/     # Cloudflare Worker (WebSocket rooms)
└── auth/          # Cloudflare Worker (JWT auth)

packages/
└── ui/            # Shared components
```

### Stack

**Desktop**: Tauri, React 19, Zustand, Tailwind CSS
**Backend**: Cloudflare Workers, Durable Objects, KV
**Media**: Cloudflare Calls SFU, WebRTC

## Deployment

### Signaling Server

```bash
cd apps/signaling

# Set secrets
npx wrangler secret put JWT_SECRET
npx wrangler secret put CLOUDFLARE_APP_SECRET

# Deploy
npx wrangler deploy -c wrangler.jsonc
```

### Desktop App

Releases are built automatically via GitHub Actions when pushing to `main`.

## Configuration

### Desktop

Create `apps/desktop/.env`:

```env
VITE_SIGNALING_SERVER_URL=https://your-worker.workers.dev
VITE_AUTH_SERVER_URL=https://auth.your-domain.com
```

### Signaling

Edit `apps/signaling/wrangler.jsonc`:

```json
{
  "vars": {
    "CLOUDFLARE_APP_ID": "your-cloudflare-calls-app-id"
  }
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT + Commons Clause](LICENSE.md)

Free to use, modify, and distribute. Commercial sale prohibited.

[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?style=for-the-badge&logo=typescript
[typescript-url]: https://www.typescriptlang.org
[tauri-image]: https://img.shields.io/badge/tauri-%2324C8DB.svg?style=for-the-badge&logo=tauri&logoColor=%23FFFFFF
[tauri-url]: https://v2.tauri.app
[cloudflare-image]: https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white
[cloudflare-url]: https://workers.cloudflare.com/
[gh-workflow-image]: https://img.shields.io/github/actions/workflow/status/roseratugo/okarin/release.yml?branch=main&style=for-the-badge
[gh-workflow-url]: https://github.com/roseratugo/okarin/actions/workflows/release.yml
[licence-image]: https://img.shields.io/badge/License-MIT-green?style=for-the-badge
[licence-url]: LICENSE.md
