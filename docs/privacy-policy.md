# Privacy policy — Kiosk

**App:** Kiosk (Android package `com.kioskclock.app`)
**Developer:** [YOUR NAME]
**Contact:** [YOUR CONTACT EMAIL]
**Last updated:** [DATE YOU PUBLISH THIS]

---

## The short version

Kiosk is a clock. It has no account, no server, no analytics, no advertising
and no crash reporting. The developer receives nothing about you, because
there is nowhere for it to be sent.

Everything you configure is stored on your own device. Three optional features
make network requests, and each one only starts making them after you have
typed something into settings to turn it on. None of those requests goes to
the developer.

---

## What Kiosk stores, and where

All of it lives in the app's own private storage on your device
(`AsyncStorage`, which on Android is a database inside the app's sandbox).
There are exactly four things stored, under these keys:

| Key | What is in it |
|---|---|
| `kiosk.settings.v1` | Every setting: the face, colour, backdrop, 12/24-hour, seconds, date, keep-awake, night dimming hours and depth, burn-in guard, landscape lock, shuffle, custom hue, the now-playing endpoint URL you typed, the weather place name you typed and your temperature unit, the second-clock offset and its label, the countdown date and its label, and the battery toggle. |
| `kiosk.presets.v1` | Saved presets: a name you chose, and the *look* fields only — face, colour, backdrop, backdrop colour, wave speed, wave scale, custom hue. A preset deliberately does not store your weather location or your night schedule. |
| `kiosk.weather.place.v1` | The last weather place name you typed, together with the latitude, longitude and display label it resolved to. Cached so the same name is looked up once, ever. |
| `kiosk.founder.test.v1` | A single true/false flag recording whether the Founder pack is unlocked on this device. |

Android's own backup is switched off for this app (`allowBackup="false"` in
the manifest), so none of the above is copied to Google Drive or restored onto
a different device.

Nothing in that list is transmitted anywhere. It is read by the app to draw
the clock and nothing else.

---

## What leaves the device

Three network destinations, all optional, all off until you configure them.

### 1. MET Norway — the weather forecast

- **When:** only once you have typed a place into Settings → weather →
  location. With that field empty, no request is ever made.
- **Where:** `https://api.met.no/weatherapi/locationforecast/2.0/compact`
- **What is sent:** a latitude and a longitude, truncated to four decimal
  places (about eleven metres), plus a `User-Agent` header that identifies the
  app and links to its source repository —
  `kiosk-clock/1.0 (https://github.com/SeraphinHaeuptli/kiosk-clock)`. As with
  any HTTP request, MET's servers also see your device's IP address. Nothing
  else is sent: no identifier, no settings, no device details.
- **How often:** on launch, every thirty minutes while the clock is running,
  and when the app returns to the foreground.
