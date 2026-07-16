#!/usr/bin/env bash
# Signs the dev binary with a STABLE identity (Apple Development cert).
# Why: macOS (TCC) identifies the app by its signature. In dev, each build is
# re-signed "adhoc" with a different fingerprint -> macOS re-asks for permissions
# every time. Signing with the same identity (fixed team ID) makes granted
# authorizations PERSIST across rebuilds.
#
# Usage: ./scripts/sign-dev.sh   (after a build, before launching the app)
set -euo pipefail

IDENTITY="Apple Development: dupas.dev@gmail.com (8N9R4399V2)"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENTITLEMENTS="$HERE/src-tauri/entitlements.plist"
BIN="$HERE/src-tauri/target/debug/mimoe"

if [[ ! -f "$BIN" ]]; then
  echo "Binary not found: $BIN (run a build first)" >&2
  exit 1
fi

codesign --force --sign "$IDENTITY" \
  --entitlements "$ENTITLEMENTS" \
  --options runtime \
  --timestamp=none \
  "$BIN"

echo "Signed: $BIN"
codesign -dv --verbose=2 "$BIN" 2>&1 | grep -iE "Authority|TeamIdentifier|Signature" || true
