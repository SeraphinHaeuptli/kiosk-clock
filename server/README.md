# The key server

One endpoint. Stripe sends buyers to it after they pay; it checks with Stripe
that they really did, signs a key, and shows it.

Nothing else runs here. There is no database, no account, no session, and no
record of who bought what — the key is derived from the Stripe checkout id
each time the page is opened, so there is nothing to store and nothing to lose.

## What you need

Two secrets, set as environment variables where you deploy:

| | |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` while you are testing, `sk_live_…` after |
| `LICENCE_PRIVATE_KEY` | the 64 hex characters from `node scripts/make-licence-key.mjs --new` |

**`LICENCE_PRIVATE_KEY` is the whole security of this.** Anyone holding it can
mint unlimited unlocks. It goes here and nowhere else — never in the app, never
in this repository, never in a chat window. Back it up offline: losing it means
every key ever sold has to be reissued.

## Deploying

`mint.mjs` is a plain `fetch` handler, so it runs unmodified on several things.
Pick whichever you already have an account for.

**Cloudflare Workers** — free tier is far more than enough.

```sh
npm i -g wrangler
wrangler init kiosk-keys        # answer: existing script → server/mint.mjs
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put LICENCE_PRIVATE_KEY
wrangler deploy
```

**Deno Deploy** — `deno deploy` with the same two secrets set in the dashboard.

**Vercel** — put it in `api/mint.mjs` and export the handler as `GET`.

Whatever you choose, the dependencies are `@noble/ed25519` and `@noble/hashes`
and nothing else. No Stripe SDK: it talks to their REST API with `fetch`.

## Pointing Stripe at it

In the payment link's settings, set the confirmation page to **redirect to
your own page**, with:

```
https://your-worker.example.workers.dev/?session_id={CHECKOUT_SESSION_ID}
```

Stripe substitutes the real id. That is the whole integration.

## Then, in the app

Put the **public** half of the key pair in `FOUNDER_PUBLIC_KEY` in
`src/billing/licence.ts`, the payment link in `FOUNDER_PAYMENT_URL`, and what
it charges in `FOUNDER_PRICE`. Until `FOUNDER_PUBLIC_KEY` is set the app sells
nothing and unlocks everything, which is a safe place to be but not a shop.

## Checking it works

```sh
npm run test:mint
```

Proves the server and the app still agree about the key format. They hold it
separately, so drift between them is possible and would reject every key ever
sold — the worst failure this system has, and the quietest. CI runs it.

Then, end to end: Stripe **test mode**, one of their test card numbers, and
confirm the key on the redirect page unlocks a build carrying your public key.

## What this deliberately does not do

- **No email.** The key is on the page. Re-opening the same URL shows the same
  key, so a lost one is a back button rather than a support request. Send a
  receipt yourself if you want; the key is reproducible from the session id.
- **No revocation.** A key is a bearer token. See `docs/selling-the-pack.md`.
- **No refund handling.** A refunded purchase keeps working. For a cosmetic
  unlock at this price, chasing that costs more than it saves.
