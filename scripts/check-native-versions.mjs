/**
 * Fails when an installed native package drifts from the version Expo pins for
 * this SDK.
 *
 * `expo install` normally prevents this, but it resolves versions through
 * Expo's HTTP API, which is not always reachable. Transitive native
 * dependencies are the real hazard: expo-router peer-depends on
 * react-native-reanimated with no upper bound, so a plain `npm install` takes
 * the latest, which pulls a react-native-worklets that expo-modules-core does
 * not compile against. That surfaces as a C++ error nine minutes into a
 * Gradle build; this surfaces it in about a second.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const expected = require('expo/bundledNativeModules.json');
const semver = require('semver');

const mismatches = [];
let checked = 0;

for (const [name, range] of Object.entries(expected)) {
  let installed;
  try {
    installed = require(`${name}/package.json`).version;
  } catch {
    continue; // Not installed, so not our problem.
  }

  checked += 1;
  if (!semver.satisfies(installed, range)) {
    mismatches.push({ name, installed, range });
  }
}

if (mismatches.length === 0) {
  console.log(`All ${checked} installed native packages match the Expo SDK pins.`);
  process.exit(0);
}

console.error(`${mismatches.length} of ${checked} native packages drifted:\n`);
for (const { name, installed, range } of mismatches) {
  console.error(`  ${name}: installed ${installed}, expected ${range}`);
}
console.error('\nPin the expected version as a direct dependency, or run `npx expo install --fix`.');
process.exit(1);
