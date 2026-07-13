# Clipd

Presse-papier partagé **self-hosted** et **chiffré de bout en bout** entre un téléphone Android et un ordinateur (macOS, Windows, Linux via Tauri). Copie sur un appareil, retrouve-le sur l'autre — le serveur ne voit jamais que du ciphertext.

Alternative open-source et soignée aux presse-papiers cloud, taillée pour un écosystème perso.

## Principes

1. **E2E** — le contenu est chiffré sur l'appareil source (AES-256-GCM, clé dérivée d'une passphrase partagée via Argon2id). Le serveur stocke et relaie du ciphertext opaque.
2. **Anti-boucle** — une écriture locale du presse-papier ne redéclenche pas d'envoi (hash suivi en mémoire, jamais transmis).
3. **Pas d'auto-paste destructeur** — un clip reçu va dans l'historique ; l'utilisateur choisit explicitement de le recopier.
4. **Flag sensible** — les copies marquées sensibles (mots de passe) sont ignorées.
5. **TTL** — 24 h ou 100 derniers clips, purge automatique.

## Architecture

```
Android (Compose)          Serveur Laravel + Reverb          Desktop (Tauri)
  • Share Sheet (envoi)  ──── POST /clip (ciphertext) ────►  • menu bar
  • service + notifs     ◄─── WebSocket push (ciphertext) ─  • historique + hotkey
  • chiffre/déchiffre        Postgres = ciphertext only        • chiffre/déchiffre
```

Ce sont toujours les clients qui initient la connexion (POST + WebSocket sortants) → traverse NAT/CGNAT/4G/5G sans config. Exposition serveur via Tailscale ou reverse proxy TLS.

## Composants

| Dossier | Stack | Rôle |
| --- | --- | --- |
| `server/` | Laravel + Reverb + PostgreSQL | API `POST /clip`, broadcast temps réel, purge TTL, auth par token appareil |
| `desktop/` | Tauri (Rust + TS) | App menu bar : réception, historique, écriture presse-papier, hotkey global, émission |
| `android/` | Kotlin + Jetpack Compose | Onboarding, historique, réception (foreground service + notifs), envoi via Share Sheet |

La crypto est identique sur les trois plateformes (Argon2id + AES-256-GCM, même sel partagé) — interopérabilité vérifiée par tests.

## Comptes

Chaque instance héberge plusieurs utilisateurs. Un compte (email + mot de passe) relie tous tes appareils avec un **historique isolé**. L'authentification passe par des tokens Sanctum ; les mots de passe sont hashés (bcrypt). L'onboarding des clients = **serveur → inscription/connexion → passphrase**.

## Déploiement (Docker)

```bash
cd server
cp .env.docker.example .env
docker compose run --rm app php artisan key:generate --show   # colle la clé dans .env (APP_KEY)
# édite .env : DB_PASSWORD, REVERB_APP_KEY, REVERB_APP_SECRET
docker compose up -d --build
```

Lance quatre services : `db` (Postgres), `app` (API sur `:8000`, migrations auto), `reverb` (WebSocket sur `:8080`), `scheduler` (purge TTL). Expose ensuite comme tu veux : domaine + TLS (reverse proxy Caddy/Traefik), VPN, ou LAN — c'est le choix de l'hébergeur. Derrière un proxy TLS, mets `REVERB_CLIENT_PORT` sur le port public de Reverb.

## Démarrage rapide (dev)

**Serveur**
```bash
cd server
composer install && cp .env.example .env && php artisan key:generate
php artisan migrate
php artisan serve --host=0.0.0.0 --port=8000   # API
php artisan reverb:start --host=0.0.0.0         # WebSocket
```

**Desktop**
```bash
cd desktop
npm install
npm run tauri dev
```

**Android**
```bash
cd android
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

À la première ouverture, chaque client suit un onboarding : serveur, inscription/connexion, puis **la même passphrase** sur tous tes appareils (elle chiffre le contenu ; le serveur ne la voit jamais).

## Sécurité de la clé

La passphrase ne quitte jamais l'appareil. La clé dérivée est stockée dans le trousseau natif (Keychain macOS / Android Keystore), jamais en base ni transmise.

## Licence

MIT.
