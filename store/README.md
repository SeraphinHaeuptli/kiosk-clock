# Store assets

Everything Google Play needs as an image, plus the listing text. All of it is
regenerable — nothing here was drawn by hand in an image editor.

## Files

| File | Spec Play enforces | Verified |
|---|---|---|
| `icon-512.png` | 512×512, 32-bit PNG | 512×512, opaque |
| `feature-graphic.png` | 1024×500, PNG/JPEG, no alpha | 1024×500, opaque |
| `screenshots/*.png` | 2–8 per form factor, 16:9 or 9:16, min side ≥320px, no alpha | 8 × 1080×1920, opaque |
| `copy.md` | — | title, descriptions, what's-new |

Play rejects alpha in the feature graphic and screenshots, so every file above
was checked for a non-opaque pixel rather than assumed.

## The screenshots

Real renders of the running app, not mockups. Each is a different face,
backdrop and ink colour, chosen to show the range rather than to be merely
different:

| # | Face | Backdrop | Ink |
|---|---|---|---|
| 01 | stack | horizon | amber |
| 02 | ascii | rain | green |
| 03 | matrix | scan | custom cyan |
| 04 | rings | stars | custom violet |
| 05 | words | grid | warm accent |
| 06 | flip | void | white |
| 07 | digital | wave | white |
| 08 | analog | dither | amber |

To regenerate: start the web build (`npx expo start --web --port 8082`) and
drive it with Playwright, seeding `kiosk.settings.v1` in localStorage and
stubbing the weather endpoints with `page.route` — `api.met.no` and
`nominatim.openstreetmap.org` are unreachable from CI. When faking `Date`,
leave `Date.now()` passing through to the real clock: freezing it also freezes
React Native's animation driver, and every animated backdrop renders as a blank
or half-finished frame.

## The icon

`icon-512.png` is the app's own `rings` face — concentric dials of discrete
dots — rather than a generic clock glyph. It reads as a dial down to 48px, it
is not confusable with the several hundred other clock icons on Play, and it is
a thing the app actually draws.

The same artwork is installed as the launcher icon (`assets/icon.png`), the
adaptive foreground and monochrome layers, and the web favicon. The adaptive
layers are drawn at two thirds scale inside a transparent tile, because Android
masks an adaptive icon to a circle and keeps only the middle of it.

Regenerate all sizes from one source: see the render script referenced in the
launch plan.

## The feature graphic

A designed banner rather than a screenshot — it is the one asset that is
allowed to be. Built as an HTML page and captured at exactly 1024×500, in the
app's own language: black ground, one monospace face, one accent colour, drawn
with characters and rules.
