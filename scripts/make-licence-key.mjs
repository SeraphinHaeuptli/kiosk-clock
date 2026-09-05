/**
 * Makes the signing key, and mints founder keys with it.
 *
 * Run this on your own machine. The private half must never be committed,
 * pasted into a chat, or put in the app — anything inside an APK can be read
 * back out of it, and whoever has this key can mint unlimited free unlocks.
 * It belongs in one place: the environment of whatever signs keys after Stripe
 * says someone paid.
 *
 *   node scripts/make-licence-key.mjs --new
 *       A fresh pair. Put the public half in FOUNDER_PUBLIC_KEY in
 *       src/billing/licence.ts and commit that; keep the private half secret.
 *
 *   node scripts/make-licence-key.mjs --sign <private-hex> [reference]
 *       One founder key. The reference is anything that identifies the sale —
 *       a Stripe checkout session id is the obvious choice — and is hashed
 *       into an opaque 16 bytes, so no customer detail reaches the key or the
 *       device. Omit it for a random one.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { randomBytes } from 'node:crypto';

ed.hashes.sha512 = sha512;

const VERSION = 1;
const REF_BYTES = 16;
const TIME_BYTES = 6;
const PREFIX = 'KIOSK-';

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes) {
  let out = '';
  let accumulator = 0;
  let held = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    held += 8;
    while (held >= 6) {
      held -= 6;
      out += B64URL[(accumulator >> held) & 63];
    }
  }
  if (held > 0) out += B64URL[(accumulator << (6 - held)) & 63];
  return out;
}

const hex = (bytes) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const [mode, secret, reference] = process.argv.slice(2);

if (mode === '--new') {
  const priv = ed.utils.randomSecretKey();
  const pub = ed.getPublicKey(priv);
  console.log('public  (goes in src/billing/licence.ts, safe to commit)');
  console.log(`  ${hex(pub)}\n`);
  console.log('private (goes in your signing environment, never anywhere else)');
  console.log(`  ${hex(priv)}\n`);
  console.log('Losing the private key means every future key has to be reissued.');
  console.log('Leaking it means anyone can mint unlocks. Back it up offline.');
  process.exit(0);
}

if (mode === '--sign' && secret) {
  const priv = Uint8Array.from(Buffer.from(secret.trim(), 'hex'));
  if (priv.length !== 32) {
    console.error('The private key must be 64 hex characters.');
    process.exit(1);
  }

  // The reference is hashed rather than carried, so a checkout id — or
  // anything else identifying — never reaches the key or the buyer's phone.
  const ref = reference
    ? sha512(new TextEncoder().encode(reference)).slice(0, REF_BYTES)
    : randomBytes(REF_BYTES);

  const payload = new Uint8Array(1 + REF_BYTES + TIME_BYTES);
  payload[0] = VERSION;
  payload.set(ref, 1);

  let millis = Date.now();
  for (let i = TIME_BYTES - 1; i >= 0; i--) {
    payload[1 + REF_BYTES + i] = millis % 256;
    millis = Math.floor(millis / 256);
  }

  const signature = ed.sign(payload, priv);
  const blob = new Uint8Array(payload.length + signature.length);
  blob.set(payload);
  blob.set(signature, payload.length);

  console.log(PREFIX + toBase64Url(blob));
  process.exit(0);
}

console.error('usage: --new | --sign <private-hex> [reference]');
process.exit(1);
