#!/usr/bin/env bash
# Runs the SIGNED dev app (stable identity -> no macOS permission popup),
# with the vite server (HMR) in the background. All-in-one.
#
# The debug binary loads http://localhost:1420 (devUrl) -> vite MUST be running.
# We start it if needed, wait for the port, then build -> sign -> run.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

VITE_PID=""
cleanup() { [[ -n "$VITE_PID" ]] && kill "$VITE_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# 1. Vite (HMR) if not already running.
if ! lsof -iTCP:1420 -sTCP:LISTEN -P >/dev/null 2>&1; then
  echo "-> starting vite (HMR)..."
  npm run dev >/tmp/mimoe-vite.log 2>&1 &
  VITE_PID=$!
  for _ in $(seq 1 60); do
    lsof -iTCP:1420 -sTCP:LISTEN -P >/dev/null 2>&1 && break
    sleep 0.5
  done
  if ! lsof -iTCP:1420 -sTCP:LISTEN -P >/dev/null 2>&1; then
    echo "vite did not start (see /tmp/mimoe-vite.log)" >&2
    exit 1
  fi
else
  echo "-> vite already running on :1420"
fi

# 2. Rust build (debug).
echo "-> build..."
cargo build --manifest-path src-tauri/Cargo.toml

# 3. Stable signature (persistent macOS permissions).
echo "-> signing..."
./scripts/sign-dev.sh

# 4. Launch.
echo "-> launching Mimoe..."
./src-tauri/target/debug/mimoe
