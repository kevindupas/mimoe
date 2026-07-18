# Mimoe — Server

![Laravel](https://img.shields.io/badge/Laravel-FF2D20?logo=laravel&logoColor=white)
![PHP](https://img.shields.io/badge/PHP_8.4-777BB4?logo=php&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

Backend for [Mimoe](../README.md): REST API + real-time broadcast. **It only ever sees ciphertext** — never the seed, the key, or plaintext.

Stack: Laravel · Laravel Reverb (WebSocket) · PostgreSQL · PHP 8.4.

## Role

- Multi-user accounts (email + password, per-device Sanctum tokens).
- Storage of encrypted clips and blobs (images/files), with TTL and cap.
- Real-time broadcast of new clips to the account's other devices (per-user private channel).
- Deduplication by **opaque** fingerprint (client-side keyed HMAC): merges identical content without ever knowing it.
- Optional FCM push (wakes a killed Android app) — carries no content.

## API

All routes are under `/api`. Bearer token auth (Sanctum) unless noted.

| Method | Route | Auth | Role |
| --- | --- | --- | --- |
| `GET` | `/server-info` | public | Instance capabilities (registrations open?) |
| `POST` | `/register` | public | Create account (strict throttle) |
| `POST` | `/login` | public | Sign in a device (strict throttle) |
| `GET` | `/clips` | token | History (ciphertext) |
| `POST` | `/clip` | token | Emit an encrypted clip |
| `PATCH` | `/clip/{id}/pin` | token | Pin / unpin |
| `DELETE` | `/clip/{id}` | token | Delete |
| `POST` | `/blob` | token | Upload an encrypted blob (image/file) |
| `GET` | `/blob/{id}` | token | Fetch a blob (account-scoped) |
| `POST` | `/push-token` | token | Register an FCM token |

Broadcast: private channel `clips.{userId}`, restricted to the owner (see `routes/channels.php`).

## Security

- Every clip/blob request is **`user_id`-scoped** — no cross-account access.
- Passwords hashed (bcrypt). **Constant-time** login (no enumeration oracle).
- Size caps on clips and blobs (storage DoS mitigation).
- Content is encrypted client-side: a database leak reveals no plaintext.

## Deployment (Docker)

```bash
cp .env.docker.example .env
# fill in at least: APP_KEY, DB_PASSWORD, REVERB_APP_ID/KEY/SECRET
docker compose up -d --build
```

Four services: `db` (Postgres), `app` (API on `:8000`, auto migrations), `reverb` (WebSocket on `:8080`), `scheduler` (TTL purge).

**Put it behind a TLS reverse proxy** (Caddy / nginx / Traefik). The device token travels in `Authorization: Bearer` — HTTPS is mandatory outside the local network. Behind a proxy, set `REVERB_CLIENT_PORT` to Reverb's public port.

## Key environment variables

| Variable | Role |
| --- | --- |
| `MIMOE_TTL_HOURS` | Clip lifetime (default 24) |
| `MIMOE_MAX_CLIPS` | Per-account cap (default 100) |
| `MIMOE_REGISTRATION_ENABLED` | `false` closes registrations (personal instance) |
| `REVERB_*` | WebSocket config (app_key is public, the secret is not) |
| `FIREBASE_CREDENTIALS` | Path to the FCM service account (empty = push disabled) |

## Dev

```bash
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate
php artisan serve --host=0.0.0.0 --port=8000   # API
php artisan reverb:start --host=0.0.0.0         # WebSocket
```

Tests (PHPUnit, in-memory SQLite):

```bash
php artisan test --testsuite=Feature
```

## License

[AGPL-3.0](LICENSE). Hosting a modified version requires publishing the changes.
