<p align="center"><img src="../assets/logo.png" alt="Mimoe" width="90" /></p>

# Mimoe — Desktop

![Tauri](https://img.shields.io/badge/Tauri_2-24C8DB?logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

Menu-bar app for [Mimoe](../README.md) on macOS / Windows / Linux. Captures the clipboard, shows the decrypted history, writes the clipboard on demand.

Stack: Tauri 2 · Rust (native backend) · React 19 + TypeScript + Tailwind 4 (webview) · Vite.

## What it does

- **Automatic capture** of the clipboard (text, images, files) → encrypt → send.
- **Live history** over WebSocket, decrypted locally, with search, filters, favorites, masking.
- **Writes** a clip to the system clipboard on user action.
- **"Sensitive" copies**: the seed and password-manager copies are never sent.
- Seed-phrase onboarding (generate + verify, or type on an additional device).

## Internal architecture

The sensitive logic (crypto, clipboard, WebSocket, secrets) lives in **Rust**; the webview never receives the key.

```mermaid
graph LR
    subgraph Rust["Rust (native, trusted core)"]
        CLIP["clipboard.rs<br/>capture + emit"]
        SYS["clip_sys/<br/>NSPasteboard / Win32"]
        CRYPTO["crypto.rs<br/>AES-GCM · Argon2 · HMAC"]
        RT["realtime.rs<br/>native WebSocket"]
        STORE["store.rs<br/>Keychain / Credential Mgr"]
    end
    subgraph Web["Webview (React)"]
        UI["history · settings<br/>onboarding"]
    end
    CLIP --> CRYPTO
    CLIP --> SYS
    UI -- "Tauri commands<br/>(never the key)" --> Rust
    RT --> UI

    classDef r fill:#0b3d2e,stroke:#3fbfa8,color:#fff;
    classDef w fill:#1d2530,stroke:#5b7cfa,color:#fff;
    class CLIP,SYS,CRYPTO,RT,STORE r;
    class UI w;
```

The native clipboard is abstracted per platform in [`src-tauri/src/clip_sys/`](src-tauri/src/clip_sys/): `macos.rs` (NSPasteboard) and `windows.rs` (Win32 via `clipboard-win`). The orchestration (loop, dedup, encryption, send) is shared. Adding Linux = adding a `linux.rs`.

The WebSocket runs in a **native Rust thread** (tungstenite), not in the webview: WKWebView freezes when the window is hidden.

## Dev

```bash
npm install
npm run tauri dev
```

Prerequisites: Rust (MSVC toolchain on Windows), the [Tauri system dependencies](https://tauri.app/start/prerequisites/), WebView2 (bundled on Windows 11).

## Build

```bash
npm run tauri build
```

## License

[GPL-3.0](LICENSE).
