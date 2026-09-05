# Publishing on F-Droid

F-Droid distributes only free software, and builds every app itself from
source. That is the whole of why this document exists: one library in this
project is not free, and the build that goes to F-Droid has to be a different
build from the one that goes to Play.

> **Not verified against F-Droid's own documentation.** `f-droid.org` is
> unreachable from the environment this was written in, so the policy summary
> below is from knowledge and should be checked against the current Inclusion
> Policy before anything is submitted. The *technical* claims — which library
> is proprietary, and what the build produces — were all verified directly and
> are noted as such.

---

## The one blocker

Exactly one proprietary artifact reaches the Play build:

```
com.android.billingclient:billing:9.1.0        (compile scope)
  └── io.github.hyochan.openiap:openiap-google:3.5.0
        └── expo-iap
```

Verified by reading `openiap-google`'s published POM, which names it as a
compile-scope dependency. Google's Play Billing Library is distributed under
the Android SDK terms, not a free licence, and F-Droid's scanner rejects
builds that bundle it.

**Everything else is free.** The npm tree is 439 MIT, 23 ISC, 12 Apache-2.0,
11 BSD-2-Clause, 8 BSD-3-Clause, 5 BlueOak-1.0.0, 3 MPL-2.0, 2 Unlicense and
2 0BSD; the bundled font is OFL-1.1. No module in the project pulls Google
Play Services or Firebase — checked across every `android/build.gradle` in
`node_modules`. Remove the billing library and the app is buildable entirely
from free software.

---

## What an F-Droid user gets

**Everything, unlocked, from first launch.** No watermark, no purchase screen,
no nag.

That is not generosity, it is the only honest option. A build that cannot
reach a store cannot sell anything, so the alternative would be shipping a
locked app with a watermark nobody can remove and a purchase button that
cannot work.

The consequence is worth stating plainly: **the Founder pack is free to
anyone who installs from F-Droid.** Someone who wants the paid features
without paying can simply use that build. That asymmetry is the price of
being in both places, and given what the revenue is realistically worth (see
`market-plan.md`), it is a price worth paying to be in the store whose
audience actually matches this app.

---

## Building the storeless variant

This is the same build the sideload APK uses, for the same reason: a
sideloaded app cannot reach Play Billing either — purchases only work for apps
Play itself installed — so both need the store taken out. CI builds it by
default; `store: play` has to be asked for explicitly.

Two things have to change together, and they are separate mechanisms because
autolinking reads its exclusions from `package.json` or a command-line flag,
and neither can be driven by an environment variable.

```sh
node scripts/prepare-storeless.mjs                              # native side
KIOSK_STORE=none npx expo prebuild --platform android --no-install
cd android && KIOSK_STORE=none ./gradlew assembleRelease
```

- `scripts/prepare-storeless.mjs` adds `expo-iap` to `expo.autolinking.exclude`,
  so the generated Gradle project contains no billing library at all. It is
  idempotent and prints what it changed.
- `KIOSK_STORE=none` makes `app.config.js` set `extra.store`, which selects
  `src/billing/freeBilling.ts` instead of the Play adapter. It fails closed:
  anything other than exactly `none` gives the paid build.

Verified: autolinking resolves **20 modules with `expo-iap`** by default and
**19 without** after the script runs; `expo config` reports `store = play` and
`store = none` respectively; and the storeless port's strings are present in
the exported Hermes bundle.

---

## Still to do

1. **Replace `LICENSE`.** It is still Expo's template licence, naming 650
   Industries as the copyright holder. F-Droid requires a real, declared free
   licence and this is a hard blocker — nothing can be submitted until it is
   fixed.
2. **Write the metadata and open a merge request** against `fdroiddata` on
   F-Droid's GitLab. The recipe has to run the two commands above.
3. **Expect friction, and budget for it.** This is an Expo app: `android/` is
   generated rather than committed, so the recipe needs npm and a prebuild
   step before Gradle ever runs. F-Droid can do this and other React Native
   apps are listed, but it is more moving parts than a plain Android project,
   and the review queue is measured in weeks to months rather than days.

Nothing about the Play build changes. `main` stays the Play build; the
F-Droid variant is produced by running one script and setting one variable.
