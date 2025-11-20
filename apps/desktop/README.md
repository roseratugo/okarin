# Desktop App

Tauri desktop application for podcast recording with Cloudflare Calls WebRTC.

## Features

- High-quality local audio/video recording
- Cloudflare Calls SFU for scalable multi-participant calls
- Settings persistence with Tauri Store
- Real-time participant video grid
- Recording controls with keyboard shortcuts

## Tech Stack

- **Tauri** - Desktop framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **WebRTC** - Real-time communication

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

## Configuration

Create `.env` file:

```env
VITE_SIGNALING_SERVER_URL=https://call.collectif-pixel.fr
```

## Project Structure

```
src/
├── components/       # React components
├── hooks/           # Custom hooks
├── lib/             # Utilities and clients
│   ├── CloudflareCalls.ts   # Cloudflare Calls SFU client
│   ├── SignalingClient.ts   # WebSocket signaling client
│   ├── signalingApi.ts      # REST API client
│   └── tauriStorage.ts      # Storage abstraction
├── pages/           # Route pages
├── stores/          # Zustand stores
└── App.tsx          # Main app component
```

## Key Components

### CloudflareCalls

WebRTC client for Cloudflare Calls SFU:

```typescript
const client = new CloudflareCalls({ appId: 'your-app-id' });

// Create session
await client.createSession(signalingUrl);
await client.initialize();

// Push local tracks
const tracks = await client.pushTracks([audioTrack, videoTrack], signalingUrl);

// Pull remote tracks
await client.pullTracks([{ sessionId: 'remote-session', trackName: 'audio-track' }], signalingUrl);
```

### SignalingClient

WebSocket client for room signaling:

```typescript
const signaling = new SignalingClient(wsUrl, {
  onParticipantJoined: (id, name) => { ... },
  onParticipantLeft: (id) => { ... },
  onCloudflareSession: (data) => { ... }
});

await signaling.connect(token);
signaling.sendCloudflareSession(roomId, participantId, sessionId, tracks);
```

## Pages

| Route                | Description        |
| -------------------- | ------------------ |
| `/`                  | Home page          |
| `/room/create`       | Create new room    |
| `/room/join`         | Join existing room |
| `/recording/:roomId` | Recording session  |
| `/settings`          | App settings       |

## Keyboard Shortcuts

| Key     | Action            |
| ------- | ----------------- |
| `Space` | Toggle recording  |
| `M`     | Toggle microphone |
| `V`     | Toggle camera     |

## Build

### macOS

```bash
pnpm tauri:build
```

Output: `src-tauri/target/release/bundle/dmg/Podcast Recorder_x.x.x_aarch64.dmg`

### Code Signing (requires Apple Developer)

Add to `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAMID)"
    }
  }
}
```

## License

MIT
