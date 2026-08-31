# Store listing copy — Kiosk

Text for Play Console → Store presence → Main store listing.
Graphics (icon, feature graphic, screenshots) are handled separately and are
not in this file.

## Before you publish any of this

**The founder-pack paragraph in the full description is false of the current
build.** `src/billing/index.ts` sets `activeBilling = testBilling`, which
writes an entitlement flag to local storage and charges nothing;
`src/billing/playBilling.ts` is a stub. Until `activeBilling` is switched to
`playBilling` and the managed product `founder_lifetime` is live in Play
Console, the app has no in-app purchase, and a reviewer who reads the source —
it is public — would find the listing claiming one that does not exist. Either
finish that work first, or cut the "founder pack" section and the word
"purchase" from the copy below and ship a free app.

**Never put a price in the description.** Play localises and tax-adjusts it
per country and shows it on the purchase sheet itself. The `€4.99` in
`src/billing/catalog.ts` is a placeholder for the test port, not a price.

**One more check before submitting:** the launcher label in `app.json` is
`Kiosk`. The Play listing title is a separate field and can differ, but if you
adopt one of the longer titles below it is tidier for the two to agree — that
is an `app.json` change, which is out of scope for this file.

---

## App title

Play's limit is **30 characters**. Play's metadata policy also forbids
all-caps (unless the brand genuinely is), promotional words ("free", "no ads",
"best", "#1"), and rank or price claims. So the in-app `KIOSK` wordmark cannot
be the title as it appears in the app.

The brief is right that **"Kiosk" alone is a bad title on Play**, and for a
sharper reason than genericness: on Play, "kiosk" is already owned by a
different product category. A search for it returns employee time-clock and
device-lockdown apps — ezClocker Kiosk Time Clock, Workday Time Kiosk,
TimeClock Plus Kiosk, Fully Kiosk Browser. A one-word "Kiosk" would compete in
those results, against that intent, and lose. It would also be near-impossible
for someone who has been told about the app to find it again.

### Three alternatives

| Title | Chars | Strategy |
|---|---|---|
| **Kiosk: Phosphor Clock** | 21 | keep the name, add the category noun, and claim an uncontested distinctive word |
| **Kiosk Terminal Clock** | 20 | keep the name, describe the idiom in a word people already understand |
| **Phosphor: Fullscreen Clock** | 26 | lead with the distinctive word, buy the high-volume search phrase |

### Recommendation: **Kiosk: Phosphor Clock**

Four reasons.

1. **"Kiosk" stays the first token.** It matches the package
   (`com.kioskclock.app`), the repository, the launcher label and the in-app
   wordmark. Whatever anyone already calls this app, they call it Kiosk, and
   the title should not throw that away.
2. **"Clock" is the word people type.** Play weights the title heavily in
   search, and "clock" is the category noun. A title without it is invisible
   to the query that actually matters. This is what "Kiosk" alone gets wrong.
3. **"Phosphor" does three jobs at once.** It is a rare token, so exact-match
   search for it is essentially uncontested and the app is findable by name
   from one word. It is *accurate* — amber and green phosphor tones, a CRT
   scanline backdrop, the whole terminal idiom — rather than decoration. And
   it separates this listing from the time-clock kiosks above, which is worth
   more than any keyword.
4. **It survives the rules.** 21 of 30 characters, no all-caps, no
   promotional language, no emoji, no punctuation Play objects to.

The one real cost: "phosphor" is a word some people will not know. That is
what the short description is for, and all three short descriptions below use
plain words.

**Why not the other two.** *Kiosk Terminal Clock* is good and safe, but
"terminal" collides with terminal-emulator and airport apps, so it buys less
separation than it looks like it does. *Phosphor: Fullscreen Clock* has the
best raw search fit — "fullscreen clock" is a phrase people genuinely type —
but "Fullscreen Clock" is already the exact name of an app on Play, so the
listing would be shadowed by an incumbent, and dropping "Kiosk" from the front
throws away the identity for a keyword.

**Caveat:** `play.google.com` is blocked from the environment this was written
in, so none of these were checked against Play's live catalogue. "Plausibly
unclaimed" here is an inference from general web search, not a verified
availability check. **Search Play for each candidate before committing** — the
title is changeable later, but the URL slug and people's memory of the name
are not.

---

## Short description

Limit **80 characters**. Shown under the title on the listing and in some
search results. All three are in the app's lowercase register; sentence case
is a safe alternative if lowercase reads as a typo to you.

**Option 1 — leads with the look** (69 chars)

> a full-screen clock in the idiom of a phosphor terminal. eight faces.

**Option 2 — leads with the use** (68 chars)

> eight full-screen clock faces, monochrome, built to be left running.

**Option 3 — leads with the inventory** (73 chars)

> a monochrome full-screen clock. eight faces, eight backdrops, no account.

Option 1 pairs best with the recommended title: it repeats "phosphor" in plain
context so the word in the title stops being a puzzle, and "full-screen clock"
carries the search phrase that the title does not have room for.

---

## Full description

Limit **4000 characters**. The version below is **3,923** — 77 characters of
headroom, so anything you add has to displace something. Plain text,
lowercase, no emoji, no exclamation marks, no invented quotes or awards, no
claim that is not true of the source.

**Paste it verbatim, including the line breaks, and do not re-wrap it.** Play
preserves newlines in this field, so each paragraph must stay on one long
line with a blank line between paragraphs — exactly as it is below. Hard-
wrapping it at 75 columns for readability would put a line break in the
middle of every sentence on the listing.

