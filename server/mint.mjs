/**
 * Turns a paid Stripe checkout into a founder key.
 *
 * One endpoint, and Stripe sends people to it after they pay. It reads the
 * checkout session back from Stripe, refuses anything not actually paid,
 * signs a key, and shows it on a page the buyer can copy from.
 *
 * ---------------------------------------------------------------------------
 * Why a redirect page rather than a webhook and an email
 *
 * A webhook needs an email provider, an account with them, a domain that will
 * not land in spam, and a way to find out when delivery failed. This needs
 * none of that: Stripe already redirects after payment, and the key is shown
 * on the page. Re-opening the same URL shows the same key, because it is
 * derived from the session id rather than stored — so a lost key is one back
 * button away rather than a support conversation.
 *
 * The cost is that the buyer has to copy it there and then, and a receipt
 * email would have been a second copy. Send one later if you want; the key is
 * reproducible from the session id at any time.
 * ---------------------------------------------------------------------------
 *
 * A plain `fetch` handler, so it runs unmodified on Cloudflare Workers, Deno
 * Deploy, Vercel edge functions and Bun. See server/README.md.
 *
 * It needs two secrets, both from the environment and never from the request:
 *
 *   STRIPE_SECRET_KEY   sk_live_... or sk_test_...
 *   LICENCE_PRIVATE_KEY the 64 hex characters from `make-licence-key.mjs --new`
 *
 * Anyone holding LICENCE_PRIVATE_KEY can mint unlimited unlocks. It belongs
 * here and nowhere else — not in the app, not in the repository.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;

// Must match src/billing/licence.ts. server/mint.test.mjs fails if it drifts.
const VERSION = 1;
const REF_BYTES = 16;
const TIME_BYTES = 6;
const PREFIX = 'KIOSK-';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes) {
  let out = '';
  let acc = 0;
  let held = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    held += 8;
    while (held >= 6) {
      held -= 6;
      out += B64URL[(acc >> held) & 63];
    }
  }
  if (held > 0) out += B64URL[(acc << (6 - held)) & 63];
  return out;
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * The key for a sale.
 *
 * Deterministic in the session id, so the same purchase always yields the same
 * key and re-opening the page is safe. The timestamp is quantised to the day
 * for the same reason — a key that changed every second would mean the buyer
 * ended up with several, all valid, and no idea which to keep.
 */
export async function mintKey(sessionId, privateKeyHex) {
  const ref = sha512(new TextEncoder().encode(sessionId)).slice(0, REF_BYTES);

  const payload = new Uint8Array(1 + REF_BYTES + TIME_BYTES);
  payload[0] = VERSION;
  payload.set(ref, 1);

  const DAY = 86_400_000;
  let millis = Math.floor(Date.now() / DAY) * DAY;
  for (let i = TIME_BYTES - 1; i >= 0; i--) {
    payload[1 + REF_BYTES + i] = millis % 256;
    millis = Math.floor(millis / 256);
  }

  const signature = ed.sign(payload, fromHex(privateKeyHex));
  const blob = new Uint8Array(payload.length + signature.length);
  blob.set(payload);
  blob.set(signature, payload.length);
  return PREFIX + toBase64Url(blob);
}

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function page(title, body, key) {
  return `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#000; color:#e8e8e8; font:14px ui-monospace,Menlo,monospace }
  main { max-width:34rem; padding:2rem }
  h1 { font-size:1rem; letter-spacing:.2em; text-transform:uppercase;
       color:rgba(232,232,232,.55); font-weight:400 }
  code { display:block; padding:1rem; margin:1rem 0; border:1px solid rgba(232,232,232,.18);
         word-break:break-all; line-height:1.6; user-select:all; cursor:text }
  p { line-height:1.7; color:rgba(232,232,232,.55) }
</style>
<main><h1>${escape(title)}</h1>${body}${
    key ? `<code>${escape(key)}</code>` : ''
  }</main>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      return new Response(
        page('No session', '<p>This page is where Stripe sends you after paying.</p>'),
        { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    }

    let session;
    try {
      // Asked of Stripe rather than trusted from the query string: a session id
      // alone proves nothing, and this is the step that establishes the money
      // actually moved.
      const response = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } },
      );
      if (!response.ok) throw new Error(String(response.status));
      session = await response.json();
    } catch {
      return new Response(
        page('Could not check', '<p>Stripe did not answer. Reload in a moment — nothing is lost, and this page can be reopened.</p>'),
        { status: 502, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    }

    if (session.payment_status !== 'paid') {
      return new Response(
        page('Not paid', '<p>This checkout has not completed. If you have just paid, reload in a moment.</p>'),
        { status: 402, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    }

    const key = await mintKey(sessionId, env.LICENCE_PRIVATE_KEY);
    return new Response(
      page(
        'Your founder key',
        '<p>Copy this into Kiosk: settings, founder, already bought it. It works on every device you own and needs no connection.</p><p>Keep this page&rsquo;s address — reopening it shows the same key.</p>',
        key,
      ),
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          // Never a shared cache: the page contains a key.
          'cache-control': 'private, no-store',
        },
      },
    );
  },
};
