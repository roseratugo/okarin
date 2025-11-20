interface Env {
	FOUNDER_MEMBERS: KVNamespace;
	JWT_SECRET: string;
	CORS_ORIGIN: string;
}

interface FounderMember {
	id: string;
	email: string;
	passwordHash: string;
	salt: string;
	name: string;
	createdAt: string;
}

interface TokenPayload {
	sub: string;
	email: string;
	name: string;
	exp: number;
	iat: number;
}

async function hashPassword(password: string, salt: string): Promise<string> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: encoder.encode(salt),
			iterations: 100000,
			hash: 'SHA-256',
		},
		keyMaterial,
		256,
	);

	return btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
}

async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
	const computedHash = await hashPassword(password, salt);
	return computedHash === hash;
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		const corsHeaders = {
			'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			if (path === '/health') {
				return jsonResponse({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() }, corsHeaders);
			}

			if (path === '/api/auth/login' && request.method === 'POST') {
				const body = (await request.json()) as { email: string; password: string };

				if (!body.email || !body.password) {
					return jsonResponse({ error: 'Email and password are required' }, corsHeaders, 400);
				}

				const memberData = await env.FOUNDER_MEMBERS.get(body.email.toLowerCase());
				if (!memberData) {
					return jsonResponse({ error: 'Invalid credentials' }, corsHeaders, 401);
				}

				const member = JSON.parse(memberData) as FounderMember;

				const valid = await verifyPassword(body.password, member.salt, member.passwordHash);
				if (!valid) {
					return jsonResponse({ error: 'Invalid credentials' }, corsHeaders, 401);
				}

				const token = await signJwt(
					{
						sub: member.id,
						email: member.email,
						name: member.name,
						exp: Math.floor(Date.now() / 1000) + 86400 * 7,
						iat: Math.floor(Date.now() / 1000),
					},
					env.JWT_SECRET,
				);

				return jsonResponse(
					{
						token,
						user: {
							id: member.id,
							email: member.email,
							name: member.name,
						},
					},
					corsHeaders,
				);
			}

			if (path === '/api/auth/me' && request.method === 'GET') {
				const authHeader = request.headers.get('Authorization');
				if (!authHeader?.startsWith('Bearer ')) {
					return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
				}

				const token = authHeader.substring(7);
				const payload = await verifyJwt(token, env.JWT_SECRET);

				if (!payload) {
					return jsonResponse({ error: 'Invalid or expired token' }, corsHeaders, 401);
				}

				return jsonResponse(
					{
						user: {
							id: payload.sub,
							email: payload.email,
							name: payload.name,
						},
					},
					corsHeaders,
				);
			}

			if (path === '/api/auth/verify' && request.method === 'POST') {
				const body = (await request.json()) as { token: string };

				if (!body.token) {
					return jsonResponse({ error: 'Token is required' }, corsHeaders, 400);
				}

				const payload = await verifyJwt(body.token, env.JWT_SECRET);

				if (!payload) {
					return jsonResponse({ valid: false }, corsHeaders);
				}

				return jsonResponse(
					{
						valid: true,
						user: {
							id: payload.sub,
							email: payload.email,
							name: payload.name,
						},
					},
					corsHeaders,
				);
			}

			return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
		} catch (e) {
			console.error('Error:', e);
			return jsonResponse({ error: 'Internal server error' }, corsHeaders, 500);
		}
	},
} satisfies ExportedHandler<Env>;
