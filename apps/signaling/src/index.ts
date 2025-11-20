import { DurableObject } from 'cloudflare:workers';

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
	room_id?: string;
	participant_id?: string;
	participant_name?: string;
	sub?: string;
	email?: string;
	name?: string;
	exp: number;
	iat: number;
}

async function signJwt(payload: TokenPayload, secret: string): Promise<string> {
	const header = { alg: 'HS256', typ: 'JWT' };
	const encodedHeader = btoa(JSON.stringify(header)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
	const encodedPayload = btoa(JSON.stringify(payload)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${encodedHeader}.${encodedPayload}`));

	const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
		.replaceAll('=', '')
		.replaceAll('+', '-')
		.replaceAll('/', '_');

	return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJwt(token: string, secret: string): Promise<TokenPayload | null> {
	try {
		const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
		if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);

		const signatureBytes = Uint8Array.from(atob(encodedSignature.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));

		const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(`${encodedHeader}.${encodedPayload}`));

		if (!valid) return null;

		const payload = JSON.parse(atob(encodedPayload.replaceAll('-', '+').replaceAll('_', '/'))) as TokenPayload;

		if (payload.exp < Date.now() / 1000) return null;

		return payload;
	} catch {
		return null;
	}
}

function jsonResponse(data: object, corsHeaders: Record<string, string>, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			...corsHeaders,
			'Content-Type': 'application/json',
		},
	});
}

export class Room extends DurableObject<Env> {
	private readonly participants: Map<string, Participant> = new Map();
	private readonly connections: Map<string, WebSocket> = new Map();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		for (const ws of this.ctx.getWebSockets()) {
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
		}
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.headers.get('Upgrade') === 'websocket') {
			const token = url.searchParams.get('token');
			if (!token) {
				return new Response('Missing token', { status: 401 });
			}

			const claims = await verifyJwt(token, this.env.JWT_SECRET);
			if (!claims?.participant_id || !claims.participant_name || !claims.room_id) {
				return new Response('Invalid token', { status: 401 });
			}

			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);

			this.ctx.acceptWebSocket(server);
			server.serializeAttachment({
				participantId: claims.participant_id,
				participantName: claims.participant_name,
			});

			this.connections.set(claims.participant_id, server);

			const existingParticipants = Array.from(this.participants.values()).filter((p) => p.id !== claims.participant_id);

			for (const participant of existingParticipants) {
				if (participant.sessionId && participant.tracks) {
					server.send(
						JSON.stringify({
							type: 'cloudflare-session',
							roomId: claims.room_id,
							participantId: participant.id,
							participantName: participant.name,
							sessionId: participant.sessionId,
							tracks: participant.tracks,
						}),
					);
				}
			}

			this.broadcast(claims.participant_id, {
				type: 'join',
				from: claims.participant_id,
				to: 'all',
				data: {
					participant_id: claims.participant_id,
					participant_name: claims.participant_name,
				},
			});

			this.participants.set(claims.participant_id, {
				id: claims.participant_id,
				name: claims.participant_name,
			});

			return new Response(null, { status: 101, webSocket: client });
		}

		return new Response('Expected WebSocket', { status: 400 });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== 'string') return;

		const meta = ws.deserializeAttachment() as { participantId: string; participantName: string } | null;
		if (!meta) return;

		try {
			const data = JSON.parse(message);
			const msgType = data.type;

			switch (msgType) {
				case 'cloudflare-session': {
					const participant = this.participants.get(meta.participantId);
					if (participant) {
						participant.sessionId = data.sessionId;
						participant.tracks = data.tracks;
						this.participants.set(meta.participantId, participant);
					}

					ws.serializeAttachment({
						participantId: meta.participantId,
						participantName: meta.participantName,
						sessionId: data.sessionId,
						tracks: data.tracks,
					});

					this.broadcast(meta.participantId, data);
					break;
				}

				case 'track-state': {
					this.broadcast(meta.participantId, data);
					break;
				}

				default: {
					if (data.to === 'all') {
						this.broadcast(meta.participantId, data);
					} else {
						this.sendTo(data.to, data);
					}
				}
			}
		} catch (e) {
			console.error('Failed to parse message:', e);
		}
	}

	async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
		const meta = ws.deserializeAttachment() as { participantId: string; participantName: string } | null;
		if (!meta) return;

		this.connections.delete(meta.participantId);
		this.participants.delete(meta.participantId);

		this.broadcast(meta.participantId, {
			type: 'leave',
			from: meta.participantId,
			to: 'all',
			data: {
				participant_id: meta.participantId,
			},
		});
	}

	async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
		console.error('WebSocket error:', error);
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

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		const corsHeaders = {
			'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			if (path === '/health') {
				return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() }, corsHeaders);
			}

			if (path === '/api/rooms' && request.method === 'POST') {
				const authHeader = request.headers.get('Authorization');
				if (!authHeader?.startsWith('Bearer ')) {
					return jsonResponse({ error: 'Unauthorized - Founder member login required' }, corsHeaders, 401);
				}

				const token = authHeader.substring(7);
				const claims = await verifyJwt(token, env.JWT_SECRET);
				if (!claims) {
					return jsonResponse({ error: 'Invalid or expired token' }, corsHeaders, 401);
				}

				const body = (await request.json()) as {
					name: string;
					max_participants?: number;
					maxParticipants?: number;
				};
				const roomId = crypto.randomUUID();

				const metadata: RoomMetadata = {
					id: roomId,
					name: body.name,
					createdBy: claims.email || claims.sub || 'unknown',
					createdAt: new Date().toISOString(),
					maxParticipants: body.max_participants || body.maxParticipants || 10,
				};

				await env.ROOM_METADATA.put(roomId, JSON.stringify(metadata), {
					expirationTtl: 7200,
				});

				return jsonResponse(
					{
						room_id: roomId,
						created_at: metadata.createdAt,
					},
					corsHeaders,
				);
			}

			if (/^\/api\/rooms\/[^/]+$/.exec(path) && request.method === 'GET') {
				const roomId = path.split('/')[3];
				const metadata = await env.ROOM_METADATA.get(roomId);

				if (!metadata) {
					return jsonResponse({ error: 'Room not found' }, corsHeaders, 404);
				}

				return jsonResponse(JSON.parse(metadata), corsHeaders);
			}

			if (/^\/api\/rooms\/[^/]+\/join$/.exec(path) && request.method === 'POST') {
				const roomId = path.split('/')[3];
				const metadata = await env.ROOM_METADATA.get(roomId);

				if (!metadata) {
					return jsonResponse({ error: 'Room not found' }, corsHeaders, 404);
				}

				const body = (await request.json()) as { participantName?: string; participant_name?: string };
				const participantId = crypto.randomUUID();

				const token = await signJwt(
					{
						room_id: roomId,
						participant_id: participantId,
						participant_name: body.participant_name || body.participantName || 'Guest',
						exp: Math.floor(Date.now() / 1000) + 86400,
						iat: Math.floor(Date.now() / 1000),
					},
					env.JWT_SECRET,
				);

				return jsonResponse(
					{
						token,
						participant_id: participantId,
						ice_servers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
					},
					corsHeaders,
				);
			}

			if (path === '/ws') {
				const token = url.searchParams.get('token');
				if (!token) {
					return jsonResponse({ error: 'Missing token' }, corsHeaders, 401);
				}

				const claims = await verifyJwt(token, env.JWT_SECRET);
				if (!claims?.room_id) {
					return jsonResponse({ error: 'Invalid token' }, corsHeaders, 401);
				}

				const roomId = env.ROOMS.idFromName(claims.room_id);
				const room = env.ROOMS.get(roomId);

				return room.fetch(request);
			}

			if (path.startsWith('/cloudflare/')) {
				return handleCloudflareProxy(request, env, path, corsHeaders);
			}

			return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
		} catch (e) {
			console.error('Error:', e);
			return jsonResponse({ error: 'Internal server error' }, corsHeaders, 500);
		}
	},
} satisfies ExportedHandler<Env>;

async function handleCloudflareProxy(request: Request, env: Env, path: string, corsHeaders: Record<string, string>): Promise<Response> {
	const cfPath = path.replace('/cloudflare', '');
	const baseUrl = `https://rtc.live.cloudflare.com/v1/apps/${env.CLOUDFLARE_APP_ID}`;

	let targetUrl: string;
	const method = request.method;
	let body: string | undefined;

	if (cfPath === '/session' && method === 'POST') {
		targetUrl = `${baseUrl}/sessions/new`;
		body = undefined;
	} else if (/^\/session\/[^/]+\/tracks\/new$/.exec(cfPath) && method === 'POST') {
		const sessionId = cfPath.split('/')[2];
		targetUrl = `${baseUrl}/sessions/${sessionId}/tracks/new`;
		body = await request.text();
	} else if (/^\/session\/[^/]+\/renegotiate$/.exec(cfPath) && method === 'PUT') {
		const sessionId = cfPath.split('/')[2];
		targetUrl = `${baseUrl}/sessions/${sessionId}/renegotiate`;
		body = await request.text();
	} else {
		return jsonResponse({ error: 'Unknown Cloudflare endpoint' }, corsHeaders, 404);
	}

	const response = await fetch(targetUrl, {
		method,
		headers: {
			Authorization: `Bearer ${env.CLOUDFLARE_APP_SECRET}`,
			...(body ? { 'Content-Type': 'application/json' } : {}),
		},
		...(body ? { body } : {}),
	});

	const responseBody = await response.text();

	return new Response(responseBody, {
		status: response.status,
		headers: {
			...corsHeaders,
			'Content-Type': 'application/json',
		},
	});
}
