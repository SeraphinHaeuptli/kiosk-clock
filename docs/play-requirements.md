# Publishing Kiosk (`com.kioskclock.app`) to Google Play

Research snapshot: **30 August 2026**. Play policy moves fast; re-check anything
dated before you act on it.

## How to read this document

Every factual claim carries a confidence marker:

| Marker | Meaning |
| --- | --- |
| **[V]** | Verified against a primary Google source I could actually fetch (`developer.android.com`, GitHub) |
| **[S]** | Second-hand. The primary source is `support.google.com` or `play.google`, both of which this research environment blocks. Sourced from search-engine summaries of those pages plus corroborating third-party write-ups. Directionally reliable, exact wording unconfirmed |
| **[I]** | Inference — my reasoning applied to this app, not a quoted rule |
| **[?]** | Could not establish. Treat as an open question, not a fact |

"Who" column: **Dev** = a human must sit at a keyboard and make a judgement or
prove an identity. **Auto** = scriptable / CI-able today. **Mixed** = the
artefact can be generated but a human must approve or upload it.

---

## 0. The two things that are on fire

Both fall **tomorrow, 31 August 2026**:

1. **Target API 36.** From 31 Aug 2026, new apps *and* updates must target
   Android 16 (API 36). **[V]**
   ([target-sdk](https://developer.android.com/google/play/requirements/target-sdk))
   Kiosk already targets 36, so this is a *verify*, not a *fix*. An extension to
   1 Nov 2026 exists if needed; the request form appears in Play Console. **[V]**
2. **Play Billing Library 8+.** From 31 Aug 2026, new apps and updates must ship
   PBL 8 or later. PBL 9 is current; PBL 8's own sunset is 31 Aug 2027. **[V]**
   ([deprecation-faq](https://developer.android.com/google/play/billing/deprecation-faq))
   Kiosk ships **no** billing library today (`src/billing/testBilling.ts` is a
   local stub), so the first build that *adds* billing must land on 8 or 9 —
   never 7. **[I]**

Neither is a runtime kill switch — already-published binaries keep working. They
gate your ability to *publish*. **[V]**

---

## 1. Ordered checklist

### Phase A — Account (do this first; it is the long pole you cannot parallelise)

| # | Step | Who | Time | Cost | Notes |
| --- | --- | --- | --- | --- | --- |
| A1 | Decide **personal vs organization** account | Dev | 30 min thinking | — | Decisive: personal ⇒ the 12-testers/14-days gate. Organization (needs a D-U-N-S number) is exempt but verification runs 2–4+ weeks and needs business documents. For a solo German individual the personal route is almost certainly faster. **[S]** |
| A2 | Create the Google account you will own the app under | Dev | 15 min | — | Use a dedicated account, not a personal inbox. This account can never be changed for the app's lifetime without an account transfer. **[I]** |
| A3 | Register as a Play developer, pay the fee | Dev | 30 min | **$25 one-time** | Not annual. **[S]** |
| A4 | **Identity verification** | Dev | 2 h – 5 business days | — | Government photo ID + address + phone; a selfie is sometimes requested. Personal accounts require it; nothing publishes until it clears. **[S]** |
| A5 | Sign the Developer Distribution Agreement | Dev | 5 min | — | **[S]** |
| A6 | **Declare EU/DSA trader status** | Dev | 20 min | — | You will be monetising, so you are a trader. Google then publishes your **name, physical address, phone and email** on the store listing in the EU. Non-declaration ⇒ removal from EU storefronts. Get a service address / virtual office and a non-personal phone number *before* you fill this in — it is painful to unwind. **[S]** |
| A7 | Create a **payments profile / merchant account** | Dev | 1 h + 1–3 days verification | — | Required before the "create product" buttons in Monetize become clickable. Bank account must be in the same country as the profile; Germany supported. Also sign the Paid Applications Agreement. **[S]** |
| A8 | Note the **Android Developer Verification** overlay | Dev | 0 (informational) | — | Separate programme from A4. Enforced 30 Sep 2026 in Brazil, Indonesia, Singapore, Thailand for apps installed from participating stores (Google Play is one); global in 2027. Play auto-registers ~99% of apps, so publishing through Play normally satisfies it — but check Play Console Home for an unregistered-app prompt. **[V]** ([developer-verification](https://developer.android.com/developer-verification)) |

**Phase A elapsed: 3–8 days**, mostly waiting on A4 and A7.

### Phase B — Make the binary publishable

| # | Step | Who | Time | Notes |
| --- | --- | --- | --- | --- |
| B1 | Confirm `compileSdk`/`targetSdk` = 36, `minSdk` = 24 in the generated project | Auto | 10 min | The `android/` directory is prebuild output and is gitignored — assert it in CI, do not trust a one-time read. **[I]** |
| B2 | Replace the **launcher icon** | Mixed | 2–4 h | README §"Also not done" says `assets/icon.png` and `assets/android-icon-foreground.png` are still Expo scaffold artwork. Shipping scaffold art is both an ASO own-goal and a plausible "low quality" flag. **[I]** |
| B3 | Stop signing releases with the debug keystore | Dev | 1 h | README flags this. For Play: enrol in **Play App Signing** and let EAS hold the upload key (`eas credentials`). A debug-signed AAB is rejected. **[I]** |
| B4 | Build a **production AAB** (`eas build --profile production`) | Auto | 20–40 min | `eas.json` already sets `buildType: app-bundle` and `autoIncrement`. `appVersionSource: remote` means EAS owns `versionCode`; the local `versionCode 1` is ignored. **[I]** |
| B5 | Verify **16 KB page-size** alignment | Auto | 30 min | Mandatory for apps targeting API 35+; Play blocks updates that fail from **1 Feb 2027**. Only matters because RN/Expo ship `.so` files. AGP 8.5.1+ does the right thing automatically; verify with `bundletool dump config --bundle=app.aab \| grep alignment` → expect `PAGE_ALIGNMENT_16K`. **[V]** ([page-sizes](https://developer.android.com/guide/practices/page-sizes)) |
| B6 | Re-check Android 16 target behaviours | Dev | 2–6 h | Edge-to-edge is now **mandatory and un-opt-out-able**; predictive back is on by default (the app currently sets `enableOnBackInvokedCallback="false"`, a *temporary* opt-out); on displays ≥600dp, `screenOrientation`, `resizableActivity` and aspect-ratio limits are **ignored** unless you set `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY`, and that escape hatch dies at API 37. Directly relevant: a kiosk clock is exactly the app that wants to pin orientation on a tablet. **[V]** ([behavior-changes-16](https://developer.android.com/about/versions/16/behavior-changes-16)) |
| B7 | Create the app record in Play Console and **upload one AAB by hand** | Dev | 30 min | The Play Developer API cannot create the first release — Expo documents this as a hard limitation. Everything after the first upload is automatable. **[V]** ([expo/fyi](https://github.com/expo/fyi/blob/main/creating-google-service-account.md)) |
| B8 | Create a Google Cloud **service account**, enable the Play Android Developer API, invite it to Play Console, upload the JSON key to EAS | Mixed | 45 min | Exact permission set: *View app information (read-only)*; *Edit and delete draft apps*; *Release to production…and use Play App Signing*; *Release apps to testing tracks*; *Manage testing tracks and edit tester lists*; *Manage store presence*. Admin is **not** needed. **[V]** (same source) |
| B9 | Wire `eas submit --profile production` | Auto | 20 min | `eas.json` has an empty `submit.production` block — it needs the service-account key reference. **[I]** |

### Phase C — Store listing assets

Specs below are **[S]** (Play Console Help is blocked here) but are corroborated
across several independent 2026 write-ups.

| Asset | Spec | Mandatory? | Who | Time |
| --- | --- | --- | --- | --- |
| App icon | 512 × 512 px, 32-bit PNG (alpha allowed), ≤ 1 MB | Yes | Mixed | 2–4 h |
| Feature graphic | 1024 × 500 px, JPEG or 24-bit PNG, **no alpha** | **Yes — Play Console blocks publishing without one** | Mixed | 2–3 h |
| Phone screenshots | JPEG or 24-bit PNG, no alpha; 320–3840 px per side; longer side ≤ 2× shorter side; ≤ 8 MB each | **Min 2, max 8.** Use 1080 × 1920 | Auto (adb/Maestro capture) + Dev (framing) | 3–6 h |
| Tablet screenshots | Same rules; 1080–7680 px, 16:9 or 9:16 | Optional *unless* you list tablet support; ≥ 1 per declared form factor, 4+ recommended for large-screen promotion | Mixed | 2–3 h |
| Promo video | YouTube URL | **Optional.** Not required in 2026 | Dev | — |
| App name | ≤ 30 chars | Yes | Dev | — |
| Short description | ≤ 80 chars | Yes | Dev | — |
| Full description | ≤ 4000 chars | Yes | Dev | 2 h |

Draft listing text already exists in `store/copy.md`, and draft screenshots in
`store/screenshots/` — check both against the specs above before uploading. **[I]**

Kiosk-specific notes:
- The app is a plausible tablet/desk-dashboard app. If you claim large-screen
  support, ship tablet screenshots. If you do not want the extra work for v1,
  do not claim it. **[I]**
- Four-plus phone screenshots at ≥1080px is the threshold for several Play
  promotional/recommendation surfaces. **[S]**
- The full description must **prominently document the now-playing feature**.
  Play's sensitive-permission rule requires that the feature a permission serves
  be "promoted in your Google Play listing" — if the store listing does not
  mention now-playing, the notification-listener justification collapses. **[S]/[I]**

### Phase D — App content declarations

All of these live under **Policy → App content** and all must be green before you
can publish. **[S]**

| # | Declaration | Kiosk's answer | Who | Time |
| --- | --- | --- | --- | --- |
| D1 | **Privacy policy URL** | Required for *every* app, including no-collection apps. Host it yourself (GitHub Pages off this repo is fine and free). Must also be reachable **from inside the app** because the app uses a sensitive API. **[S]** | Mixed | 2–3 h |
| D2 | **App access** | "All functionality is available without special access" — there are no accounts. **But** add a free-text note telling the reviewer how to enable Notification Access (Settings → the app's now-playing toggle → system notification-access screen), or the reviewer will never see the feature work. **[I]** | Dev | 20 min |
| D3 | **Ads** | No ads. | Dev | 2 min |
| D4 | **Content rating** | Complete the **IARC** questionnaire (that is the authority Play uses; it fans out to ESRB / PEGI / USK / ClassInd). A utility clock with no UGC, no ads, no gambling, no violence lands at Everyone / PEGI 3 / USK 0. As of the **15 July 2026** policy announcement, unrated apps are explicitly not allowed. **[S]** | Dev | 20 min |
| D5 | **Target audience and content** | Choose **18+** (or 16+/18+). Do not select any under-13 bracket: that pulls you into Families Policy and Designed-for-Families review, which is a bad combination with notification access. Keep the listing art and copy non-child-appealing. **[I]** | Dev | 15 min |
| D6 | **News app** | No. | Dev | 2 min |
| D7 | **Government apps** | No. | Dev | 2 min |
| D8 | **Financial features** | No. A one-off IAP is not a "financial feature" — that section is about lending, trading, crypto, insurance. **[I]** | Dev | 2 min |
| D9 | **Health** | No. | Dev | 2 min |
| D10 | **Data deletion** | N/A — no accounts. The account-deletion URL requirement only bites if users can create an account. **[S]** | Dev | 5 min |
| D11 | **Advertising ID** | Declare **not used**. Confirm no dependency injects `com.google.android.gms.permission.AD_ID` — none of the current dependencies should, but check the merged manifest of the release AAB. **[I]** | Auto | 15 min |
| D12 | **Data safety** | See the table below. | Dev | 1–2 h |
| D13 | **Sensitive app permissions** | This is where a permissions declaration would appear if Play generates one for your bundle. See §2. **[S]** | Dev | 1 h + unknown review |

#### D12 — Data safety, answered for Kiosk

Rule of thumb Play uses: data is "collected" when it **leaves the device**.
On-device-only storage is not collection. **[S]**

| Data type | Answer | Reasoning |
| --- | --- | --- |
| App settings, clock face, theme | **Not collected** | AsyncStorage, never transmitted. **[I]** |
| **Approximate location** | **Collected → processed ephemerally → not shared.** Purpose: App functionality. Optional. | The user types a place name; it goes to Nominatim, and lat/lon goes to `api.met.no`. That is a transmission off-device to a third party. Google's own worked example for the *ephemeral processing* checkbox is literally a weather app that sends location to fetch a forecast and keeps nothing. Tick the "processed ephemerally" box — ephemeral data must still be declared but is not surfaced on the listing. **[S]** Declaring "no data at all" here is the single most likely way to get a data-safety mismatch flag. **[I]** |
| Now-playing track/artist | **Not collected** | Read from `MediaSessionManager` in memory, rendered, discarded. Only leaves the device if the user configures the optional HTTP now-playing endpoint — and then it goes to *their own* endpoint, not to you. Disclose that in the privacy policy prose even though it is not "collection" by you. **[I]** |
| Purchases | **Not collected by you** | Play handles the transaction; the entitlement is a local flag. **[I]** |
| Crash logs / analytics / diagnostics | **Not collected** | None wired. Verify no Expo/Sentry telemetry sneaks in. **[I]** |
| Encryption in transit | Yes | All outbound is HTTPS — **except** a user-supplied `http://` now-playing endpoint. See risk R7. **[I]** |
| Data deletion request mechanism | N/A | No server-side data exists. **[I]** |

### Phase E — In-app purchase

| # | Step | Who | Time | Notes |
| --- | --- | --- | --- | --- |
| E1 | Payments profile live (A7) | Dev | — | Blocking prerequisite. **[S]** |
| E2 | Pick a billing library that speaks **PBL 8+** | Dev | 1 h | `expo-iap` (npm latest **5.4.1** as of today) is the Expo-ecosystem successor to `react-native-iap` and tracks Play Billing 8.x. `expo-in-app-purchases` is dead — do not use it. **[V]** (npm registry) **[S]** (which PBL version) |
| E3 | Create the managed product | Dev | 20 min | Monetize → Products → In-app products. Product id **`founder_lifetime`**, type **one-time / non-consumable**. The id is immutable once created. Price per country; Play takes 15% on the first $1M/yr. **[S]** |
| E4 | Read the price **from the store**, never a constant | Auto | — | Already the stated intent in `src/billing/playBilling.ts`. Required for correct currency/tax display. **[I]** |
| E5 | **Acknowledge the purchase** | Auto | — | `acknowledgePurchase()` after a `PURCHASED` state, guarded by `isAcknowledged()`. **Unacknowledged purchases are auto-refunded and the entitlement revoked after 3 days.** Do **not** call `consumeAsync()` — that would make the lifetime unlock re-purchasable. **[V]** ([integrate](https://developer.android.com/google/play/billing/integrate)) |
| E6 | Set up **licence testing** | Dev | 30 min | Play Console → Settings → License testing; add a Google Group or individual Gmail addresses; keep the response at `RESPOND_NORMALLY`. Testers buy for free, get test payment instruments (always-approves, always-declines, slow card, approves-then-chargebacks). **[V]** ([test](https://developer.android.com/google/play/billing/test)) |
| E7 | Prove acknowledgement works | Auto/Dev | 1 h | Licence-tester purchases are **auto-refunded after 3 minutes** if unacknowledged — this is your fast feedback loop for E5. Test on a **physical device**; billing does not work on emulators. **[V]** |
| E8 | Watch the spend caps | Dev | — | Draft / internal-track apps have per-day and per-order spend limits; move to closed/open/production for higher limits. **[V]** |
| E9 | Declare the app as containing IAP | Auto | — | Play derives "In-app purchases" on the listing from the products you configure; there is no separate free-text declaration. Your listing copy should still say what the Founder pack unlocks. **[S]** |

### Phase F — Closed testing → production (the calendar gate)

Applies because this is a **personal account created after 13 Nov 2023**. **[S]**

| # | Step | Who | Time | Notes |
| --- | --- | --- | --- | --- |
| F1 | Recruit **≥ 12 testers** | Dev | 2–7 days | Real Google accounts, each opted in via the closed-track link. This is the step solo developers underestimate. **[S]** |
| F2 | Push a build to a **closed** track | Auto | 1 h | Internal track does **not** count toward the requirement. **[S]** |
| F3 | Hold **14 continuous days** with ≥12 opted-in testers | Dev | **14 days minimum** | Clock starts when the release is live and testers are opted in. A brief dip below 12 does not reset the clock, but *loss of opt-in* is what is measured. **[S]** |
| F4 | Drive genuine **engagement** | Dev | daily nudging | Since 2026, Play measures tester *User Engagement Time*, not installs. Testers who install and never open are flagged inactive, and production requests are refused for "insufficient testing engagement". Ask testers to open the app every day or two and actually change faces, set a location, buy the test IAP. **[S]** |
| F5 | Collect real feedback and **change the app because of it** | Dev | ongoing | The production-access questionnaire asks what feedback you got and what you changed in response. Vague answers are a top rejection cause. Keep a written log from day 1. **[S]** |
| F6 | Apply for production access | Dev | 30 min form | Review typically ≤ 7 days. **[S]** |
| F7 | First production submission review | — | **7–14 days for a first-time developer** (1–7 days for established ones) | **[S]** |
| F8 | Staged rollout | Auto | — | Start at 10–20%; you cannot roll back a release, only halt it and ship a higher versionCode. **[I]** |

### Realistic end-to-end calendar

| Path | Elapsed |
| --- | --- |
| Account + verification (A) | 3–8 days |
| Assets, listing, declarations, billing (B–E), overlapping A | 1–2 weeks of work |
| Closed testing (F1–F5) | 16–21 days (recruitment + the hard 14) |
| Production access review (F6) | ≤ 7 days |
| First app review (F7) | 7–14 days |
| **Total, nothing goes wrong** | **6–8 weeks** |
| **Total, if the notification listener triggers a policy review** | **8–14 weeks** |

---

## 2. The notification-listener question (highest risk item)

### What Kiosk actually does

`modules/now-playing/android/src/main/AndroidManifest.xml` declares
`expo.modules.nowplaying.KioskNotificationListener` with
`android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"` and
the `android.service.notification.NotificationListenerService` intent filter. The
class body is empty — it overrides no callbacks. Its only purpose is to be an
*enabled* listener component, because
`MediaSessionManager.getActiveSessions(ComponentName)` will only return sessions
to a caller that either holds the privileged `MEDIA_CONTENT_CONTROL` permission
(signature|privileged — unavailable to normal apps) or passes the ComponentName
of an enabled notification listener. **[V — read from this repo]**

There is no third-party alternative. An open AndroidX Media issue
([androidx/media#3179](https://github.com/androidx/media/issues/3179), opened
16 Apr 2026, assigned, still no maintainer reply) asks Google for exactly this:
a narrower permission for reading active media sessions, citing that the
notification listener grant looks disproportionate to users and trips Play
Protect heuristics. **[V]**

### What the policy says

Play governs this under **"Permissions and APIs that Access Sensitive
Information"** (Play Console Help article 16558241, with a *preview* article
16909972 covering April-2026 changes). Both are blocked here; the following is
reconstructed from search-engine summaries and is **[S]**:

- Notification listener is grouped with SMS, Call Log and AccessibilityService
  as **high-risk**, on the stated grounds that these are frequently abused for
  financial fraud.
- Apps may use it **only to provide approved core app functionality**, where
  "core" means the app's main purpose, prominently documented and promoted in
  the Play listing, and without which the app is broken.
- **Permitted uses** (as reported, three items):
  1. Health & Fitness apps that relay notifications to their own wearable
     hardware;
  2. apps that **aggregate notifications to help users focus**;
  3. apps that **show notifications on alternate user interfaces** — for
     example, widgets or launchers.
- **Disallowed uses**: accessing notification content without explicit user
  consent; hiding or suppressing other apps' notifications without consent.

### Why this is the risk

**Kiosk does not cleanly match any of the three permitted uses.** **[I]** It
does not relay notifications to a wearable, does not aggregate them, and does not
display them. It reads *media session metadata*, and the notification listener is
merely the capability token that makes that API call legal. A reviewer working
down a checklist can reasonably conclude "none of the above" and reject.

The strongest available framing is permitted use (3): Kiosk is an **alternate
user interface** — a full-screen dashboard — that surfaces the media-playback
information the system otherwise shows in the notification shade. That is
defensible and, I think, true. It is also an argument you have to *make*, which
means a human reviewer, which means time.

### Is there a declaration form? **[?] — could not establish**

What I could establish:
- A **Permissions Declaration Form** exists and lives under **App content →
  Sensitive app permissions**. It is generated automatically from the permissions
  found in your uploaded bundle — including bundles on internal, closed and open
  tracks — and surfaces as an alert in the left nav. **[S]**
- For permissions that do require it, Play wants a core-functionality
  justification and, per multiple third-party guides, **usually a video
  demonstration**; the release then goes to extended review that "may require up
  to several weeks". **[S]**
- Third-party enumerations of form-triggering permissions consistently list SMS,
  Call Log, background location, All Files Access, exact alarms, broad
  photo/video, `QUERY_ALL_PACKAGES`, Health Connect and (from Jan 2027)
  Contacts. **I did not find `BIND_NOTIFICATION_LISTENER_SERVICE` on any such
  list.** **[S]**

So the honest answer is: **the form is auto-generated from your bundle, so you
will find out within minutes of your first upload.** Plan for both branches:

- **If a form appears** — fill it in, attach the video, expect weeks.
- **If no form appears** — do not relax. The policy still applies and is enforced
  at app-review time; the failure mode is a rejection or a post-publication
  removal notice under "Permissions and APIs that Access Sensitive Information",
  answered through **Policy status → appeal**, where you can supply the same
  video and justification.

### Real-world experience: what I could and could not find

**Could not find**: any first-hand developer write-up of a Play review of a
notification listener used specifically for now-playing/media metadata —
approval or rejection, with the language used. Reddit and Stack Overflow are
unreachable from this environment and search-engine summaries of them surfaced
nothing on point. **This is a genuine gap, not an absence of risk.** **[?]**

**Could find (indirect precedent)** — apps that ship on Play today using
notification access for media purposes: **Musixmatch** (requests notification
access specifically to detect what music is playing, for floating lyrics),
**KWGT / Kustom Widget Maker** (media info in widgets), and the general class of
smartwatch/wearable companions. **[S]** This is evidence the use case *can* live
on Play. It is not evidence about how a first-time personal-account developer's
review will go — established apps benefit from history you do not have. **[I]**

### Recommended mitigations, in priority order

1. **Strongly consider shipping v1 without the listener.** **[I]** This is the
   single highest-leverage decision in this document. The closed-testing gate
   (14 days, minimum) and a sensitive-permission policy review are both
   serialised in front of your launch. Decoupling them means: launch the clock,
   clear production access, establish an app history — *then* add now-playing in
   an update where a rejection costs you a release, not your launch. The
   now-playing line is genuinely optional to the product ("the clock still
   works, it is just unstyled" is already the free-tier philosophy).
2. **Prominent disclosure before the grant.** Play requires an in-app
   disclosure, inside normal app flow (not buried in settings, not only in the
   privacy policy), immediately preceding the consent action, describing what
   is accessed and why, with an affirmative tap. Navigating away must not count
   as consent. Recommended button pair: **Agree** / **Not now**. **[S]** Kiosk
   should show this *before* deep-linking to the system notification-access
   screen.
3. **Default off.** The feature must be opt-in, and the app must be fully
   functional without it. **[I]**
4. **Say the quiet part in the manifest and the listing.** Keep the existing
   comment in the module manifest; mirror it in the privacy policy and in the
   declaration: *no callbacks are overridden, no notification is read, stored,
   or transmitted.* **[I]**
5. **Record the demo video before you need it** (see §5).
6. **Make now-playing visibly core in the store listing** — screenshot it, name
   it in the short description. The policy's own test is whether the feature is
   "promoted in your Google Play listing". **[S]**

### Draft justification text (for the form, or for an appeal)

> Kiosk is a full-screen desk-clock dashboard. One of its core, listed features
> is a now-playing line showing the title and artist of media currently playing
> on the device, presented on the clock face — an alternate user interface for
> information the system otherwise shows only in the notification shade.
>
> To read that metadata, Android requires `MediaSessionManager.getActiveSessions()`,
> which accepts only two callers: apps holding `MEDIA_CONTENT_CONTROL` (a
> signature|privileged permission unavailable to non-system apps), or apps that
> pass the ComponentName of an enabled NotificationListenerService. Kiosk
> therefore declares a NotificationListenerService **solely to hold that grant**.
>
> The service class is empty. It overrides no callbacks — not
> `onNotificationPosted`, not `onNotificationRemoved`. Kiosk never reads,
> stores, transmits, modifies, hides or dismisses any notification. The only
> data it obtains is structured media metadata (track title and artist) from the
> MediaSession API, which is rendered on screen and discarded.
>
> The feature is off by default, is enabled only after an in-app disclosure and
> affirmative consent, and the app is fully functional without it.

---

## 3. Technical deadlines in force or landing within 12 months

| Date | Requirement | Applies to Kiosk? | Confidence |
| --- | --- | --- | --- |
| **31 Aug 2026** | New apps and updates must target **API 36** (Android 16). Wear/Automotive: API 35. TV/XR: API 34. Extension to **1 Nov 2026** available via a Play Console form | **Yes** — already compliant, verify in CI | **[V]** |
| **31 Aug 2026** | New apps and updates must use **Play Billing Library 8+**. Extension to 1 Nov 2026 | **Yes**, the moment you add billing | **[V]** |
| **30 Sep 2026** | **Android Developer Verification** enforcement in BR / ID / SG / TH; apps must be registered by a verified developer to install on certified devices | Indirectly — publishing via Play normally auto-registers you; check Play Console Home | **[V]** |
| **1 Feb 2027** | **16 KB page size** support required for apps targeting API 35+; non-compliant apps cannot ship updates | **Yes** — RN/Expo ship native `.so`. AGP 8.5.1+ handles it; verify | **[V]** |
| **27 Jan 2027** | New **Contacts Permissions** policy (Contact Picker), **Location Permissions** policy (location button as minimum scope), geofencing removed as an approved foreground-service use, `READ_CALL_LOG` account-verification use case removed | **No** — Kiosk requests none of these | **[V]** |
| **31 Aug 2027** | PBL 8 itself sunsets; PBL 9+ required | Future | **[V]** |
| Ongoing | Existing apps must target API 35+ to stay visible to new users on newer Android | Yes, long-term | **[V]** |

Android 16 target behaviours that specifically bite a full-screen clock — verify
each on a tablet before you ship **[V]**:
- Edge-to-edge is enforced with **no opt-out** (`windowOptOutEdgeToEdgeEnforcement`
  is deprecated and disabled).
- On displays ≥ 600dp, `android:screenOrientation`, `resizableActivity="false"`,
  `minAspectRatio`/`maxAspectRatio` and `setRequestedOrientation()` are all
  **ignored**. The README mentions a landscape lock as a free feature — on a
  tablet it will now be silently ignored unless you set
  `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY`, and that opt-out stops working
  at API 37.
- `enableOnBackInvokedCallback="false"` (currently set) is the *temporary*
  predictive-back opt-out and is explicitly "not recommended for production".

---

## 4. What changed in 2026 that a year-old guide gets wrong

1. **Target API is 36, not 35.** A guide written in 2025 says "target API 35".
   From tomorrow that is a publish blocker. **[V]**
2. **Play Billing 8 is the floor, and 9 exists.** Guides saying "PBL 7 is fine"
   expire 31 Aug 2026. **[V]**
3. **Closed testing now measures engagement, not headcount.** Twelve testers who
   install and never open the app now fail. Reports place stricter engagement
   enforcement from around April 2026. Tester-farm services that just opt in and
   idle are now actively counterproductive. **[S]**
4. **The production-access questionnaire got harder.** It now asks what feedback
   you received and what you changed because of it. Non-specific answers are a
   common denial reason even after a clean 14 days. **[S]**
5. **Android Developer Verification exists** (announced Aug 2025, enforcement
   from 30 Sep 2026 in four countries, global 2027). This is *separate* from
   Play Console identity verification and is new vocabulary since 2025. **[V]**
6. **EU/DSA trader status is now enforced**, and a monetising individual is a
   trader — your name and address get published on the EU listing. Guides
   predating Feb 2025 do not mention this at all. **[S]**
7. **Unrated apps are explicitly disallowed** as clarified in the 15 July 2026
   policy announcement, and the same announcement tightened Data safety guidance
   on precise vs approximate location disclosure. **[S]**
8. **16 KB page-size enforcement has a firm date now** (1 Feb 2027) where 2025
   guides described it as advisory. **[V]**
9. **"Low-value app" enforcement sharpened in 2026.** Google reports blocking
   ~1.75M policy-violating apps and 80k+ developer accounts in 2025, and 2026
   guidance leans harder on originality and minimum functionality. A single-
   purpose clock is not automatically at risk — Kiosk has 8 faces, 8 backdrops,
   weather, media and volume control — but the listing must sell it as a
   product, not a toy. **[S]**
10. **`expo-in-app-purchases` is dead**; `expo-iap` is the maintained path and
    `react-native-iap` is being folded into it. A 2024-era Expo IAP tutorial
    will point you at an unsupported module on an unsupported billing library.
    **[S]**

---

## 5. Assets and artefacts to produce (checklist)

| Artefact | Who | Time | Notes |
| --- | --- | --- | --- |
| Launcher icon (real artwork, replaces scaffold) | Mixed | 2–4 h | Blocking, per README |
| 512×512 store icon | Mixed | 1 h | Derived from the launcher icon |
| 1024×500 feature graphic | Mixed | 2–3 h | Blocking — cannot publish without it |
| 4–8 phone screenshots @1080×1920 | Auto capture + Dev framing | 3–6 h | Must include a now-playing shot |
| Tablet screenshots (if claiming tablet support) | Mixed | 2–3 h | |
| Short (≤80) + full (≤4000) description | Dev | 2 h | Must name the now-playing feature |
| Privacy policy page | Mixed | 2–3 h | GitHub Pages; must cover notification access, met.no, Nominatim, the optional user endpoint, and the fact that nothing reaches the developer |
| **Demo video** for the permission justification | Dev | 1–2 h | 60–120s screen recording, unlisted YouTube. Show: app running → settings → the in-app disclosure → the system notification-access grant → the now-playing line appearing → toggling it off. Record this *before* you submit; it is the artefact people scramble for after a rejection **[I]** |
| Tester feedback log | Dev | ongoing | Feeds the production-access questionnaire |
| Release notes / changelog | Auto | 15 min | |

---

## 6. Risks and unknowns

### Blocking risks

**R1 — Notification listener does not match any published permitted use.
Severity: high. Confidence in the risk: medium-high.**
The three permitted uses I could reconstruct are wearable relay, notification
aggregation, and showing notifications on alternate UIs. Kiosk does none of them
literally. Best case: a reviewer reads the empty service and the media-only usage
and waves it through. Worst case: rejection, appeal, weeks, or a demand to remove
the feature. *Mitigation: ship v1 without it (see §2).*

**R2 — Personal-account closed testing is a hard 14-day floor with a soft
engagement bar. Severity: high. Confidence: high.**
You cannot buy your way past it, and 12 genuinely engaged testers for two weeks
is real social work. Engagement is now measured. Budget 3 weeks, not 2, and
recruit 15–18 people to survive attrition.

**R3 — Two publishing deadlines fall tomorrow. Severity: high (timing), low
(effort). Confidence: high.**
Target API 36 and PBL 8 both bite from 31 Aug 2026. Kiosk is already on API 36
and has no billing library at all, so neither is a code emergency — but any
billing work must start at PBL 8/9, and any "we'll upgrade the SDK later" plan is
now dead.

**R4 — EU trader status publishes a home address. Severity: medium-high.
Confidence: medium.**
A monetising individual is a trader; Google displays name, address, phone and
email on EU listings. If your only address is your flat, that goes public. Sort a
service address before A6, not after.

**R5 — Scaffold launcher icon and debug-keystore signing. Severity: medium.
Confidence: high (both self-documented in README).**
The debug keystore is an absolute blocker for Play; the scaffold icon is a
quality and ASO problem and a small "low-value app" signal.

### Secondary risks

**R6 — Data safety mis-declaration.** The instinct for a no-telemetry app is to
tick "no data collected". But the app sends a user-typed place to Nominatim and
coordinates to met.no. The correct answer is *Approximate location, collected,
processed ephemerally, not shared, App functionality*. A mismatch between the
declaration and observed network behaviour is a well-known enforcement trigger.
**[I]** on the specific answer; **[S]** on the ephemeral mechanism.

**R7 — The user-supplied `http://` now-playing endpoint.** Cleartext HTTP is
blocked by default on modern targets. Either the feature already fails for
`http://` URLs, or something enables cleartext app-wide — which is a security
posture question and shows up in Play Console warnings. Worth an explicit check;
prefer `https://`-only or a per-domain network security config over a blanket
`usesCleartextTraffic`. **[I]**

**R8 — Third-party API terms (not Play policy, but they can kill the feature).**
`api.met.no`: you must identify yourself in the User-Agent; generic, fake or
random UA strings get you **blocked, not throttled**, and deliberate circumvention
earns a permanent ban; >20 req/s is "heavy traffic" requiring permission.
Nominatim: absolute maximum **1 request/second**, a valid identifying
User-Agent or Referer is mandatory, results **must be cached**, repeated
identical queries can get you classified as faulty and blocked, and attribution
must be displayed. The repo already does all of this
(`src/weather/source.ts` sets a UA with a repo URL, truncates coordinates to 4dp
to hit MET's cache, and `app/settings.tsx` carries the attribution) — but the UA
string is `kiosk-clock/1.0 (https://github.com/...)`, and at Play scale you want
a reachable **email** in there and a per-install request budget you can defend.
A Play-scale install base pointing at a volunteer geocoder is a real operational
risk that has nothing to do with Google. **[S]**

**R9 — First-review latency.** First-time developers report 7–14 days for the
initial production review versus 1–7 days thereafter. Do not promise a launch
date inside three weeks of submitting. **[S]**

**R11 — The listing describes a Founder pack the shipped build does not sell.
Severity: high. Confidence: high.**
`src/billing/index.ts` points `activeBilling` at `testBilling`, which writes an
entitlement flag to local storage and moves no money; `src/billing/playBilling.ts`
is a stub. `store/copy.md` already flags this: a store listing that advertises a
purchase the binary cannot make is a Deceptive Behavior / misrepresentation
exposure, and the source is public so a reviewer can read it. Resolve it one of
two ways before submitting — finish the Play Billing wiring (Phase E) *or* cut
every mention of the pack and the word "purchase" from the listing and ship v1
free. Do not submit the listing ahead of the billing code. **[I]**

**R10 — "Kiosk" is a generic, crowded name.** 30 characters is plenty; consider
"Kiosk Clock" or similar for discoverability and to reduce any misleading-title
scrutiny. Not a policy blocker. **[I]**

### Unknowns I could not close

| # | Unknown | Why | What to do |
| --- | --- | --- | --- |
| U1 | Whether `BIND_NOTIFICATION_LISTENER_SERVICE` triggers an explicit Permissions Declaration Form | `support.google.com` and `play.google` are blocked in this environment; no third-party enumeration lists it | Upload an AAB to an internal track and look at App content → Sensitive app permissions. You get the answer in minutes, for free, before you commit to anything |
| U2 | Exact current wording of the notification-listener permitted-use list | Same block. Reconstructed consistently from two independent search summaries, but not read verbatim | Read article 16558241 (and the preview, 16909972) yourself before writing the declaration |
| U3 | First-hand approval/rejection reports for media-metadata notification listeners | Reddit / Stack Overflow unreachable here; nothing on point surfaced | Search r/androiddev for `getActiveSessions` + `notification access`; ask in the Play Developer Community before submitting |
| U4 | Whether Play Console's target-API and PBL extension request forms are live yet | Google said "later in 2026" | Check Policy status in Play Console if you need one |
| U5 | Precise identity-verification turnaround for a German individual in Aug 2026 | Reports range from hours to 5 business days | Start A3–A4 today; it costs $25 and unblocks everything else |
| U6 | Whether `expo-iap` 5.4.1 links PBL 8 or 9 specifically | npm metadata gives the version, not the transitive Android dependency | After `npx expo prebuild`, grep the generated Gradle files for `com.android.billingclient:billing` and confirm ≥ 8.0.0 |

---

## 7. If I were sequencing this

1. **Today**: pay the $25, start identity verification, start the payments
   profile. These are pure wall-clock and nothing else can start without them.
2. **This week**: decide the v1 scope question — with or without the notification
   listener. Then icon, keystore/Play App Signing, first manual AAB upload,
   service account, and *look at whether a sensitive-permissions form appears*
   (that answers U1 for free).
3. **Week 2**: listing assets, all App content declarations, billing on PBL 8/9
   with acknowledgement proven against a licence tester.
4. **Weeks 2–5**: closed testing with 15+ recruited testers, daily engagement
   nudges, written feedback log, and at least one shipped change traceable to
   tester feedback.
5. **Week 5**: apply for production access.
6. **Weeks 6–8**: first production review, staged rollout from 10%.
