/**
 * Signed founder keys, verified on the device without asking anyone.
 *
 * A sideloaded build has no store behind it, so an unlock has to arrive as
 * something the buyer can carry: a key, mailed to them after they pay, pasted
 * into the app once. The app checks a signature and nothing else — no account,
 * no server call, no network at all. A clock that has to reach the internet to
 * remember it was paid for is a clock that locks itself the first time the
 * wifi drops.
 *
 * Ed25519 rather than a shared secret, because a shared secret would have to
 * ship inside the app, and anything inside the app can be read back out of it.
 * The private half never leaves the machine that signs; the public half below
 * is meant to be public and is safe in a public repository.
 *
 * This is not a lock, and the repository has always said so: a client-side
 * entitlement is forgeable by whoever owns the device. What a signature buys
 * is that forging it takes deliberate work rather than editing a stored `true`,
 * and that keys are individually identifiable if one is ever passed around.
 * For a cosmetic unlock, that is the right amount of effort to spend.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// v3 of the library takes its hash by injection rather than bundling one.
ed.hashes.sha512 = sha512;

/**
 * The public half of the signing key, as 64 hex characters.
 *
 * Empty until you generate a pair with `scripts/make-licence-key.mjs` and
 * paste the public half here. While it is empty the app sells nothing and
 * unlocks everything, which is exactly what it did before keys existed.
 */
export const FOUNDER_PUBLIC_KEY: string = '';

/** Where `buy` sends people. A Stripe payment link, or anything that pays you. */
export const FOUNDER_PAYMENT_URL: string = '';

/** What the payment link charges, for display only. */
export const FOUNDER_PRICE: string = '';

export const KEY_PREFIX = 'KIOSK-';

const VERSION = 1;
const REF_BYTES = 16;
const TIME_BYTES = 6;
const PAYLOAD_BYTES = 1 + REF_BYTES + TIME_BYTES;
const SIGNATURE_BYTES = 64;

export interface Licence {
  /** Short, printable identifier for this key. Not personal. */
  ref: string;
  issuedAt: Date;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Written out rather than reached for, because `atob` is not something React
 * Native guarantees and a polyfill is a dependency for fifteen lines.
 */
function fromBase64Url(text: string): Uint8Array | null {
  const clean = text.replace(/=+$/, '');
  const bits = clean.length * 6;
  const bytes = new Uint8Array(Math.floor(bits / 8));

  let accumulator = 0;
  let held = 0;
  let out = 0;

  for (const character of clean) {
    const value = B64URL.indexOf(character);
    if (value < 0) return null;
    accumulator = (accumulator << 6) | value;
    held += 6;
    if (held >= 8) {
      held -= 8;
      bytes[out++] = (accumulator >> held) & 0xff;
    }
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Whether this build sells anything at all. */
export function licensingConfigured(): boolean {
  return FOUNDER_PUBLIC_KEY.length === 64;
}

/**
 * Read a key, or answer null.
 *
 * Never throws and never explains which part failed: a key is either one this
 * build accepts or it is not, and narrating the difference only helps someone
 * trying to manufacture one.
 */
export function verifyLicence(
  key: string,
  publicKeyHex: string = FOUNDER_PUBLIC_KEY,
): Licence | null {
  const publicKey = fromHex(publicKeyHex);
  if (publicKey === null || publicKey.length !== 32) return null;

  const trimmed = key.trim().replace(/\s+/g, '');
  if (!trimmed.startsWith(KEY_PREFIX)) return null;

  const blob = fromBase64Url(trimmed.slice(KEY_PREFIX.length));
  if (blob === null || blob.length !== PAYLOAD_BYTES + SIGNATURE_BYTES) {
    return null;
  }

  const payload = blob.subarray(0, PAYLOAD_BYTES);
  const signature = blob.subarray(PAYLOAD_BYTES);

  if (payload[0] !== VERSION) return null;

  try {
    if (!ed.verify(signature, payload, publicKey)) return null;
  } catch {
    // Malformed points and the like. Not a key.
    return null;
  }

  let millis = 0;
  for (let i = 0; i < TIME_BYTES; i++) {
    millis = millis * 256 + payload[1 + REF_BYTES + i];
  }

  return {
    ref: toHex(payload.subarray(1, 1 + REF_BYTES)).slice(0, 8),
    issuedAt: new Date(millis),
  };
}

/** Exported for the signing script and its tests. Never used by the app. */
export const LAYOUT = {
  VERSION,
  REF_BYTES,
  TIME_BYTES,
  PAYLOAD_BYTES,
  SIGNATURE_BYTES,
  KEY_PREFIX,
} as const;
