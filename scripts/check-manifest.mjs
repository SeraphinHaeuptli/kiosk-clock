/**
 * Asserts what the built app actually asks the operating system for.
 *
 * app.json says which permissions to block, but blocking works by writing
 * `tools:node="remove"` into the source manifest and letting Gradle's manifest
 * merger resolve it against every library's own manifest. Whether that
 * actually happened is only knowable after the merge — and a dependency added
 * next month can reintroduce a permission without anyone noticing, because
 * nothing in the source tree changes.
 *
 * So this reads the merged manifest, the one that becomes the APK, and fails
 * the build if the permission surface is not exactly what was intended.
 *
 * Run it after a release build: `node scripts/check-manifest.mjs`
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'android/app/build/intermediates/merged_manifests';

/** Everything the app is allowed to ask for, and why. */
const ALLOWED = new Map([
  ['android.permission.INTERNET', 'weather and the optional now-playing endpoint'],
  ['android.permission.VIBRATE', 'the haptic tick on the volume bar'],
]);

/** Things that must be present, not merely permitted. */
const REQUIRED_STRINGS = [
  // The listener service has to survive the merge or notification access, and
  // with it the whole now-playing feature, silently stops working.
  ['expo.modules.nowplaying.KioskNotificationListener', 'the notification listener service'],
  ['android.permission.BIND_NOTIFICATION_LISTENER_SERVICE', 'the system-only bind permission guarding it'],
  ['android:allowBackup="false"', 'backups staying off'],
];

function findManifests(dir) {
  let found = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }

  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found = found.concat(findManifests(path));
    else if (entry === 'AndroidManifest.xml') found.push(path);
  }
  return found;
}

const manifests = findManifests(ROOT);
if (manifests.length === 0) {
  console.error(
    `No merged manifest under ${ROOT}.\n` +
      'Run a release build first — this checks the merge output, not the source.',
  );
  process.exit(1);
}

let failed = false;

for (const path of manifests) {
  const xml = readFileSync(path, 'utf8');
  const asked = [
    ...xml.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g),
  ].map((match) => match[1]);

  console.log(`\n${path}`);

  const unexpected = asked.filter((name) => !ALLOWED.has(name));
  const missing = [...ALLOWED.keys()].filter((name) => !asked.includes(name));

  for (const name of asked) {
    const reason = ALLOWED.get(name);
    console.log(`  ${reason ? 'ok  ' : 'BAD '} ${name}${reason ? `  — ${reason}` : ''}`);
  }

  if (unexpected.length > 0) {
    failed = true;
    console.error(
      `\n  ${unexpected.length} permission(s) not in the allowlist. Either the app\n` +
        '  genuinely needs them — add them to ALLOWED here with a reason, and to the\n' +
        '  store listing and privacy policy — or block them in app.json under\n' +
        '  android.blockedPermissions.',
    );
  }

  if (missing.length > 0) {
    failed = true;
    console.error(`\n  Expected but absent: ${missing.join(', ')}`);
  }

  for (const [needle, what] of REQUIRED_STRINGS) {
    if (!xml.includes(needle)) {
      failed = true;
      console.error(`  MISSING: ${what} (${needle})`);
    }
  }
}

if (failed) process.exit(1);
console.log('\nManifest surface is exactly as intended.');
