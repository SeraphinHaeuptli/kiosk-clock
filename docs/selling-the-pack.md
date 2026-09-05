# Selling the founder pack

Three builds, three answers to "how does someone pay for this", and only one
of them can be live at a time.

| Build | How it sells | Set by |
|---|---|---|
| Play | Google Play Billing | default |
| Sideload / F-Droid, key configured | a signed key, bought anywhere | `FOUNDER_PUBLIC_KEY` set |
| Sideload / F-Droid, no key | it does not — everything is unlocked | the default |

**The split is not optional.** Google requires digital unlocks inside a
Play-distributed app to go through Play Billing; charging through Stripe there
is a policy violation, not a worse option. Equally, Play Billing cannot work in
a sideloaded app at all, because purchases only resolve for apps Play itself
installed. Neither build can do the other's job.

---

## How keys work

Someone taps buy, pays in a browser, and is emailed a key. They paste it into
the app once. From then on the app checks a signature and nothing else — no
account, no receipt, no network call, ever. It keeps working offline and on
every device they own.

A key is 122 characters and looks like `KIOSK-AWtoGiPtJK8j...`. Inside is a
version byte, sixteen bytes identifying the sale, a timestamp, and an Ed25519
signature over all of it. The app holds only the public half of the key, which
is why it can verify but not mint.

**Nothing about the buyer is in it.** The reference is a hash of whatever you
signed with — a Stripe checkout id is the obvious choice — so no email or name
reaches the key or the phone.

### What this costs you

A key is a bearer token. One posted publicly unlocks the app for whoever finds
it, and there is no revocation short of changing the public key in an update,
which would invalidate every key ever issued. The repository has always been
honest that the entitlement is a product decision rather than a lock; this
raises the effort from editing a stored value to finding someone else's key,
and no further. For a cosmetic unlock that is the right amount to spend.

The sixteen reference bytes exist so a leaked key is identifiable, and so a
future version could carry a short blocklist without punishing everyone.

---

## Setting it up

### 1. Make the signing key

```sh
node scripts/make-licence-key.mjs --new
```

Put the **public** half in `FOUNDER_PUBLIC_KEY` in `src/billing/licence.ts` and
commit it — it is meant to be public. Put the **private** half nowhere near
this repository. It belongs in the environment of whatever signs keys, and
nowhere else: anyone holding it can mint unlimited free unlocks, and losing it
means every key has to be reissued.

Set `FOUNDER_PAYMENT_URL` to your Stripe payment link and `FOUNDER_PRICE` to
what it charges. The price here is display text only — what the payment link
says is what binds.

### 2. Take the money

A Stripe **payment link** is enough. No server is needed to accept payment;
one is needed only to turn a payment into a key.

### 3. Turn payments into keys

A webhook on `checkout.session.completed`, doing what
`scripts/make-licence-key.mjs --sign` does:

```
payload  = [1] ++ sha512(session.id)[0..16] ++ now_ms_as_6_bytes
signature = ed25519_sign(payload, PRIVATE_KEY)
key      = "KIOSK-" ++ base64url(payload ++ signature)
```

Then email it to `session.customer_details.email`. The signing script is forty
lines and is the reference implementation; a serverless function is plenty.

**Verify the Stripe webhook signature before signing anything.** An unverified
endpoint that mints keys on request is an endpoint that mints keys for anyone
who finds it.

### 4. Check it end to end

Stripe test mode, a real card number from their test set, and confirm the
emailed key unlocks a build with your public key in it.

---

## Notes

- **Stripe requires you to be 18**, or the age of majority where you live, as
  do Google Play and most payment processors. There is no way around that one.
- The key format is versioned. The first byte is `1`; a future format can
  change it and old keys will simply stop verifying, so do not change it
  casually.
- None of this is in the Play build. `playBilling.ts` is untouched by it, and
  a Play build has no redeem field, no payment link and no key input.
