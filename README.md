# Kiosk

A stylish, customizable clock for iOS and Android, built to be left running —
a StandBy-style kiosk face with a Claude session usage meter along the bottom.

Expo SDK 57 · React Native 0.86 · TypeScript (strict) · Expo Router.

## Run

No Mac and no Android Studio required. Install Expo Go from the Play Store,
then:

```bash
npm install
npm start          # scan the QR code with Expo Go
```

Every dependency is either an Expo SDK module or react-native-svg, all of which
ship inside Expo Go, so there is nothing to compile locally.

### Installing it as a real app

Every native feature here — keep-awake, hiding the navigation bar, orientation
lock, haptics — works inside Expo Go. The catch is that Expo Go loads the app
from the Metro server on your computer, so the phone needs your machine awake
and on the same network. For a clock meant to sit on a nightstand for days,
build a standalone APK instead; still no Android Studio, no JDK and no Mac:

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

The `preview` profile in `eas.json` produces a plain `.apk`. EAS gives you a
download link and a QR code; install it on the phone and grant "install from
unknown sources" when prompted.

For the Play Store, `--profile production` builds an `.aab` instead.

### iOS

The code is platform-neutral and `expo export --platform ios` bundles clean,
but producing an actual `.ipa` needs either a Mac or `eas build --platform ios`
with an Apple Developer account. Nothing in the app is iOS-only; the few
iOS-specific style properties (`borderCurve`) are silently ignored elsewhere.

### Verification

```bash
npm run typecheck  # tsc --noEmit
npm run bundle     # real Metro bundle for iOS, Android and web
```

## What it does

**Four faces.** Digital (`HH:MM` with the tint on the digits), Stack (hours over
minutes, readable across a room), Analog (a minimal dial), and Words
("it is twenty-five past three"). Each is one component that scales from a
single `size` prop, so the settings picker previews the real face rather than a
drawing of it.

**Styling.** Eight system accents, three backdrops (black, gradient, aurora),
three numeral weights, 12/24-hour, optional seconds and date.

**Kiosk behaviours.** Keep-awake, night dimming between 10 PM and 7 AM,
burn-in protection that drifts the face a few points on a slow cycle, and a
landscape lock for a dock or stand. Tap anywhere to reveal the settings button;
it fades out again after four seconds.

**Usage meter.** The rolling five-hour Claude session allowance as a percentage,
a bar, and a countdown to reset, with the weekly allowance alongside. The bar
turns amber past 75% and red past 90%.

## Connecting live usage

The meter shows sample data until you point it at an endpoint, either in
Settings → Claude Usage → Endpoint or via `EXPO_PUBLIC_CLAUDE_USAGE_ENDPOINT`
(see `.env.example`). Anything that serves this shape works:

```json
{
  "session": { "used": 0.62, "resetsAt": "2026-08-26T22:00:00Z" },
  "week":    { "used": 41, "limit": 100, "resetsInSeconds": 259200 }
}
```

`used` is either a 0–1 fraction or a count paired with `limit`. Reset time
accepts an ISO timestamp, an epoch in seconds or milliseconds, or
`resetsInSeconds`. `week` is optional.

Provenance is always visible, because a broken source that silently shows
plausible numbers is worse than no source:

| Mode | Meaning | Shown as |
|---|---|---|
| `live` | the endpoint answered | no pill |
| `sample` | no endpoint configured; demo data by design | grey "sample" |
| `stale` | an endpoint is configured but the call failed | amber "stale" |

## Platform notes

The clock's numerals use `fontVariant: ['tabular-nums']` so digits keep a fixed
advance width and the time doesn't shift as it ticks. This is often described
as iOS-only; it is not. React Native 0.86 maps it to
`Paint.setFontFeatureSettings("'tnum'")` on Android, so the behaviour is the
same on both.

On Android the kiosk screen hides the system navigation bar while it is
focused, and restores it when settings opens so the app stays navigable.
`borderCurve: 'continuous'` (Apple's squircle corners) is iOS-only and degrades
to ordinary rounded corners elsewhere.

## Layout

```
app/                    Routes only — thin wrappers around screens
  _layout.tsx           Providers + stack (settings is a modal)
  index.tsx             Kiosk
  settings.tsx          Settings

src/
  design/               Tokens and palette (iOS dark-mode system values)
  core/                 useNow, formatting, storage port, useDebounced
  clock/
    settings.ts         Domain: ClockSettings, defaults, decode
    SettingsContext.tsx State + debounced persistence
    faces/              One component per face + the registry
    KioskScreen.tsx     Composition
  usage/
    usage.ts            Domain: windows, thresholds
    sources.ts          Sample + HTTP sources, and the fallback that
                        distinguishes live / sample / stale
    useUsage.ts         Refresh on mount, each minute, and on foreground
    UsageBar.tsx        The meter
  ui/                   Reusable iOS-style list, segmented, swatch primitives
```

Dependencies point inward: `ui` and screens depend on `core` and `design`,
never the reverse, and nothing outside `core/storage.ts` knows AsyncStorage
exists.

### Conventions

- Adding a face means adding one entry to `src/clock/faces/index.ts`. Nothing
  else needs to change: the picker, the kiosk and persistence all read the
  registry.
- Settings loaded from disk go through `decodeSettings`, which falls back to
  defaults per field. Stored data outlives the schema that wrote it.
- Faces take a `size` in points and derive all their typography from it.
- No hardcoded colours outside `src/design/palette.ts`.

## Verified

`tsc --noEmit` clean, and `expo export` clean for iOS, Android and web.

Driven end to end in a browser against the real web build (Chromium/Playwright,
393×852, zero console errors): tap → reveal → settings → pick each of the four
faces → Done → back to kiosk.

- Word-clock phrasing checked at every boundary, including the hour rollover at
  :58 (23:58 → "it is twelve o'clock"); longest line measured at 301px against a
  375px viewport, so it cannot overflow.
- Analog hand angles verified against the rendered dial.
- Usage connector exercised against a live local endpoint: `used: 124,
  limit: 200` rendered as 62%, and an unreachable endpoint fell back to sample
  data with the amber "stale" pill rather than failing.
- Endpoint debounce measured: 22 keystrokes produce 2 requests, not 22.

Not verified: behaviour on physical hardware. Keep-awake, haptics, orientation
lock, hiding the Android navigation bar, and the native switch/modal appearance
are all real native modules that a browser cannot exercise — they need a device
or an emulator.

Also not done: the launcher icon is still Expo's scaffold artwork on a black
background. Replace `assets/icon.png` and
`assets/android-icon-foreground.png` to fix it.
