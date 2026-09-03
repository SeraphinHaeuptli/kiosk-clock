# Platform and integration notes

The detail that used to live in the README, kept because it is accurate
and hard-won. The README now leads with what the app is; this is how it
behaves on each platform, where its data comes from, and what it is
allowed to reach.

## Where the weather comes from

Two free services, both keyless, chosen in that order for a reason.

**Forecast: [MET Norway](https://api.met.no/)** (`locationforecast/2.0`). No
API key — a key shipped inside an APK is a key anyone can pull back out of it
— and the data is CC BY 4.0, which permits commercial use. Open-Meteo is the
nicer API and was the first choice until its terms settled it: the free tier
is non-commercial only, and this app sells a founder pack.

**Places: [Nominatim](https://nominatim.openstreetmap.org/)**, so a typed name
can become coordinates. MET does not geocode.

Both are paid for by somebody else, and both ask the same three things:

- **Identify yourself.** A real User-Agent with contact information, set in
  `src/weather/source.ts`. A generic one is blocked rather than throttled. If
  you fork this and publish it, change that string — it is how the operators
  reach whoever is generating the traffic.
- **Do not ask more often than the data changes.** The forecast is polled
  every thirty minutes; a place name is geocoded once, ever, and the answer is
  written to storage. Coordinates are truncated to four decimals because MET's
  cache is keyed on them, so full float precision turns every request into a
  miss.
- **Attribute.** The settings screen credits both.

One platform note: browsers forbid setting `User-Agent` from `fetch`, so on
the web build the header is silently dropped and the request may be refused or
fail CORS. Android sets it properly, which is the platform this is a kiosk
for.

---

## Connecting now playing

The bar reads "nothing playing" until you point it at an endpoint, either in
Settings → now playing → endpoint or via `EXPO_PUBLIC_NOW_PLAYING_ENDPOINT`
(see `.env.example`). Anything serving this shape works:

```json
{ "title": "Song name", "artist": "Artist", "playing": true }
```

`artist` is optional; `playing` is also accepted as `isPlaying`, or inferred
from a `status` field. The usual source is a small wrapper around `playerctl`
or MPRIS on whichever machine is actually playing the audio.

### Where the track comes from

The app resolves the best source for the device on launch and reports which it
picked, in Settings → now playing → on this device.

**Android reads it directly.** This is what scrobblers and lock-screen
replacements do: declare a `NotificationListenerService`, have the user grant
Notification Access, then call `MediaSessionManager.getActiveSessions` with
that service's `ComponentName` and read the structured `MediaMetadata` off each
`MediaController`. Parsing the media notification's text is the alternative and
is strictly worse — the metadata is already typed, so there is nothing to
scrape. The other route, `MEDIA_CONTENT_CONTROL`, is privileged-only and not
available to normal apps.

The service in `modules/now-playing` deliberately does nothing: no callbacks
are overridden and no notification content is ever inspected. It exists purely
to be enabled, because being an enabled listener is what makes
`getActiveSessions` callable. Settings offers a button that opens the system
screen where the grant is toggled; there is no callback for it, so the app
re-checks rather than waiting to be told.

**iOS cannot, at all.** `MPNowPlayingInfoCenter` is write-only — it publishes
what *your* app plays. `MPMusicPlayerController` reads only the built-in Music
app, not Spotify or anything else. Reading another app's session means the
private MediaRemote framework, which is not permitted on the App Store.

**Browsers cannot** read system media sessions either.

So the endpoint remains the fallback everywhere, and the only option on iOS. It
is still consulted on Android when the device reports nothing playing, because
the common arrangement is a phone on a desk beside the computer doing the
playing.

Provenance is always visible, because a broken source that silently shows
nothing is indistinguishable from silence:

| Mode | Meaning | Shown as |
|---|---|---|
| live | the endpoint answered | no tag |
| none | no endpoint configured | `[no source]` |
| stale | an endpoint is configured but the call failed | `[stale]` |

---

## Platform notes

**The monospace font is bundled, not borrowed.** Everything here sits on a
character grid, which only holds if every glyph has the same advance width.
Asking the platform for `monospace` does not guarantee that — Android OEM
skins substitute system fonts, and on a Galaxy S10 the alias resolved to a
proportional face, which collapsed the grid and smeared the character art into
illegibility. Shipping JetBrains Mono removes the variable: its advance is
exactly 0.6 em, which is the ratio the layout assumes, and every glyph the art
uses measures identically.

The ASCII face authors its digits as a 5x7 grid of `#` and ` `, then subdivides
each cell into a patch of small characters chosen by how buried the cell is in
the shape. Every character it uses is plain ASCII, so there is no exotic glyph
to fall back on.

The whole block is one `Text` holding newline-separated rows, not one `Text`
per row. Each element carries its own line box whose height comes from the
font's ascent and descent; at this size that is taller than the line height
being asked for, so per-row elements drift apart and the block outgrows any
height computed for it. The row pitch is also set slightly below the font size
so consecutive rows of ink overlap — at full pitch the vertical strokes break
into dashes.

The face is memoised, and the character art is memoised on the time it renders
rather than on the `Date`. The screen re-renders on every frame of a volume
drag, and without both the art rebuilt a five-thousand-glyph string per frame.

Both system bars are re-asserted whenever the window changes shape. Hiding them
once when the screen gains focus is not enough: Android restores them on a
configuration change, so rotating the device — or toggling the landscape lock,
which rotates it — brings them straight back.

Everything else is set in the platform monospace face (Menlo on iOS,
`monospace` on Android). Numerals additionally carry
`fontVariant: ['tabular-nums']`; this is often described as iOS-only, but
React Native 0.86 maps it to `Paint.setFontFeatureSettings("'tnum'")` on
Android, so the behaviour is the same on both.

On Android the kiosk screen hides the system navigation bar while it is
focused, and restores it when settings opens so the app stays navigable.

Device volume needs a native module, so it does **not** work in Expo Go — the
bar still moves and reads the level, but nothing is driven, and it says
"volume unavailable" rather than pretending. Build the APK for real control.
Every call into the module is guarded, so its absence degrades the control
instead of crashing the clock behind it.

---

## Running it on an iPhone

The app is built for Android and sold there, but nothing about it is
Android-only: the JS bundle already builds for iOS on every `npm run
bundle`, and every native dependency either supports iOS or is guarded so
its absence degrades one control instead of crashing the clock.

Three routes, cheapest first.

### 1. Expo Go — free, today, no Mac

On any computer on the same network as the phone:

```sh
git clone https://github.com/SeraphinHaeuptli/kiosk-clock
cd kiosk-clock
npm ci
npx expo start
```

Install Expo Go from the App Store and scan the QR code.

This covers nearly all of the app: every face, every backdrop, the hue
rail, all of settings, weather, the battery gauge, night dimming, presets.
It does not cover device volume (the native module is not in Expo Go, so
the bar reads "volume unavailable") or device now-playing, which is
Android-only on any build. Both degrade rather than fail.

### 2. EAS Build — a real app, no Mac, costs money

```sh
npm i -g eas-cli
eas login
eas device:create                # register the iPhone's UDID
eas build --platform ios --profile preview
```

EAS builds on its own macOS machines and hands back an install URL to open
on the phone. The `preview` profile is `distribution: internal`, which for
iOS means an ad-hoc build — and ad-hoc signing requires an **Apple
Developer Program membership (99 USD/year)**. There is no way around that
one: a free Apple ID cannot produce a build that installs on a device from
a cloud builder.

### 3. A Mac

```sh
npx expo run:ios --device       # a free Apple ID works; certificates last 7 days
npx expo run:ios                # simulator, free and unlimited
```

`eas build --platform ios --profile simulator` builds a simulator `.app`
without any Apple account at all, but a simulator still needs a Mac to run
in.

### So: no free standalone app on a physical iPhone without a Mac

Ad-hoc signing needs a paid Apple team; free personal signing needs Xcode.
Expo Go is the free route and it does run on the phone — it is just not a
separate icon on the home screen.

### What differs on iOS

- **Now playing reads nothing from the device.** iOS exposes no public API
  for another app's session, for the reasons above. The endpoint is the
  only source, and the transport keys stay hidden because there is nothing
  to drive.
- **The system bars toggle is half a toggle.** There is no navigation bar
  on iOS, so it governs the status bar alone; the settings hint says so on
  iOS and names both bars on Android.
- **Volume may not be settable.** `react-native-volume-manager` ships iOS
  code and reading works, but iOS restricts setting system volume
  programmatically. Untested on a device.
- **Purchases are Play-only.** `src/billing/playBilling.ts` talks to Google
  Play Billing; shipping on the App Store would mean StoreKit. Irrelevant
  for testing, since the founder pack has a test path.
- **iPad stays full screen.** `ios.requireFullScreen` is set, because an
  iPad app that keeps Slide Over and Split View cannot hold an orientation
  lock — and a kiosk clock sharing the screen with a browser is not a
  kiosk.

---

## Security posture

What this app can reach, and what it deliberately cannot.

**Permissions.** `INTERNET`, `VIBRATE`, and two that arrived with billing:
`com.android.vending.BILLING`, and `ACCESS_NETWORK_STATE`, which Google's
billing library uses to check for a connection before calling the store. None
of the four prompts. All four are asserted against the merged manifest on
every build, so a dependency cannot add a fifth quietly. Expo's template
ships `SYSTEM_ALERT_WINDOW` and the two external-storage permissions under a
comment reading "OPTIONAL PERMISSIONS, REMOVE WHATEVER YOU DO NOT NEED";
nothing here needs them, and draw-over-other-apps in particular is the
permission overlay attacks are built on and one Google Play scrutinises. They
are stripped in `app.json` via `blockedPermissions`.

**Notification access** is the one powerful grant, and the service that holds
it overrides no callbacks: it exists to be enabled, not to listen. No
notification is ever delivered to it, let alone read or stored. The track name
comes from `MediaSessionManager`, which hands back typed `MediaMetadata` —
title, artist, playing — and nothing else leaves the device.

**Backups are off.** `allowBackup="false"`, so settings and presets are not
copied to Google Drive and restored onto another device. This app has no
account and no server; its state should not travel without being asked to.

**The configured now-playing endpoint is untrusted input**, even though the
user typed it. Only `http(s)` URLs are fetched at all, the body is read as text
and rejected over 64 KB before parsing — `response.json()` would otherwise
buffer whatever a hostile or broken server sent — and decoded fields are
truncated. Cleartext `http` is separately refused by the platform at API 36.

**Nothing is evaluated.** No `eval`, no `dangerouslySetInnerHTML`, no
`WebView`, no dynamic imports of remote code, and OTA updates are disabled, so
there is no channel through which code could arrive after install.

**No secrets ship.** The two weather services need no API key, which is most of
why they were chosen: a key inside an APK is a key anyone can read back out.

Two things are known and unfixed, both documented where they live:

- The entitlement check is client-side, so a determined device owner can grant
  themselves the founder pack. For a cosmetic unlock that is the right trade;
  `playBilling.ts` says what server-side verification would take.
- Release APKs from CI are signed with the debug keystore. That is fine for
  sideloading a build to your own phone and unfit for anything else — the key
  is public, so it guarantees nothing about who produced the file.
