# Launch plan

The ordered path from here to live on Google Play, what is already done, and
the two decisions that change the shape of everything after them.

Companion documents, all in this folder: `play-requirements.md` (the researched
requirement checklist, with every claim marked verified / second-hand /
inferred), `privacy-policy.md`, `data-safety.md`, `content-rating.md`. Listing
text and images are in `../store/`.

---

## Two decisions to make first

Both change the critical path. Neither can be made for you.

### 1. Does v1 read the device media session?

The now-playing feature has two sources: an HTTP endpoint you configure, and —
on Android only — the device's own media session, which requires the user to
grant **Notification Access**.

That grant is the single largest risk in this launch. Play treats it as a
sensitive capability, and the permitted uses that could be established are
notification *relay*, *aggregation*, and *display on alternate surfaces*. This
app does none of them literally: it displays no notifications at all and never
receives one — the listener service exists only because holding the grant is
what makes `MediaSessionManager.getActiveSessions()` callable. That argument is
true, defensible, and has to be made to a human reviewer.

No first-hand report of a media-metadata listener passing or failing Play
review could be found either way. That absence is itself the finding.

**Recommendation: ship v1 with the endpoint source only.** The feature stays in
the listing, the code stays in the tree behind its existing source selection,
and the device-session half arrives in v1.1 — where a policy rejection costs a
release rather than your first launch and the fourteen-day testing gate you
will already have cleared. This is not dropping a feature; it is not
serialising a policy review in front of a launch.

### 2. Does v1 sell the Founder pack?

Today it cannot. `src/billing/index.ts` uses the local test port: a release
built from `main` right now gives every paid face, backdrop and feature away
for nothing. Listing an in-app purchase that the shipped binary does not
implement is a misrepresentation risk, and the source is public.

Three options:

- **Free v1, pack in v1.1.** Fastest. Nothing to declare, no billing review, no
  licence testers. The watermark must come out of v1 or the free app looks
  broken.
- **Finish Play Billing first.** Needs a Play account, a live product, and a
  build on a track before the product resolves on-device — so it cannot even be
  tested until step 3 below. Note Play Billing Library **8 or newer** is
  required for new submissions as of 31 August 2026; do not start on 7.
- **Ship the pack unlocked and honest.** Everything free, no purchase in the
  listing, sell later.

**Recommendation: free v1.** Get an app live, clear production access, build
account history — then monetise into an audience that exists.

---

## Where it stands

Done and verified:

| | |
|---|---|
| Target API 36 | required for new apps from 31 Aug 2026; Expo SDK 57 already compiles and targets 36 |
| Release pipeline | one CI run produces a Play `.aab` and a sideload `.apk` |
| Signing | config plugin injects an upload key from CI secrets; falls back to the debug key with a loud warning when absent |
| Version code | from the CI run number, so it always rises |
| Permission surface | `INTERNET`, `VIBRATE`, and one AndroidX signature permission — asserted against the *merged* manifest on every build |
| Backups | `allowBackup="false"` |
| Icon | the app's own rings dial, at every required size |
| Store images | 8 screenshots at 1080×1920, 1024×500 feature graphic, 512×512 icon, all verified opaque |
| Listing copy | title, short and full descriptions, what's-new |
| Privacy policy | written, accurate to the code, needs hosting at a URL |
| Data safety | answered question by question |
| Content rating | answered |

Not done, and blocking:

1. **No Play account.** $25, identity verification, days not minutes.
2. **No upload key.** Four secrets; the workflow header has the exact commands.
3. **Privacy policy is not at a URL.** GitHub Pages from this repo is the
   obvious host; steps are at the end of `privacy-policy.md`.
4. **The `LICENSE` file is Expo's template licence**, naming 650 Industries as
   copyright holder. Replace it with your own before the repository is cited
   anywhere in the listing.
5. **The closed test has not started.** This is the long pole: 12 testers,
   14 continuous days.

---

## The critical path

Times are calendar, not effort. Steps 1–3 can overlap with 4–6.

| # | Step | Who | Elapsed |
|---|---|---|---|
| 1 | Create the Play developer account, pay $25, complete identity verification | you | 1–5 days |
| 2 | Generate the upload key, add the four repo secrets, run the workflow, confirm the `.aab` is signed | you, 20 min | same day |
| 3 | Publish the privacy policy to a URL | you, 20 min | same day |
| 4 | Create the app in Console, upload the `.aab` to **internal testing**, install it on your own phone from the Play link | you | same day |
| 5 | **Look at App content → Sensitive app permissions.** The form is generated from your uploaded bundle. This is the cheapest possible answer to whether the notification listener triggers a declaration — minutes, free, before committing to anything | you | same day |
| 6 | Fill the listing: images from `store/`, copy from `store/copy.md`, data safety, content rating, target audience, ads/news/government declarations | you, 2–3 h | same day |
| 7 | Promote to **closed testing**. Recruit **15–18** testers, not 12 — the requirement is 12 opted in *continuously* and attrition is real | you | 1–3 days to recruit |
| 8 | Wait 14 days. Keep a written log of feedback and what you changed; production access is judged on engagement, not install count | — | **14 days** |
| 9 | Apply for production access | you, 30 min | 1–7 days review |
| 10 | Submit to production | you | 1–7 days review |

**Realistic total: 5–7 weeks** on the free-v1 path. Add 2–6 weeks if the
notification listener draws a policy review.

---

## What is automated

`npm run typecheck`, `check:native` and `check:manifest` all run in CI on every
build. The manifest check earned its place on the first release build it gated,
catching a permission nobody had anticipated.

To cut a release: push a `v*` tag, or run the workflow from the Actions tab.
The `.aab` is the artifact to upload; the `.apk` is for your own phone.

---

## Risks, in the order they are likely to bite

1. **Notification access review.** See decision 1. Prepare a screen recording
   showing what the grant is used for regardless of whether a form appears.
2. **Testing attrition.** Twelve is a floor on *continuous* opt-in, and the
   clock restarts on a gap. Over-recruit.
3. **EU trader status.** Monetising as an individual makes you a trader under
   the DSA, and Play publishes the trader's name, address, phone and email on
   EU listings. Arrange a service address *before* filling the declaration.
   This is a further argument for a free v1.
4. **"Kiosk" is the wrong name on Play.** The word is owned by a different
   category there — employee time-clocks and device lockdown. `store/copy.md`
   proposes alternatives; the leading recommendation is *Kiosk: Phosphor Clock*.
5. **Android 16 ignores orientation locks on large screens.** On displays
   600dp and wider, `screenOrientation` is ignored. Phone-only launch avoids
   this; a tablet listing does not.
6. **16 KB memory page alignment, from 1 Feb 2027.** React Native ships native
   `.so` files. Verify with `bundletool dump config` well before then.

---

## Not blocking, worth doing

- The in-app accent named "claude" — a store listing describing another
  company's product name reads as an association you do not have. The listing
  copy already calls it "a warm accent"; renaming it in the app would close the
  gap.
- No crash reporting. Shipping blind is a real cost, but adding Sentry or
  Crashlytics turns "no data collected" into a data-safety disclosure. A
  deliberate trade, not an oversight — revisit once there are users.