- **Their terms:** MET Norway's
  [Terms of Service](https://api.met.no/doc/TermsOfService) state that if an
  app calls the API directly, the user's IP address is stored in MET's logs
  along with any coordinates used in the request, and that those logs are held
  in MET's own data centre in Oslo, Norway. Their privacy statement is linked
  from that page. Read it if this matters to you.

### 2. Nominatim (OpenStreetMap) — turning your typed place into coordinates

- **When:** once per place name, the first time you type it. The answer is
  written to `kiosk.weather.place.v1` and reused from then on, so a city you
  set today costs one lookup ever — not one per launch.
- **Where:** `https://nominatim.openstreetmap.org/search`
- **What is sent:** the text you typed, exactly as you typed it, in the query
  string — a city, a postcode or an address — plus the same `User-Agent`
  header and, unavoidably, your IP address.
- **Their terms:** the
  [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
  and the
  [OpenStreetMap Foundation privacy policy](https://osmfoundation.org/wiki/Privacy_Policy).
  The OSMF policy states that queries to its services are analysed for missing
  addresses and postcodes and that such data is provided to the OpenStreetMap
  community, that IP addresses stored by its analytics are shortened, and that
  detailed usage information is retained for a limited period. **Do not type an
  address into this field that you would not want a public mapping service to
  receive.** A city name is enough for a forecast.

### 3. A now-playing endpoint that you supply

- **When:** only if you type a URL into Settings → now playing → endpoint (or
  build the app with `EXPO_PUBLIC_NOW_PLAYING_ENDPOINT` set). There is no
  default endpoint. With the field empty, nothing is requested.
- **Where:** whatever URL you typed. The developer does not operate it, does
  not know what it is, and cannot see its responses.
- **What is sent:** a plain HTTP GET with an `Accept: application/json`
  header. No settings, no identifier and no other app data are put in the
  request. The server you chose sees your IP address, as any server you
  connect to does.
- **How often:** every five seconds while the media bar is enabled and an
  endpoint is set.
- **What comes back:** a track title, an artist and a playing flag. It is
  displayed and held in memory. It is not written to storage and is not sent
  anywhere.

That is the complete list. There is no fourth destination. You can check it
yourself: the only `fetch` calls in the whole codebase are in
`src/weather/source.ts` and `src/media/nowPlaying.ts`.

---

## Notification access on Android — what it is for and what it is not

This is the one genuinely powerful permission Kiosk can hold, so it is worth
being exact about.

**What Android is actually granting.** To read what is playing on your device,
an app must call `MediaSessionManager.getActiveSessions`. Android only allows
that call from an app that the user has given **Notification Access** to, and
the way an app expresses that grant is by declaring a
`NotificationListenerService`. There is no narrower permission available:
`MEDIA_CONTENT_CONTROL`, the one that would fit, is reserved for
system-privileged apps.

**What Kiosk does with it.** It calls `getActiveSessions`, takes the session
that is actually playing, and reads three typed fields off its metadata:
title, artist, and whether it is playing. Those three strings are drawn on the
screen. They are not stored and they are not transmitted.

**What Kiosk explicitly does not do.** The service that holds the grant —
`KioskNotificationListener` in `modules/now-playing` — is a class body with
nothing in it. It overrides no callbacks. That means Android never delivers a
notification to it, and so the app never receives, reads, parses, logs or
stores the contents of any notification: not your messages, not your email
previews, not your one-time codes, not anything else. The service exists only
to be enabled, because being an enabled listener is the condition Android
places on `getActiveSessions`.

The whole file is eleven lines including comments. It is in the public
repository. If you do not want to take this on trust, go and read it.

**It is entirely optional.** Kiosk never asks for it at startup and cannot turn
it on for you — only you can, in Android's own settings screen. If you never
grant it, everything else in the app works, and the media bar either uses the
endpoint you supplied or reads "nothing playing". You can revoke it at any
time in Android Settings → Apps → Special app access → Notification access.

---

## What Kiosk does not do

- **No account.** There is nothing to sign up for and nothing to sign in to.
- **No server.** The developer runs no backend. There is no address for your
  data to be sent to even in principle.
- **No analytics, no telemetry, no crash reporting.** No Firebase, no Sentry,
  no measurement SDK of any kind is in the dependency list.
- **No advertising.** No ad SDK, no ad identifier. The app never reads the
  Android Advertising ID or any other device identifier.
- **No tracking across apps or sites**, no profiles, no inferences.
- **No selling or sharing of personal information**, for any purpose, to
  anyone. There is nothing collected to sell.
- **No code arriving after install.** Over-the-air updates are disabled in the
  manifest, there is no WebView, and nothing is evaluated at runtime.

## Permissions

Kiosk declares two Android permissions and no others:

- `INTERNET` — for the three optional requests described above.
- `VIBRATE` — for the small haptic tick as the volume bar crosses each cell.

Three permissions that Expo's project template ships by default —
`SYSTEM_ALERT_WINDOW` (draw over other apps) and the two external-storage
permissions — are explicitly removed from the release manifest.

Notification Access, described above, is not a manifest permission; it is a
special access you grant in system settings and can withdraw there.

## In-app purchase

Kiosk is free to install. It offers one optional, one-off purchase — the
"Founder pack" — which unlocks most of the faces, backdrops and features. It
is not a subscription.

If you buy it, the transaction is handled entirely by Google Play. The app
never sees, handles or stores a card number, a billing address or any other
payment detail; it only records on your device whether the pack is unlocked.
Google's handling of the payment is covered by
[Google's privacy policy](https://policies.google.com/privacy) and your
purchase is subject to Google Play's terms, not to this policy.

## Children

Kiosk is not directed at children and is not part of Google Play's Families
programme. It contains no ads, no user-to-user features, no user accounts and
no user-generated content, and it collects no personal information from anyone
of any age. There is therefore no children's data for the developer to hold,
verify, or delete.

## How to delete your data

There is no server-side copy of anything, so there is nothing to request from
the developer. Everything is on your device and you control it directly:

- **Settings → reset → "reset all settings"** returns every setting to its
  default, including clearing the weather place name and the now-playing
  endpoint URL you had typed. To be precise, this rewrites `kiosk.settings.v1`
  only: it does **not** delete saved presets, the cached coordinates in
  `kiosk.weather.place.v1`, or the stored Founder-pack flag.
- **Presets** are deleted individually, with the `[x]` beside each one in
  Settings → presets.
- **Uninstalling Kiosk** removes all four storage keys and everything in them.
  Because Android backup is disabled for this app, there is no copy left
  behind in Google Drive to restore.

If you want a specific piece of data removed and the above does not cover it,
write to [YOUR CONTACT EMAIL] and it will be dealt with — though in practice
the answer will almost always be that the developer never had it.

Requests to MET Norway or to the OpenStreetMap Foundation about their own logs
have to go to them; the developer has no access to those systems.

## Changes to this policy

If the app's data handling changes, this page changes with it, and the "last
updated" date at the top moves. Because the app has no way to contact you, the
current version of this page is the only notice there can be.

## Contact

[YOUR NAME] — [YOUR CONTACT EMAIL]

Source code: <https://github.com/SeraphinHaeuptli/kiosk-clock>

---

---

# Hosting this page (required by Google Play)

Google Play requires a privacy policy at a **public URL** that anyone can open
without signing in, and that URL goes in Play Console → App content → Privacy
policy, and in the store listing. A link to a file inside a private repository
will not do.

Pick one of these. The first is the obvious choice for this project.

## Option A — GitHub Pages from this repository (recommended)

The repository is already public and already has a `docs/` folder, which is
one of the two publishing sources GitHub Pages accepts, so this costs nothing
and adds no new account anywhere.

**One gotcha first.** GitHub Pages runs Jekyll, and Jekyll only converts a
Markdown file to HTML if the file starts with YAML front matter. Without it,
`privacy-policy.md` is copied verbatim and the browser shows (or downloads)
raw Markdown. So step 1 is not optional.

1. Add three lines to the very top of `docs/privacy-policy.md`, above the
   `# Privacy policy — Kiosk` heading:

   ```
   ---
   title: Kiosk — Privacy policy
   ---
   ```

   Do the same for any other page in `docs/` you want rendered.

2. Commit and push to `main`.

3. On GitHub, go to the repository → **Settings** → **Pages** (left sidebar).

4. Under **Build and deployment**, set **Source** to *Deploy from a branch*.

5. Set **Branch** to `main` and the folder to **`/docs`**. Click **Save**.

6. Wait for the Pages build (the **Actions** tab shows it, usually under a
   minute). The banner at the top of the Pages settings screen then shows the
   live URL.

7. Your policy will be at:

   ```
   https://seraphinhaeuptli.github.io/kiosk-clock/privacy-policy.html
   ```

   (Jekyll renames `.md` to `.html`. Confirm the exact URL from the banner in
   step 6 rather than assuming it — the username casing is lowercased in the
   hostname.)

8. Open that URL in a private browsing window to prove it is public, then
   paste it into Play Console → App content → Privacy policy, and into Store
   presence → Main store listing → Privacy Policy.

Optional polish: add a `docs/_config.yml` containing
`theme: jekyll-theme-minimal` for readable typography, and a `docs/index.md`
(with its own front matter) linking to the policy, so the root of the site is
not a 404.

Alternative to step 1: instead of front matter on every file, put
`plugins: [jekyll-optional-front-matter]` in `docs/_config.yml` — that plugin
is on GitHub Pages' supported list and renders bare `.md` files. Front matter
is fewer moving parts.

## Option B — a GitHub Gist

Create a public gist containing this file. The rendered gist URL is public and
stable, and takes about a minute. It looks less official than a real page and
the URL is opaque, but Play accepts it. Reasonable as a stopgap on the day you
submit; move to Option A afterwards.

## Option C — Netlify Drop, Cloudflare Pages, or any static host

Convert this file to HTML and drop it on any static host. Cloudflare Pages and
Netlify both have free tiers that will build from this repository directly.
Worth it only if you want the policy on your own domain.

## Option D — a privacy-policy generator site

Do not. They produce boilerplate that claims things this app does not do —
cookies, analytics, third-party advertising partners — and a policy that
overstates your data collection is worse than no policy, because the Data
safety declaration then has to either contradict it or be wrong too.

## Whichever you pick

- The URL must be reachable over HTTPS, with no login and no interstitial.
- It must name the app, so a reviewer can tell it belongs to this listing.
- It must stay up for as long as the app is published. If it 404s, Play can
  remove the listing.
- Keep it in sync with `docs/data-safety.md`. If the two ever disagree, the
  Data safety declaration is the one that gets the app taken down.
