# Signaling Server

Cloudflare Worker for WebRTC signaling with Cloudflare Calls SFU integration.

## Features

- WebSocket-based signaling for WebRTC
- Durable Objects for room state management
- KV storage for room metadata
- Cloudflare Calls API proxy
- JWT authentication

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Client    │────▶│  Worker (Edge)   │────▶│ Cloudflare Calls│
│  (Desktop)  │     │                  │     │      (SFU)      │
└─────────────┘     └──────────────────┘     └─────────────────┘
                            │
                    ┌───────┴───────┐
                    ▼               ▼
            ┌──────────────┐ ┌─────────────┐
            │Durable Object│ │  KV Storage │
            │   (Rooms)    │ │  (Metadata) │
            └──────────────┘ └─────────────┘
```

## API Endpoints

### Rooms

| Method | Endpoint              | Description             |
| ------ | --------------------- | ----------------------- |
| POST   | `/api/rooms`          | Create a new room       |
| GET    | `/api/rooms/:id`      | Get room info           |
| POST   | `/api/rooms/:id/join` | Join a room (get token) |

### WebSocket

| Endpoint          | Description                        |
| ----------------- | ---------------------------------- |
| `/ws?token=<jwt>` | WebSocket connection for signaling |

### Cloudflare Calls Proxy

| Method | Endpoint                              | Description         |
| ------ | ------------------------------------- | ------------------- |
| POST   | `/cloudflare/session`                 | Create SFU session  |
| POST   | `/cloudflare/session/:id/tracks/new`  | Add tracks          |
| PUT    | `/cloudflare/session/:id/renegotiate` | Renegotiate session |

## Setup

### Prerequisites

- Cloudflare account
- Cloudflare Calls app (get App ID and Secret from dashboard)
- Wrangler CLI

### Configuration

1. Create KV namespace:

```bash
npx wrangler kv namespace create ROOM_METADATA
```

2. Update `wrangler.jsonc` with the KV namespace ID and your Cloudflare App ID.

3. Set secrets:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put CLOUDFLARE_APP_SECRET
```

### Development

```bash
# Run locally
pnpm dev

# Deploy
pnpm deploy
```

## Environment Variables

| Variable            | Description             |
| ------------------- | ----------------------- |
| `CLOUDFLARE_APP_ID` | Cloudflare Calls App ID |
| `CORS_ORIGIN`       | Allowed CORS origin     |

## Secrets

| Secret                  | Description                   |
| ----------------------- | ----------------------------- |
| `JWT_SECRET`            | Secret for signing JWT tokens |
| `CLOUDFLARE_APP_SECRET` | Cloudflare Calls API secret   |

## WebSocket Messages

### Client → Server

```typescript
// Broadcast Cloudflare session info
{
  type: "cloudflare-session",
  roomId: string,
  participantId: string,
  participantName: string,
  sessionId: string,
  tracks: Array<{ trackName: string, kind: string }>
}

// Track state change
{
  type: "track-state",
  from: string,
  kind: "audio" | "video",
  enabled: boolean
}
```

### Server → Client

```typescript
// Participant joined
{
  type: "join",
  from: string,
  data: { participant_id: string, participant_name: string }
}

// Participant left
{
  type: "leave",
  from: string,
  data: { participant_id: string }
}

// Cloudflare session (from another participant)
{
  type: "cloudflare-session",
  ...
}
```

## License

MIT
