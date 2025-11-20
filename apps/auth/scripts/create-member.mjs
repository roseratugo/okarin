/**
 * Script to create a founder member
 *
 * Usage:
 * node scripts/create-member.mjs <email> <password> <name>
 *
 * Then copy the output and run the wrangler command
 */

import { webcrypto } from 'crypto';

const crypto = webcrypto;

async function hashPassword(password, salt) {
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

	return Buffer.from(derivedBits).toString('base64');
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 3) {
		console.log('Usage: node scripts/create-member.mjs <email> <password> <name>');
		console.log('Example: node scripts/create-member.mjs admin@example.com mypassword "Admin User"');
		process.exit(1);
	}

	const [email, password, name] = args;
	const salt = crypto.randomUUID();
	const passwordHash = await hashPassword(password, salt);

	const member = {
		id: crypto.randomUUID(),
		email: email.toLowerCase(),
		passwordHash,
		salt,
		name,
		createdAt: new Date().toISOString(),
	};

	const json = JSON.stringify(member);

	console.log('\n📋 Run this command to create the member:\n');
	console.log(`cd apps/auth && npx wrangler kv key put --binding FOUNDER_MEMBERS "${email.toLowerCase()}" '${json}'`);
	console.log('\n');
}

main().catch(console.error);
