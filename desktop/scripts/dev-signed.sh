#!/usr/bin/env bash
# Lance l'app de dev SIGNÉE (identité stable → pas de popup de permissions macOS),
# avec le serveur vite (HMR) en arrière-plan. Tout-en-un.
#
# Le binaire debug charge http://localhost:1420 (devUrl) → vite DOIT tourner.
# On le démarre si besoin, on attend le port, puis build → sign → run.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

VITE_PID=""
cleanup() { [[ -n "$VITE_PID" ]] && kill "$VITE_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# 1. Vite (HMR) si pas déjà lancé.
if ! lsof -iTCP:1420 -sTCP:LISTEN -P >/dev/null 2>&1; then
  echo "→ démarrage de vite (HMR)…"
  npm run dev >/tmp/mimoe-vite.log 2>&1 &
  VITE_PID=$!
  for _ in $(seq 1 60); do
    lsof -iTCP:1420 -sTCP:LISTEN -P >/dev/null 2>&1 && break
    sleep 0.5
  done
  if ! lsof -iTCP:1420 -sTCP:LISTEN -P >/dev/null 2>&1; then
    echo "vite n'a pas démarré (voir /tmp/mimoe-vite.log)" >&2
    exit 1
  fi
else
  echo "→ vite déjà en cours sur :1420"
fi

# 2. Build Rust (debug).
echo "→ build…"
cargo build --manifest-path src-tauri/Cargo.toml

# 3. Signature stable (permissions macOS persistantes).
echo "→ signature…"
./scripts/sign-dev.sh

# 4. Lancement.
echo "→ lancement de Mimoe…"
./src-tauri/target/debug/mimoe
