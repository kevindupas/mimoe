#!/usr/bin/env bash
# Signe le binaire de dev avec une identité STABLE (cert Apple Development).
# But : macOS (TCC) identifie l'app par sa signature. En dev, chaque build est
# re-signé "adhoc" avec une empreinte différente → macOS redemande les permissions
# à chaque fois. En signant avec la même identité (team ID fixe), les autorisations
# accordées PERSISTENT à travers les rebuilds.
#
# Usage : ./scripts/sign-dev.sh   (après un build, avant de lancer l'app)
set -euo pipefail

IDENTITY="Apple Development: dupas.dev@gmail.com (8N9R4399V2)"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ENTITLEMENTS="$HERE/src-tauri/entitlements.plist"
BIN="$HERE/src-tauri/target/debug/mimoe"

if [[ ! -f "$BIN" ]]; then
  echo "Binaire introuvable : $BIN (lance d'abord un build)" >&2
  exit 1
fi

codesign --force --sign "$IDENTITY" \
  --entitlements "$ENTITLEMENTS" \
  --options runtime \
  --timestamp=none \
  "$BIN"

echo "Signé : $BIN"
codesign -dv --verbose=2 "$BIN" 2>&1 | grep -iE "Authority|TeamIdentifier|Signature" || true
