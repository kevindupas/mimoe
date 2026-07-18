# Contributing to Mimoe

Thanks for your interest! Mimoe is a monorepo: server, desktop and mobile in a single repository, because the crypto that ties them together evolves atomically.

## Structure

| Folder | Stack | README |
| --- | --- | --- |
| [`server/`](server/) | Laravel · Reverb · PostgreSQL | [server/README.md](server/README.md) |
| [`desktop/`](desktop/) | Tauri · Rust · React | [desktop/README.md](desktop/README.md) |
| [`mobile/`](mobile/) | React Native · Expo | [mobile/README.md](mobile/README.md) |

## The crypto interop contract ⚠️

This is **the** rule not to break. Desktop (Rust) and mobile (JS) must derive the **same key** and the **same fingerprint** for a given secret. A divergence raises no error: it breaks decryption silently.

- Any change touching key derivation, seed normalization, or the dedup fingerprint **must** update both platforms in the same change.
- Test vectors lock this contract (`crypto.rs` on the Rust side). If you change one, the test fails — update the value **after** verifying that Rust and JS produce the same output.
- The Argon2 salt (`SHARED_SALT`) is **frozen**: changing it breaks every already-paired device.

## Before opening a PR

Run what applies to your change:

```bash
# server
cd server && php artisan test --testsuite=Feature

# desktop
cd desktop && npx tsc --noEmit && (cd src-tauri && cargo test --lib)

# mobile
cd mobile && npx tsc --noEmit
```

- Match the surrounding code style (naming, comment density, idioms).
- One commit = one coherent topic; a clear message explaining the *why*.
- For a security issue, **no public PR**: see [SECURITY.md](SECURITY.md).

## Licenses

By contributing, you agree that your code is published under the license of the component involved: **AGPL-3.0** for `server/`, **GPL-3.0** for `desktop/` and `mobile/`.

> Note: source code comments are currently in French (the project's original language). New contributions may be in English; a full comment translation may happen later.
