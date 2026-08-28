# Kiosk

A monochrome, customisable clock for Android and iOS, built to be left
running — a full-bleed kiosk face with a now-playing line and a swipeable
volume control along the bottom, drawn in the idiom of a phosphor terminal.

Expo SDK 57 · React Native 0.86 · TypeScript (strict) · Expo Router.

## Run

Everything below works from Linux or Windows. Nothing here needs a Mac, and
nothing needs an app store.

### On the computer itself

```bash
npm install
npm run web
```

Opens in the browser; press F11 for fullscreen. Web is a checked target, not an
afterthought — it is exported and verified alongside iOS and Android — so this
is the quickest way to put the clock on a spare monitor or a Linux desktop.

### On an Android phone, with Expo Go

```bash
npm start          # then scan the QR code
```

Expo Go is usually installed from the Play Store, but it does not have to be:
Expo publishes the APK for direct download at
[expo.dev/go](https://expo.dev/go), selectable by SDK version — pick SDK 57 to
match this project. Install it by opening the file on the phone, or over USB
with `adb install expo-go-*.apk`. On Debian or Ubuntu, `adb` comes from
`sudo apt install android-tools-adb`; on Arch, `pacman -S android-tools`.

Every dependency here is an Expo SDK module or react-native-svg, all of which
ship inside Expo Go, so nothing is compiled locally.

### As a standalone APK, straight from GitHub

Expo Go loads the app from the Metro server on your computer, which is no good
for a clock meant to run unattended. A standalone build has no such tie, and
you need nothing installed locally to get one — GitHub's runners already carry
the Android SDK.

**Tag a release** and the APK is attached to it, downloadable as a plain URL
the phone can install from directly:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

**Or run it on demand**: Actions tab → *Android APK* → *Run workflow*, then
download the `kiosk-apk` artifact from the finished run. That arrives as a
`.zip`, so it needs unzipping first — the release route is easier on a phone.

Either way, open the `.apk` on the device and allow "install from unknown
sources". The build is universal, so it installs on any modern Android device
including arm64 handsets like the Galaxy S10.

It is signed with the debug keystore that `expo prebuild` generates — which is
what the React Native template configures for release builds, and is fine for
sideloading. It is *not* fit for the Play Store, and because the keystore is
regenerated per run you cannot upgrade one build over another; uninstall first.

### Building the APK yourself

With a JDK 17+ and an Android SDK installed:

```bash
./scripts/build-apk.sh
```

It checks the toolchain, verifies native dependency versions, regenerates the
native project and assembles the APK into `kiosk-clock.apk`. If a prerequisite
is missing it says exactly what to install.

If you have an Expo account and would rather build in their cloud, `eas.json`
carries the profiles: `eas build --platform android --profile preview` for an
APK, `--profile production` for a Play Store `.aab`.

### On an Android emulator under Linux

Install Android Studio, or just the command-line tools, then create an AVD and
boot it. `npm run android` picks up any running emulator or any USB device with
debugging enabled. Hardware acceleration needs KVM — check with
`kvm-ok` (from `cpu-checker`) and make sure your user is in the `kvm` group.

### iOS

The code is platform-neutral and `expo export --platform ios` bundles clean,
but producing an `.ipa` needs a Mac or `eas build --platform ios` with an Apple
Developer account. Nothing in the app is iOS-only; the iOS-specific style
properties (`borderCurve`) are silently ignored elsewhere.

### Verification

```bash
npm run typecheck  # tsc --noEmit
npm run bundle     # real Metro bundle for iOS, Android and web
```

## What it does

**Five faces.** ASCII (the time as character art — roughly two and a half
thousand small glyphs arranged into the digits), Digital, Stack
(hours over minutes, readable across a room), Analog (a minimal dial), and
Words ("it is twenty-five past three"). Each is one component that scales from
a single `size` prop, so the settings picker previews the real face rather than
a drawing of it.

**One ink colour.** White by default, with amber and green — the phosphors —
and Claude's own `#d97757`. Colour carries no meaning anywhere in the
interface, so nothing has to be decoded; state is shown with brackets, rules
and inverse video instead.

**Five backdrops.** `void` is plain black. Three read a single continuous
daylight value — 0 at midnight, 1 at midday, on a cosine — so they drift
rather than switch: `horizon` brightens overhead through the day, `stars` come
out after dark and are gone by noon, and `dither` thickens its character field
toward midday and thins to a dusting overnight.

`wave` is a drifting field of 2D Perlin noise rendered as characters, with its
own controls: speed (including *still*), noise frequency from fine to coarse,
and a colour that either follows the clock's tone or overrides it. Speed
changes how far the field advances per frame rather than how often it redraws,
so the cost of the animation is flat however fast it looks.

**Kiosk behaviours.** Keep-awake, night dimming between 10 PM and 7 AM,
burn-in protection that drifts the face a few points on a slow cycle, a
landscape lock for a dock or stand, and both system bars — status and
navigation — hidden while the clock is up, re-asserted on every rotation.
Tap anywhere for the settings button; it fades out again after four seconds.

**Audio bar.** What is playing, over a volume control you drag sideways. The
gesture is relative rather than absolute: a swipe moves the level by how far
the finger travelled, so a stray tap on the bar cannot slam the volume to
wherever it landed — the wrong behaviour for a device sitting on a desk. One
haptic tick per cell crossed, the way a physical volume wheel detents.

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

Reading another app's media session **on the device itself** is not wired up.
Android needs a `NotificationListenerService` and a permission the user grants
in system settings; iOS does not expose other apps' now-playing at all. The
endpoint is the portable answer.

Provenance is always visible, because a broken source that silently shows
nothing is indistinguishable from silence:

| Mode | Meaning | Shown as |
|---|---|---|
| live | the endpoint answered | no tag |
| none | no endpoint configured | `[no source]` |
| stale | an endpoint is configured but the call failed | `[stale]` |

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

## Layout

```
app/                    Routes only — thin wrappers around screens
  _layout.tsx           Providers + stack (settings is a modal)
  index.tsx             Kiosk
  settings.tsx          Settings

src/
  design/               Tokens and the monochrome palette
  core/                 useNow, daylight, formatting, storage port,
                        seeded noise, 2D Perlin, useDebounced
  clock/
    settings.ts         Domain: ClockSettings, defaults, decode
    SettingsContext.tsx State + debounced persistence
    faces/              One component per face, the 5x7 glyph table,
                        and the registry
    Backdrop.tsx        The four backdrops
    KioskScreen.tsx     Composition
  media/
    volume.ts           Domain: level, clamping, formatting
    systemVolume.ts     Guarded adapter over the native volume module
    useVolume.ts        Optimistic level, reconciled by the OS listener
    nowPlaying.ts       Domain + HTTP source with live / none / stale
    useNowPlaying.ts    Refresh on mount, on an interval, and on foreground
    MediaBar.tsx        Now playing + the swipeable volume bar
  ui/Terminal.tsx       Headings, checks, choices, fields
```

Dependencies point inward: `ui` and screens depend on `core` and `design`,
never the reverse, and nothing outside `core/storage.ts` knows AsyncStorage
exists.

### Conventions

- Adding a face means adding one entry to `src/clock/faces/index.ts`. Nothing
  else needs to change: the picker, the kiosk and persistence all read the
  registry.
- Settings loaded from disk go through `decodeSettings`, which falls back to
  defaults per field. Stored data outlives the schema that wrote it — including
  settings naming faces, backdrops or accent colours that no longer exist.
- Faces take a `size` in points and derive all their typography from it.
- No hardcoded colours outside `src/design/palette.ts`.
- Backdrops receive a quantised `light` value rather than the current time, so
  the memo holds and they redraw a few times an hour instead of once a second.

## Verified

`tsc --noEmit` clean, and `expo export` clean for iOS, Android and web.

Driven end to end in a browser against the real web build (Chromium/Playwright,
zero console errors): tap → reveal → settings → each of the five faces → Done →
back to kiosk, plus switching tone and cycling every backdrop. Re-run at
852x393 to confirm every face survives landscape.

- Rendered at two times of day to confirm the backdrops actually differ:
  `stars` invisible at midday and dense at night, `dither` inverted.
- Word-clock phrasing checked at every boundary, including the hour rollover at
  :58 (23:58 → "it is twelve o'clock"); longest line measured at 268px against
  a 375px viewport, so it cannot overflow.
- Layout checked at 1920x1080, 852x393 (landscape) and 393x852 (portrait). The
  usage meter caps at 560px and centres on the wider two.
- Usage connector exercised against a live local endpoint: `used: 124,
  limit: 200` rendered as 62%, and an unreachable endpoint fell back to sample
  data flagged `[stale]` rather than failing.
- Endpoint debounce measured: 22 keystrokes produce 2 requests, not 22.

Not verified: behaviour on physical hardware, and the APK workflow itself,
which has never been executed — this repository's Actions runs are the first
time it will have run anywhere. Keep-awake, haptics, orientation lock, hiding
the system bars and the native modal and alert appearance are all real native
modules a browser cannot exercise. The signing path was checked by generating
the native project and reading the release `signingConfig`, not by producing
an APK.

Also not done: the launcher icon is still Expo's scaffold artwork on a black
background. Replace `assets/icon.png` and
`assets/android-icon-foreground.png` to fix it.
