<p align="center"><img src="../assets/logo.png" alt="Mimoe" width="90" /></p>

# Mimoe — Mobile

![Expo](https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Platforms](https://img.shields.io/badge/iOS%20·%20Android-lightgrey)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

iOS / Android app for [Mimoe](../README.md). Sends content via the system share sheet, receives the decrypted history in real time.

Stack: React Native · Expo · TypeScript.

## What it does

- **Send via the share sheet**: select text or an image in any app → Share → Mimoe → encrypted and sent.
- **Live history** over WebSocket, decrypted locally, with search, filters, favorites, swipe-to-hide.
- **Notifications** on receive (the push carries no content, just a wake-up).
- Seed-phrase onboarding, light/dark/system theme, 4 languages (fr/en/es/pt).

> **Why the share sheet and not automatic capture?** Since Android 10, an app without focus cannot read the clipboard in the background (and it's impossible on iOS). The share sheet is the only reliable, privacy-respecting path. One extra tap, but no intrusive permission.

## Crypto interop

The crypto is **identical** to the desktop (Argon2id + AES-256-GCM, same salt, keyed HMAC fingerprint). Rust ↔ JS interoperability is verified by locked test vectors on both sides: a divergence would break decryption silently, so it's treated as a contract.

## Dev

```bash
npm install
npx expo run:android      # or run:ios
```

**Not Expo Go**: the app uses native modules (Argon2 crypto, secure store, share intent). A dev build is required.

Prerequisites: a React Native environment (Android SDK / Xcode), and for push a Firebase `google-services.json` (not committed).

Read [`AGENTS.md`](AGENTS.md) before coding: Expo moves fast, refer to the versioned docs.

## License

[GPL-3.0](LICENSE).
