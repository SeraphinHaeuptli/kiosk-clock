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
  [
    'android.permission.ACCESS_NETWORK_STATE',
    'the Play Billing library, which checks connectivity before a store call.' +
      ' Contributed transitively — openiap-google declares only BILLING and' +
      ' INTERNET, and this appeared in the merged manifest the moment expo-iap' +
      ' arrived. A normal permission: granted at install, no prompt, and it' +
      ' reveals whether there is a connection, not anything about it. Left in' +
      ' rather than blocked because getActiveNetworkInfo throws without it,' +
      ' and silently breaking payments to drop a promptless permission is a' +
      ' bad trade.',
  ],
  [
    'com.android.vending.BILLING',
    'Google Play Billing, for the one-off founder pack. Contributed by' +
      " expo-iap's own manifest, not requested here, and the only way Play" +
      ' permits a digital unlock inside a Play-distributed app to be sold.',
  ],
  [
    'com.kioskclock.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
    'AndroidX, targeting API 33+ — a signature permission scoped to this app,' +
      ' guarding its own dynamically registered receivers. Not user-facing and' +
      ' not grantable to anything not signed with the same key.',
  ],
]);

/** Things that must be present, not merely permitted. */
const REQUIRED_STRINGS = [
  ['android:allowBackup="false"', 'backups staying off'],
];

/**
 * Things that must NOT be present.
 *
 * v1 reads now playing from the configured endpoint only. The device-session
 * half works and stays in the tree, but its notification listener is excluded
 * from the build in package.json under `expo.autolinking.exclude`.
 *
 * The exclusion is asserted here, against the merged manifest, because that is
 * the only place it counts: Play generates the sensitive-permission
 * declaration from the uploaded bundle, so a listener that is declared but
 * never called would draw the policy review and return nothing for it. Half a
 * feature and all of the risk is the one combination worth failing a build
 * over.
 *
 * To ship it in v1.1: drop the exclusion from package.json and move these two
 * lines back into REQUIRED_STRINGS.
 */
const FORBIDDEN_STRINGS = [
  ['expo.modules.nowplaying.KioskNotificationListener', 'the notification listener service'],
  ['android.permission.BIND_NOTIFICATION_LISTENER_SERVICE', 'the system-only bind permission guarding it'],
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

  for (const [needle, what] of FORBIDDEN_STRINGS) {
    if (xml.includes(needle)) {
      failed = true;
      console.error(
        `  PRESENT and must not be: ${what} (${needle})\n` +
          '  v1 ships the endpoint source only. If this is deliberate, see the\n' +
          '  note above FORBIDDEN_STRINGS for the two lines to change.',
      );
    }
  }
}

if (failed) process.exit(1);
console.log('\nManifest surface is exactly as intended.');