The notification-access paragraph is the one section that should not be cut or
shortened. Play expects a sensitive capability to be disclosed before install,
and disclosing it at this length — including the part about what it is *not* —
is also the honest answer to the question any careful user will have.

---

kiosk is a full-screen clock for a phone or tablet you have stopped carrying: a spare handset on a desk, a dock beside the bed, an old tablet on a shelf. one ink colour on black, everything on a character grid.

eight faces

digital plain digits, ascii character art from a couple of thousand small glyphs, stacked hours over minutes, a minimal analog dial, words ("it is twenty-five past three"), a split-flap board, an led matrix, and concentric dot rings — the time as a shape before it is a number.

eight backdrops

plain black, and five that read one continuous daylight value and drift through the day rather than switching: a brightening horizon, stars that thicken after dark, a dither field, a ground plane running to a vanishing point, crt scanlines. plus a drifting field of 2d perlin noise drawn as characters, and falling glyph columns. none is allowed to become the subject: each is tuned into the same luminance band.

one ink colour

white, amber, green, a warm accent, and a fifth you mix off a hue rail. colour carries no meaning here: state is shown with brackets and inverse video.

built to be left on

keep-awake, night dimming on your own hours and to your own depth, burn-in protection that drifts the face on a slow cycle, a landscape lock for a dock, both system bars hidden. tap anywhere for settings.

weather in the corners

temperature and conditions top left, the place and the day's range top right, for a location you type. forecast from the norwegian meteorological institute (met.no), places from openstreetmap nominatim. no gps and no location permission: kiosk knows only the place you typed, looked up once and remembered.

what is playing, and notification access

a now-playing line over a volume bar you drag sideways. the gesture is relative, so a stray tap cannot slam the volume; one haptic tick per cell crossed.

on android the track can come from the device itself, and that needs notification access. what that grant does, and does not do: android hands over the active media sessions only to an app with notification access, and the only way to ask for it is to declare a notification listener service. kiosk's listener overrides no callbacks, so android delivers no notification to it — the app never receives, reads or stores the contents of any notification: not messages, not email previews, not one-time codes. the title and artist come from android's media session manager, are drawn on screen, and go nowhere else. it is optional and never requested at launch: you turn it on in android's settings, and can revoke it there at any time. without it the media bar uses an http endpoint you supply, or says "nothing playing".

a line under the date

a second time zone, a countdown and the battery share one row. the second clock takes a fixed utc offset rather than a named zone: no timezone database, and no daylight saving.

presets and shuffle

name a look — bedside, desk, dock — and come back to it. a preset holds the look and nothing else, so restoring one does not move your weather to another city. shuffle rotates the look every quarter hour, hour or day, without writing to your settings.

what it does not do

no account, no sign-in, no server. no analytics, no crash reporting, no advertising. two permissions: internet and vibrate, and android backup is off. weather is requested only once you have typed a place; an endpoint is called only if you type one in. nothing goes to the developer, because there is no developer server.

the founder pack

free to install, and free to keep as a plain clock on plain black. one optional purchase, paid once — not a subscription — unlocks seven faces, seven backdrops, the accent colours, shuffle, the weather corners, a night schedule on your own hours, the second clock, the countdown and the battery. locked content is not hidden or disabled: it runs in full, under a watermark, so you can judge it by using it.

---

## What's new (first release)

Limit **500 characters**; the version below is **421**. This is the "release
notes" field on the production release, not part of the store listing page.
Same rule as above: paragraphs on one line each, blank line between.

---

first release.

eight clock faces, eight backdrops, five ink colours.

keep-awake, night dimming, burn-in protection and a landscape lock, for a device left running.

weather in the corners for a place you type. a now-playing line over a swipeable volume bar; on android the track can come from the device media session if you grant notification access.

presets, shuffle, a second time zone, a countdown and the battery.

---

## Things this copy deliberately does not say

Kept here so nobody adds them back in later.

- **No price.** Play supplies it, localised and tax-adjusted.
- **No "no ads" or "free" in the title.** Play's metadata policy treats those
  as promotional deal language in a title or developer name.
- **No superlatives, no rankings, no awards, no user quotes.** None exist, and
  Play forbids invented ones.
- **No claim of end-to-end encryption or security guarantees.** The
  entitlement check is client-side and the README says so; the listing should
  not imply otherwise.
- **No iOS.** The code is platform-neutral and exports clean for iOS, but this
  is a Play listing and the device-side now-playing feature is Android-only.
- **The fourth ink colour is not named.** In the app it is called "claude"
  (`#D97757` in `src/design/palette.ts`). The copy calls it "a warm accent",
  deliberately: putting another company's product name in a Play listing reads
  as an association you have not been granted, and Play's metadata policy is
  unfriendly to that. The in-app name can stay as it is.
- **No mention of the "unlicensed" watermark as a limitation of the free
  tier beyond what is written.** The description states plainly that locked
  content runs under a watermark, which is the honest version.
- **Optionally add** `source: github.com/SeraphinHaeuptli/kiosk-clock` as a
  final line — it is 48 characters plus a blank line, so it fits inside the 77
  characters of headroom without cutting anything else. It is a real, checkable claim and it is the strongest possible
  support for the notification-access paragraph — a reader can go and confirm
  the listener service is empty. Left out of the copy above only because
  publishing a personal GitHub handle in a store listing is your call, not
  mine. Note that the same URL already ships inside the app, in the
  `User-Agent` string in `src/weather/source.ts`.
