# Play Console — Data safety form

Answers for **Kiosk** (`com.kioskclock.app`), with the reasoning behind each
one so a human can check it rather than trust it.

Every answer below is derived from the source, not from the README. The
network surface of the whole app is two files — `src/weather/source.ts` and
`src/media/nowPlaying.ts` — and they contain the only three `fetch` calls in
the codebase. Storage is four `AsyncStorage` keys, listed in
`docs/privacy-policy.md`.

---

## Read this before filling the form in

Two things in the code do not yet match the app being described.

1. **There is no real in-app purchase in the current build.**
   `src/billing/index.ts` sets `activeBilling = testBilling`. `testBilling`
   writes an entitlement flag to local storage and charges nothing;
   `playBilling.ts` is a stub whose four methods return "unavailable". A
   release built from `main` today therefore gives the Founder pack away to
   anyone who taps the button, and the store listing must not claim a
   purchase exists until step 5 of the recipe in `playBilling.ts` (flip
   `activeBilling` to `playBilling`) is done. Everything below marked
   *"once billing is real"* is written for the shipped app, not for today's
   `main`.

2. **`isFetchable` in `src/media/useNowPlaying.ts` accepts `http://` as well
   as `https://`.** The release manifest does not set
   `android:usesCleartextTraffic`, and the app targets API 36
   (`targetSdk = "36"` in React Native 0.86's Gradle version catalog, which
   Expo's autolinking reads), where the platform default is to refuse
   cleartext — so such a request fails in practice, but the *code* permits it.
   Before answering "yes, all data is encrypted in transit" (Q2 below),
   tighten that regex to
   `/^https:\/\//i`. Then the answer is true of the code as well as of the
   platform, and stays true if the target API level is ever lowered.

---

## Definitions this form turns on

Play's two load-bearing definitions, quoted so the reasoning below can be
checked against them:

- **Collected** — "data is transmitted off the user's device, either to you or
  a third party", including data transmitted by any library or SDK in the app,
  regardless of whose server receives it.
- **Shared** — user data transferred to a *third party*.
- **Processed ephemerally** — "accessing and using it while the data is only
  stored in memory and retained for no longer than necessary to service the
  specific request in real-time".

Note what "collected" does **not** mean: it is not about whether *you* end up
holding the data. An app with no server at all can still be collecting, if it
sends something off the device to somebody else. That is exactly the situation
here, and it is why this form is not simply "no" all the way down.

---

## Section 1 — Data collection and security

### Q1. Does your app collect or share any of the required user data types?

**Answer: Yes.**

Not because the developer receives anything — the developer receives nothing,
there is no server — but because one user-supplied value is transmitted off
the device to third parties: the place name you type for the weather corner
goes to Nominatim, and the coordinates it resolves to go to MET Norway. Under
Play's definition that is collection, and it is also sharing.

Answering "No" here would be the intuitive answer for an app with no backend,
and it would be wrong.

### Q2. Is all of the user data collected by your app encrypted in transit?

**Answer: Yes** — *after* the one-line fix in the note above.

Justification: both weather URLs are hard-coded `https://` in
`src/weather/source.ts`. The only other outbound request is to a URL the user
types, and once `isFetchable` is https-only there is no code path that sends
anything over cleartext. (The `debug` and `debugOptimized` manifest variants
do set `usesCleartextTraffic="true"`, but those are debug build types and are
not what is uploaded to Play.)

### Q3. Do you provide a way for users to request that their data is deleted?

**Answer: No** — with the reasoning stated in the privacy policy.

Justification: there is nothing off-device to request deletion of. Every byte
the app writes is in its own sandbox; "reset all settings" clears the settings
key, presets are deleted individually, and uninstalling removes all four keys.
Android backup is off, so no copy exists elsewhere.

**I am genuinely unsure about this one.** The question is phrased around a
*request* mechanism, which presupposes developer-held data, and there is none
— but a "No" renders on the public Data safety card in a way that reads worse
than the truth. Read the exact wording and the help text in Console before
choosing; if Console offers a free-text or "not applicable" path, take it. The
separate **account deletion** requirement (apps that let users create an
account must publish a deletion URL) does not apply at all: Kiosk has no
accounts.

---

## Section 2 — Data types

Go through the full list; the ones not named below are all **not collected,
not shared**, and the justification for each is the same: no code reads them
and no code transmits them.

### Location → Approximate location

**Collected: Yes. Shared: Yes. Ephemeral: No. Optional (not required).
Purpose: App functionality.**

This is the only difficult judgement on the form, so here is the whole chain.

**Is a typed place name "location" at all?** The field is free text —
`weatherPlace` in `src/clock/settings.ts` — and it can be any place on earth;
someone can set the corner to Kyoto while sitting in Zurich. So it is not
*necessarily* the user's location. But the overwhelmingly common use of a
"weather here" setting is to name where the device is, and Play's category
covers "user or device physical location" at city-level granularity. Treating
it as approximate location is the honest reading. Arguing that it is merely
"an arbitrary string the user typed" is the kind of technically-defensible
answer that gets an app suspended.

**Precise or approximate?** Approximate. The user types a place name; the app
never asks Android for a location fix, holds neither `ACCESS_FINE_LOCATION`
nor `ACCESS_COARSE_LOCATION`, and truncates the resolved coordinates to four
decimals before sending them. There is no precise-location data path in the
app at all.

**Is it collected?** Yes. `fetchPlace` in `src/weather/source.ts` puts the
typed string into a Nominatim query, and `fetchWeather` puts the resolved
latitude and longitude into a MET Norway query. Both leave the device. That
meets Play's definition regardless of the fact that no developer server is
involved.

**Is it shared?** Under the plain definition, yes: MET Norway and the
OpenStreetMap Foundation are third parties. They are explicitly *not* service
providers — a service provider processes data on the developer's behalf and
on the developer's instructions, and these are independent public services
that do what they like with their own logs. MET's own Terms of Service say
they store the IP and the coordinates.

There is a real argument for the **user-initiated action exception** ("data
transferred to a third party based on a specific action the user initiates,
where the user reasonably expects the data to be shared"). It fits well: the
user types a city into a field whose on-screen hint names met.no and Nominatim
by name, in order to get a forecast for that city. Nobody is surprised.

**Recommendation: declare it as shared anyway.** The cost is one extra line on
the public Data safety card ("may share Location with third parties"), which
for a clock is not damaging. The cost of relying on an exception and having a
reviewer disagree is an enforcement action. **This is the answer I am least
certain of on the whole form** — both answers are defensible, and I could not
read Play's own help page for the exception's exact current wording (see
"What I could and could not verify" below).

**Is it ephemeral?** **No — do not tick this.** The tempting argument is
Google's own example: a weather app that sends location off-device only to
fetch a forecast and keeps nothing may treat it as ephemeral. Two things break
it here. First, the app *does* retain the resolved coordinates, in
`kiosk.weather.place.v1` — on-device, so arguably outside the definition, but
it is retention of exactly this data and it is not "only stored in memory".
Second and more decisively, MET Norway's published terms state that the IP
address and the coordinates in a request are written to their logs in Oslo.
The data is demonstrably not discarded once the request is served. Ticking
"ephemeral" would be claiming something a reviewer can disprove by reading the
recipient's own terms of service.

**Required or optional?** Optional. `weatherPlace` defaults to `''`, and
`useWeather` short-circuits to `{ kind: 'off' }` and issues no request while it
is empty. Every other feature works untouched.

**Purpose: App functionality only.** No analytics, no personalisation, no
advertising, no fraud prevention. There is nowhere for any of those to happen.

### Personal info → all types

**Not collected, not shared.** No name, email, user ID, address, phone number
or anything else is asked for or held. There is no account. The only free-text
fields in the app are the weather place, the now-playing URL, a second-clock
label, a countdown label and preset names — all stored on-device only, and
none of them prompted as personal information. Labels and preset names never
leave the device under any code path.

*Watch item:* nothing stops a user from typing their home address into the
weather field, which then goes to Nominatim. That is covered by the
Approximate location declaration above and warned about in the privacy policy;
it does not turn into a separate "Address" declaration, because the app
neither asks for nor treats the field as an address.

### Financial info → User payment info, Purchase history, Credit score, Other

**Today: not collected, not shared.** There is no billing code in the shipped
path at all (`activeBilling = testBilling`, which writes a boolean to local
storage).

**Once billing is real:** my reading is still **not collected**. The purchase
runs through the Google Play Billing flow, which the Play Store app conducts;
your app queries the on-device billing client for entitlements and stores a
local flag. Payment details never touch the app, and the purchase record is
Google's collection, not yours.

**This is the second answer I am not fully certain about.** It is a widely-held
reading, but I could not confirm it against Play's own help text. Two things
that would definitely change it:

- if you ever implement the **server-side receipt verification** sketched at
  the bottom of `playBilling.ts`, the purchase token goes to a server you
  control and *Purchase history* becomes collected, with purpose *App
  functionality*; and
- if Console's Financial-features declaration or the billing library's own
  data-safety guidance says otherwise, follow that, not this document.

### Messages → Emails, SMS or MMS, Other messages

**Not collected, not shared — and this deserves the extra sentence a reviewer
will be looking for.**

The app holds a `NotificationListenerService`
(`modules/now-playing/.../KioskNotificationListener.kt`), which is normally the
signature of an app that reads messages. This one is a class declaration with
an empty body: `class KioskNotificationListener : NotificationListenerService()`
and nothing else. No callback is overridden, so Android delivers no
`StatusBarNotification` to it, so no notification content is received, let
alone read, stored or transmitted. The service exists solely to satisfy
Android's precondition for calling
`MediaSessionManager.getActiveSessions`, which is where the track metadata
actually comes from.

Keep this explanation to hand for the review-notes field and for any policy
appeal. It is checkable in sixteen lines of public source, most of them the
comment explaining why the class is empty.

### Audio files → Music files, Other audio files, Voice or sound recordings

**Not collected, not shared.** No audio is recorded, read or transmitted. The
media bar handles metadata strings and a volume level, never audio data, and
the app holds no `RECORD_AUDIO` permission.

The track title and artist read from the device media session, and those
returned by a user-configured endpoint, stay in memory on the device and are
drawn on screen. They are never written to storage and never transmitted. Not
transmitted off the device means not collected, by definition.

### App activity → App interactions, In-app search history, Installed apps, Other user-generated content, Other actions

**Not collected, not shared.** Nothing counts taps, screens, sessions or
durations, and there is nothing to count them into. No installed-app
enumeration: the `<queries>` block in the manifest declares an intent filter
for opening https links, which is not the same as reading the installed-app
list, and no code calls `queryIntentActivities` or `getInstalledPackages`.

### Web browsing

**Not collected, not shared.** There is no WebView in the app and no browsing
history is read.

### App info and performance → Crash logs, Diagnostics, Other

**Not collected, not shared.** No crash reporter, no performance SDK, no
telemetry. Check the dependency list in `package.json`: it is Expo modules,
React Native, `react-native-svg` and a volume manager. No Firebase, no Sentry,
no measurement library. `expo-updates` is present as a transitive dependency
but is disabled in the manifest
(`expo.modules.updates.ENABLED = false`), so not even an update check is made.

### Device or other IDs

**Not collected, not shared.** No advertising ID, no Android ID, no
installation ID, no MAC, no IMEI. Grepping the source for `androidId`,
`installationId`, `deviceId` and `expo-device` returns nothing.

### Health and fitness · Photos and videos · Files and docs · Calendar · Contacts

**Not collected, not shared.** No permission, no API call, no code path
touches any of them. The two manifest permissions are `INTERNET` and
`VIBRATE`; the external-storage permissions Expo's template ships are removed
via `blockedPermissions` in `app.json` and appear as `tools:node="remove"` in
the generated manifest.

---

## The IP address question, spelled out

Every one of the three requests exposes the device's IP address to whoever
receives it. That is a property of making an HTTP request, not a feature of
the app. Does it need declaring?

**Recommendation: no separate declaration — but disclose it in the privacy
policy, which `docs/privacy-policy.md` does.**

Reasoning:

- IP address is not one of the Data safety data types. There is no box for it.
- Play's guidance is that IP address should be disclosed "based on its
  particular usage": the example given is a developer who uses IP addresses to
  *determine location*, in which case Location must be declared. Kiosk does
  the opposite — it never sees the IP at all. There is no developer server to
  observe it, and no geo-IP lookup anywhere in the code.
- It does not fit *Device or other IDs* either, which is aimed at advertising
  and installation identifiers (Advertising ID, IMEI, MAC, Firebase
  installation ID). Kiosk reads none of those.
- Location is already declared as collected and shared on other grounds, so
  even a maximalist reading of the IP exposure adds no data type that is not
  already on the card.

**Where I would hesitate:** if you ever add a first-party endpoint of your
own — a licence check, a config fetch, anything — then you *are* receiving the
IP, and this answer needs revisiting. As long as the three destinations are
two public weather services and a URL the user typed themselves, it stands.

---

## The user-supplied now-playing endpoint, spelled out

Worth its own note because it looks alarming and is not.

- **What the app sends:** an HTTP GET to a URL the user typed, with one header
  (`Accept: application/json`). No body, no query parameters added by the app,
  no settings, no identifiers. See `loadNowPlaying` in
  `src/media/nowPlaying.ts`.
- **Whose server:** the user's choice. The developer neither operates it nor
  knows what it is. There is no default; `EXPO_PUBLIC_NOW_PLAYING_ENDPOINT` is
  empty in `.env.example` and the app ships with the field blank.
- **Is any user data transmitted to it?** Nothing beyond the request itself
  and the IP address that carries it. The URL is a setting the user typed and
  never leaves the device except as the destination of the request.
- **Data flows inbound, not outbound:** the title/artist come *back* and stay
  on the device.

So: **nothing to declare** for this feature. If the app ever started sending
device state or identifiers to that endpoint, that would change — it does not.

---

## Adjacent declarations on the same Console page

Not part of the Data safety form, but they sit beside it under **App content**
and a reviewer reads them together.

| Declaration | Answer | Why |
|---|---|---|
| Privacy policy | The public URL from `docs/privacy-policy.md` | Required. Must be reachable without login. |
| Ads | **No, my app does not contain ads** | No ad SDK, no ad identifier, no promotional content of any kind in the app. |
| App access | **All functionality is available without special access** | No login, no account, no gated region, no credentials for a reviewer to be given. Locked content is visible and usable behind a watermark, so a reviewer can exercise every face and backdrop without buying anything. |
| Content ratings | See `docs/content-rating.md` | |
| Target audience and content | **18+ / adults**, or the lowest adult band offered; do **not** opt into the Families programme | The app is not designed for or appealing to children. Choosing a child age band pulls in the Families policy and its extra requirements for no benefit. Also answer "No" to whether the app could unintentionally appeal to children. |
| News app | **No** | |
| Health apps | **No** | |
| Financial features | **No** | Once billing is real: in-app purchase of a digital unlock through Play Billing is not a "financial feature" in the sense this declaration means (loans, investments, insurance, money transfer). If Console's own wording contradicts that, follow Console. |
| Government apps | **No** | |
| Advertising ID | **Declare: not used** | No ad SDK, and no dependency should inject `com.google.android.gms.permission.AD_ID`. Verify against the merged manifest of the release bundle rather than trusting this — the declaration is about what actually ships. |
| Data deletion / account deletion URL | **Not applicable** | No accounts exist. |

One more that is easy to forget: **in the store listing itself**, disclose the
notification-access feature in plain words. Play expects sensitive permissions
to be visible before install, not discovered afterwards. The full description
in `store/copy.md` carries that paragraph — keep it if you edit the copy.

---

## Where this document disagrees with `docs/play-requirements.md`

That file (written separately, in the same folder) reaches a different answer
on the Location row, and you should not read the two and assume they agree.

| Question | `play-requirements.md` | This document |
|---|---|---|
| Approximate location — processed ephemerally? | **Yes, tick it** | **No, do not tick it** |
| Approximate location — shared? | **Not shared** | **Shared** |

The disagreement is real and neither answer is obviously wrong. The case for
ticking ephemeral is Google's own worked example, which is almost exactly this
app: a weather app that sends location off-device to fetch a forecast and
keeps nothing. The case against, which is why this document says no, is that
the app *does* keep the resolved coordinates (in `kiosk.weather.place.v1`,
on-device) and that MET Norway's published terms state the coordinates and IP
are written to their logs — so "retained for no longer than necessary to
service the request" is not true of the recipient, and it is checkable that it
is not true.

Similarly on sharing: `play-requirements.md` is implicitly relying on the
user-initiated-action exception, which is defensible; this document recommends
declaring rather than relying on it.

**Decide once, and make the two files agree before you submit.** A reviewer
comparing your Data safety declaration against your privacy policy is the
normal failure mode here, and having two internal documents that contradict
each other is how you end up submitting the wrong one.

---

## What I could and could not verify from a primary source

Being explicit, because this document is only as good as its sources.

**Verified from primary sources:**

- Everything about this app. All of it is read directly from the source in
  this repository: the two weather URLs and the User-Agent
  (`src/weather/source.ts`), the endpoint fetch and its caps
  (`src/media/nowPlaying.ts`), the empty listener service
  (`modules/now-playing/.../KioskNotificationListener.kt`), the media-session
  read (`NowPlayingModule.kt`), the four storage keys, the reset behaviour
  (`src/clock/SettingsContext.tsx`), the permissions and `allowBackup`
  (`app.json` and `android/app/src/main/AndroidManifest.xml`), and the billing
  state (`src/billing/index.ts`).
- Android's permission model and the fact that `MEDIA_CONTENT_CONTROL` is not
  available to ordinary apps — `developer.android.com` is reachable from here
  and was read directly.
- The Data safety data-type list — read from
  `developer.android.com/privacy-and-security/declare-data-use`.
- MET Norway's terms, including their statement that user IP addresses and
  request coordinates are stored in their Oslo logs.
- The OpenStreetMap Foundation's privacy policy position on Nominatim query
  analysis and shortened IP retention.
- GitHub Pages' Jekyll behaviour for Markdown files without front matter.

**Could not verify from a primary source — `support.google.com` and
`play.google.com` are blocked from this environment:**

- The exact current wording of Play's "collected" / "shared" definitions, the
  ephemeral-processing exception, and the sharing exceptions. I have them via
  secondary reporting and via Google's own text as quoted by third parties,
  and the substance is consistent across sources — but the wording matters
  here, and **you should read the Play Console help page yourself before
  submitting**, particularly for the two answers flagged as uncertain
  (Location → shared, and the data-deletion question).
- Play's exact policy text on notification access and whether Console surfaces
  a separate declaration form for a `NotificationListenerService`. Secondary
  sources agree it falls under the restricted-permission regime: permitted
  only where it serves an approved core function, with no harvesting or
  transmission of notification content. Kiosk's use is narrower than that
  standard — it never receives notifications at all — but **expect the review
  to ask**, and be ready to point at the eleven-line service.
- The exact Console phrasing of the Financial features and Target audience
  declarations.

Where I am unsure I have said so rather than picked the confident-sounding
answer. The three to look at hardest are: **Location → shared** (declare, or
rely on the user-initiated exception), **the data-deletion question**, and
**Purchase history once billing is real**.
