#!/usr/bin/env bash
#
# Builds an installable APK locally.
#
# Needs a JDK 17+ and an Android SDK; everything else it does itself. If you
# would rather not install those, push a tag instead and let CI build it —
# see the README.

set -euo pipefail

cd "$(dirname "$0")/.."

fail() { printf '\n%s\n\n' "$*" >&2; exit 1; }

command -v java >/dev/null 2>&1 || fail \
  "No JDK found. Install one, e.g.:
     Debian/Ubuntu   sudo apt install openjdk-17-jdk
     Arch            sudo pacman -S jdk17-openjdk
     Fedora          sudo dnf install java-17-openjdk-devel"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] && [ -d "$SDK" ] || fail \
  "No Android SDK found (ANDROID_HOME / ANDROID_SDK_ROOT is unset or wrong).

   Install Android Studio, or just the command line tools:
     https://developer.android.com/studio#command-line-tools-only
   Then, with the tools unpacked at \$HOME/Android/Sdk/cmdline-tools/latest:
     export ANDROID_HOME=\$HOME/Android/Sdk
     export PATH=\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin
     sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'"

echo "==> Checking native dependency versions"
node scripts/check-native-versions.mjs

# android/ is generated rather than committed, so it can never drift from
# app.json. Regenerating is cheap and keeps the two in step.
echo "==> Generating the native project"
npx expo prebuild --platform android --no-install

echo "==> Assembling release APK (first run downloads a lot; expect ~10 min)"
( cd android && ./gradlew assembleRelease --no-daemon )

APK=$(find android/app/build/outputs/apk/release -name '*.apk' | head -1)
[ -n "$APK" ] || fail "Gradle finished but produced no APK."

DEST="kiosk-clock.apk"
cp "$APK" "$DEST"

cat <<MSG

Built: $DEST  ($(du -h "$DEST" | cut -f1))

Install it over USB with debugging enabled:
    adb install -r $DEST

Or copy it to the phone and open it, allowing "install from unknown sources".

Signed with the debug keystore, which is what the React Native template
configures for release builds. Fine for sideloading, not for the Play Store.
MSG
