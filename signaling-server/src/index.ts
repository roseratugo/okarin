import { DurableObject } from "cloudflare:workers";

// Types
interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ROOM_METADATA: KVNamespace;
  JWT_SECRET: string;
  CLOUDFLARE_APP_ID: string;
  CLOUDFLARE_APP_SECRET: string;
  CORS_ORIGIN: string;
}

interface RoomMetadata {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  maxParticipants: number;
}

interface Participant {
  id: string;
  name: string;
  sessionId?: string;
  tracks?: { trackName: string; kind: string }[];
}

interface TokenPayload {
  room_id: string;
  participant_id: string;
  participant_name: string;
  exp: number;
  iat: number;
}

// Simple JWT implementation
async function signJwt(payload: TokenPayload, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJwt(token: string, secret: string): Promise<TokenPayload | null> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = Uint8Array.from(
      atob(encodedSignature.replace(/-/g, "+").replace(/_/g, "/")),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(`${encodedHeader}.${encodedPayload}`)
    );

    if (!valid) return null;

    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"))) as TokenPayload;

    // Check expiration
    if (payload.exp < Date.now() / 1000) return null;

    return payload;
  } catch {
    return null;
  }
}

// Room Durable Object
export class Room extends DurableObject<Env> {
  private participants: Map<string, Participant> = new Map();
  private connections: Map<string, WebSocket> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Restore WebSocket connections and participants on wake
    this.ctx.getWebSockets().forEach(ws => {
      const meta = ws.deserializeAttachment() as {
        participantId: string;
        participantName: string;
        sessionId?: string;
        tracks?: { trackName: string; kind: string }[];
      } | null;
      if (meta) {
        this.connections.set(meta.participantId, ws);
        this.participants.set(meta.participantId, {
          id: meta.participantId,
          name: meta.participantName,
          sessionId: meta.sessionId,
          tracks: meta.tracks,
        });
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response("Missing token", { status: 401 });
      }

      const claims = await verifyJwt(token, this.env.JWT_SECRET);
      if (!claims) {
        return new Response("Invalid token", { status: 401 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept with hibernation
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({
        participantId: claims.participant_id,
        participantName: claims.participant_name,
      });

      this.connections.set(claims.participant_id, server);

      // Send existing participants to new connection
      const existingParticipants = Array.from(this.participants.values())
        .filter(p => p.id !== claims.participant_id);

      for (const participant of existingParticipants) {
        if (participant.sessionId && participant.tracks) {
          server.send(JSON.stringify({
            type: "cloudflare-session",
            roomId: claims.room_id,
            participantId: participant.id,
            participantName: participant.name,
            sessionId: participant.sessionId,
            tracks: participant.tracks,
          }));
        }
      }

      // Broadcast join to others
      this.broadcast(claims.participant_id, {
        type: "join",
        from: claims.participant_id,
        to: "all",
        data: {
          participant_id: claims.participant_id,
          participant_name: claims.participant_name,
        },
      });

      // Add to participants
      this.participants.set(claims.participant_id, {
        id: claims.participant_id,
        name: claims.participant_name,
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Expected WebSocket", { status: 400 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    const meta = ws.deserializeAttachment() as { participantId: string; participantName: string } | null;
    if (!meta) return;

    try {
      const data = JSON.parse(message);
      const msgType = data.type;

      switch (msgType) {
        case "cloudflare-session": {
          // Store session info
          const participant = this.participants.get(meta.participantId);
          if (participant) {
            participant.sessionId = data.sessionId;
            participant.tracks = data.tracks;
            this.participants.set(meta.participantId, participant);
          }

          // Update WebSocket attachment for hibernation recovery
          ws.serializeAttachment({
            participantId: meta.participantId,
            participantName: meta.participantName,
            sessionId: data.sessionId,
            tracks: data.tracks,
          });

          // Broadcast to others
          this.broadcast(meta.participantId, data);
          break;
        }

        case "track-state": {
          // Broadcast track state changes
          this.broadcast(meta.participantId, data);
          break;
        }

        default: {
          // Handle legacy P2P messages (offer, answer, ice)
          if (data.to === "all") {
            this.broadcast(meta.participantId, data);
          } else {
            this.sendTo(data.to, data);
          }
        }
      }
    } catch (e) {
      console.error("Failed to parse message:", e);
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const meta = ws.deserializeAttachment() as { participantId: string; participantName: string } | null;
    if (!meta) return;

    this.connections.delete(meta.participantId);
    this.participants.delete(meta.participantId);

    // Broadcast leave
    this.broadcast(meta.participantId, {
      type: "leave",
      from: meta.participantId,
      to: "all",
      data: {
        participant_id: meta.participantId,
      },
    });
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
    const meta = ws.deserializeAttachment() as { participantId: string; participantName: string } | null;
    if (meta) {
      this.connections.delete(meta.participantId);
      this.participants.delete(meta.participantId);
    }
  }

  private broadcast(excludeId: string, message: object) {
    const msgStr = JSON.stringify(message);
    for (const [id, ws] of this.connections) {
      if (id !== excludeId) {
        try {
          ws.send(msgStr);
        } catch {
          this.connections.delete(id);
        }
      }
    }
  }

  private sendTo(participantId: string, message: object) {
    const ws = this.connections.get(participantId);
    if (ws) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        this.connections.delete(participantId);
      }
    }
  }
}

// Worker fetch handler
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check
      if (path === "/health") {
        return jsonResponse({ status: "ok", timestamp: new Date().toISOString() }, corsHeaders);
      }

      // Create room
      if (path === "/api/rooms" && request.method === "POST") {
        const body = await request.json() as { name: string; created_by?: string; createdBy?: string; max_participants?: number; maxParticipants?: number };
        const roomId = crypto.randomUUID();

        const metadata: RoomMetadata = {
          id: roomId,
          name: body.name,
          createdBy: body.created_by || body.createdBy || 'unknown',
          createdAt: new Date().toISOString(),
          maxParticipants: body.max_participants || body.maxParticipants || 10,
        };

        await env.ROOM_METADATA.put(roomId, JSON.stringify(metadata), {
          expirationTtl: 7200, // 2 hours
        });

        return jsonResponse({
          room_id: roomId,
          created_at: metadata.createdAt,
        }, corsHeaders);
      }

      // Get room
      if (path.match(/^\/api\/rooms\/[^/]+$/) && request.method === "GET") {
        const roomId = path.split("/")[3];
        const metadata = await env.ROOM_METADATA.get(roomId);

        if (!metadata) {
          return jsonResponse({ error: "Room not found" }, corsHeaders, 404);
        }

        return jsonResponse(JSON.parse(metadata), corsHeaders);
      }

      // Join room
      if (path.match(/^\/api\/rooms\/[^/]+\/join$/) && request.method === "POST") {
        const roomId = path.split("/")[3];
        const metadata = await env.ROOM_METADATA.get(roomId);

        if (!metadata) {
          return jsonResponse({ error: "Room not found" }, corsHeaders, 404);
        }

        const body = await request.json() as { participantName?: string; participant_name?: string };
        const participantId = crypto.randomUUID();

        const token = await signJwt({
          room_id: roomId,
          participant_id: participantId,
          participant_name: body.participant_name || body.participantName || 'Guest',
          exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
          iat: Math.floor(Date.now() / 1000),
        }, env.JWT_SECRET);

        return jsonResponse({
          token,
          participant_id: participantId,
          ice_servers: [{ urls: "stun:stun.cloudflare.com:3478" }],
        }, corsHeaders);
      }

      // WebSocket connection
      if (path === "/ws") {
        const token = url.searchParams.get("token");
        if (!token) {
          return jsonResponse({ error: "Missing token" }, corsHeaders, 401);
        }

        const claims = await verifyJwt(token, env.JWT_SECRET);
        if (!claims) {
          return jsonResponse({ error: "Invalid token" }, corsHeaders, 401);
        }

        // Get room Durable Object
        const roomId = env.ROOMS.idFromName(claims.room_id);
        const room = env.ROOMS.get(roomId);

        return room.fetch(request);
      }

      // Cloudflare Calls API proxy
      if (path.startsWith("/cloudflare/")) {
        return handleCloudflareProxy(request, env, path, corsHeaders);
      }

      return jsonResponse({ error: "Not found" }, corsHeaders, 404);

    } catch (e) {
      console.error("Error:", e);
      return jsonResponse({ error: "Internal server error" }, corsHeaders, 500);
    }
  },
} satisfies ExportedHandler<Env>;

// Cloudflare Calls API proxy
async function handleCloudflareProxy(
  request: Request,
  env: Env,
  path: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const cfPath = path.replace("/cloudflare", "");
  const baseUrl = `https://rtc.live.cloudflare.com/v1/apps/${env.CLOUDFLARE_APP_ID}`;

  let targetUrl: string;
  let method = request.method;
  let body: string | undefined;

  if (cfPath === "/session" && method === "POST") {
    // Create session - no body needed
    targetUrl = `${baseUrl}/sessions/new`;
    body = undefined;
  } else if (cfPath.match(/^\/session\/[^/]+\/tracks\/new$/) && method === "POST") {
    // Add tracks
    const sessionId = cfPath.split("/")[2];
    targetUrl = `${baseUrl}/sessions/${sessionId}/tracks/new`;
    body = await request.text();
  } else if (cfPath.match(/^\/session\/[^/]+\/renegotiate$/) && method === "PUT") {
    // Renegotiate
    const sessionId = cfPath.split("/")[2];
    targetUrl = `${baseUrl}/sessions/${sessionId}/renegotiate`;
    body = await request.text();
  } else {
    return jsonResponse({ error: "Unknown Cloudflare endpoint" }, corsHeaders, 404);
  }

  const response = await fetch(targetUrl, {
    method,
    headers: {
      "Authorization": `Bearer ${env.CLOUDFLARE_APP_SECRET}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });

  const responseBody = await response.text();

  return new Response(responseBody, {
    status: response.status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function jsonResponse(data: object, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
