/**
 * Turns a checkout into the storeless build F-Droid can compile.
 *
 * F-Droid distributes only free software, and that includes what an app links
 * against. Exactly one proprietary artifact reaches this build:
 * `com.android.billingclient:billing`, pulled in at compile scope by
 * `io.github.hyochan.openiap:openiap-google`, which arrives with `expo-iap`.
 * Nothing else in the tree is non-free — the npm dependencies are MIT, ISC,
 * Apache-2.0, BSD and MPL, and no module pulls Play Services.
 *
 * So this excludes that one module from autolinking. The Gradle project
 * generated afterwards has no billing library in it at all, which is the
 * difference between an app F-Droid's scanner rejects and one it accepts.
 *
 * It is a script rather than a second config file because autolinking reads
 * its exclusions from package.json or a command-line flag, and neither can be
 * driven by an environment variable the way the rest of the build is.
 *
 * Run before prebuild, with the matching environment variable so the JavaScript
 * side agrees with the native side:
 *
 *   node scripts/fdroid-prepare.mjs
 *   KIOSK_STORE=none npx expo prebuild --platform android --no-install
 *   KIOSK_STORE=none ./gradlew assembleRelease
 *
 * Idempotent, and it prints what it changed.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const STORELESS = 'expo-iap';
const PATH = 'package.json';

const pkg = JSON.parse(readFileSync(PATH, 'utf8'));
pkg.expo ??= {};
pkg.expo.autolinking ??= {};
const exclude = pkg.expo.autolinking.exclude ?? [];

if (exclude.includes(STORELESS)) {
  console.log(`already excluded: ${STORELESS}`);
} else {
  pkg.expo.autolinking.exclude = [...exclude, STORELESS];
  writeFileSync(PATH, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`excluded from autolinking: ${STORELESS}`);
}

console.log(`exclusions now: ${pkg.expo.autolinking.exclude.join(', ')}`);
console.log('remember: KIOSK_STORE=none for prebuild and the gradle build');
