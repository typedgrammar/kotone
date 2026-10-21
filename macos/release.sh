#!/usr/bin/env bash
# Builds the downloadable Kotone: for Apple Silicon, signed with a Developer ID under the Hardened
# Runtime, notarized and stapled, as a zip (about 550 KB) and a DMG (drag to Applications) —
# then, with --publish, a GitHub release with both.
#
#   macos/release.sh [--no-notarize] [--publish]
#
# Needs a "Developer ID Application" identity in the keychain and a notarytool credential
# profile (NOTARY_PROFILE, default KOTONE_NOTARY), made once with
#   xcrun notarytool store-credentials KOTONE_NOTARY --key AuthKey_….p8 --key-id … --issuer …
# The version is CFBundleShortVersionString in macos/Info.plist; the release is tagged v<version>.
set -euo pipefail
cd "$(dirname "$0")/.."

NOTARIZE=1
PUBLISH=0
for arg in "$@"; do
  case $arg in
    --no-notarize) NOTARIZE=0 ;;
    --publish) PUBLISH=1 ;;
    *) echo "unknown option $arg" >&2; exit 2 ;;
  esac
done
PROFILE=${NOTARY_PROFILE:-KOTONE_NOTARY}
VERSION=$(plutil -extract CFBundleShortVersionString raw macos/Info.plist)
IDENTITY=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)
[ -n "$IDENTITY" ] || { echo "✗ no Developer ID Application identity in the keychain" >&2; exit 1; }
APP=build/Kotone.app
ZIP=build/Kotone-$VERSION.zip
DMG=build/Kotone-$VERSION.dmg
echo "==> Kotone $VERSION, signed by $IDENTITY, notarize: $([ $NOTARIZE = 1 ] && echo "yes ($PROFILE)" || echo no)"

notarize() {
  # fails early (and says why) when the profile is missing or Apple wants an agreement signed
  xcrun notarytool submit "$1" --keychain-profile "$PROFILE" --wait --timeout 30m | tee build/notary.log
  grep -q "status: Accepted" build/notary.log || {
    id=$(sed -n 's/^ *id: //p' build/notary.log | head -1)
    [ -n "$id" ] && xcrun notarytool log "$id" --keychain-profile "$PROFILE"
    exit 1
  }
}

ARCH=arm64 ./macos/build.sh
codesign --force --options runtime --timestamp --entitlements macos/Kotone.entitlements --sign "$IDENTITY" "$APP"
codesign --verify --strict --verbose=2 "$APP"

# notarized and stapled before it's zipped, so it opens offline too
if [ $NOTARIZE = 1 ]; then
  ditto -c -k --keepParent "$APP" build/Kotone-notarize.zip
  notarize build/Kotone-notarize.zip
  rm build/Kotone-notarize.zip
  xcrun stapler staple "$APP"
  spctl --assess --type execute -v "$APP"
fi
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
echo "✓ $ZIP ($(du -h "$ZIP" | cut -f1 | tr -d ' '))"

# the DMG holds the same stapled app, and is notarized and stapled itself
STAGE=build/dmg
rm -rf "$STAGE" "$DMG"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Kotone.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname Kotone -srcfolder "$STAGE" -ov -format ULMO "$DMG" >/dev/null
rm -rf "$STAGE"
codesign --force --timestamp --sign "$IDENTITY" "$DMG"
if [ $NOTARIZE = 1 ]; then
  notarize "$DMG"
  xcrun stapler staple "$DMG"
  spctl --assess --type open --context context:primary-signature -v "$DMG"
fi
echo "✓ $DMG ($(du -h "$DMG" | cut -f1 | tr -d ' '))"

if [ $PUBLISH = 1 ]; then
  [ $NOTARIZE = 1 ] || { echo "✗ won't publish a build that isn't notarized" >&2; exit 1; }
  gh release create "v$VERSION" "$ZIP" "$DMG" --target "$(git rev-parse HEAD)" --title "Kotone $VERSION" --notes-file macos/release-notes.md
fi
