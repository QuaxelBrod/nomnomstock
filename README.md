# nomnomstock

> Lightweight household inventory & shopping list manager

This repository contains nomnomstock — a small Next.js application to manage products, stock by location, shopping lists and a simple history of actions. It supports barcode scanning, PWA install, and (planned) voice control.

## Quick overview

- Frontend: Next.js (App Router), Tailwind CSS
- Auth: NextAuth (Credentials) + Prisma (SQLite)
- Database: Prisma + SQLite (file-based for simple deployments)
- Barcode scanning: ZXing in the browser
- PWA: manifest + service worker
- APIs: REST-style handlers under `app/api/*`

This README explains features, local setup, deployment hints and common troubleshooting steps.

---

## Features

- Inventory (Stock) per Location (e.g. `Kühlschrank`, `Keller`)
- Product lookup (local DB + OpenFoodFacts fallback)
- Add / Reduce / Move stock with audit entries
- Shopping list: add items manually or via stock reduction
- Barcode scanner UI to lookup/add products
- PWA installable with offline-capable service worker
- Household support: data isolated per household

Planned:
- Voice control (ASR + Ollama parsing)
- Server-side ASR fallback (Whisper/whisper.cpp)

---

## Getting started (local development)

Prerequisites:

- Node.js 18+ and npm
- Git

Clone and install:

```bash
git clone <repo-url>
cd nomnomstock
npm install
```

Create environment file (copy example):

```bash
cp .env.example .env
# Edit .env — at minimum set NEXTAUTH_SECRET and DATABASE_URL
```

Initialize Prisma and seed DB (local development):

```bash
npm run prisma:generate
DATABASE_URL=file:./data/nomnom.db npm run prisma:migrate
DATABASE_URL=file:./data/nomnom.db npm run prisma:seed
```

Run in development:

```bash
npm run dev
# Open http://localhost:3000
```

---

## Docker (production-like)

Build and run with Docker Compose (example):

```bash
docker compose -f docker-compose.prod.yml build --no-cache app
docker compose -f docker-compose.prod.yml up -d app
```

Important env vars for production:

- `DATABASE_URL` — e.g. `file:./data/nomnom.db` or a proper DB connection URL
- `NEXTAUTH_URL` — full URL of the app, e.g. `https://example.com/nomnomstock`
- `NEXTAUTH_SECRET` — strong random secret
- `NEXT_PUBLIC_BASE_PATH` — if app is served under a subpath (e.g. `/nomnomstock`)
- Email / SMTP settings (for invites/activation)

Note: The Dockerfile expects `emails/` to be copied into the runtime image so templates exist.

---

## Usage guide (end user)

1. Open the app and register or log in.
2. Use the bottom navigation to access `Lager`, `Scan`, `Einkauf`, `Rezepte`, `Profil`.
3. To add stock: Scan barcode on `Scan` page, verify product and choose `Einbuchen`.
4. To reduce stock: Go to `Lager`, select the product, use the reduce action.
5. To add shopping items: `Einkauf` → `Produkt hinzufügen` (name, quantity, note).

Tips:
- Use descriptive location names (Kühlschrank, Speisekammer) for reliable voice/entity matches later.
- Use Scan-Flow to avoid duplicate products.

---

## API quick reference

These endpoints are implemented as Next.js route handlers under `app/api`:

- `GET /api/stock` — list stocks (aggregated)
- `POST /api/stock` — add stock (productId or barcode, quantity, locationId)
- `POST /api/stock/{id}/reduce` — reduce a stock entry (amount, toShopping)
- `POST /api/stock/move` — move quantity from a stock entry to a location
- `GET/POST /api/shopping` — read/add shopping items
- `GET /api/locations` — list locations; `POST` create
- `POST /api/lookup` — lookup product by barcode

All mutation endpoints require authentication (NextAuth JWT/token). See the code for exact request/response shapes.

---

## PWA & Service Worker

The app is PWA-enabled with a `manifest.webmanifest` and `public/sw.js`. If you deploy under a subpath (e.g. `/nomnomstock`), ensure `NEXT_PUBLIC_BASE_PATH` and `manifest` entries are aligned. When updating the SW, clear the client PWA/install to avoid stale cached behavior.

Troubleshooting common PWA issues:

- Empty or stale page after install: uninstall PWA, clear site data, reopen and reinstall. Ensure the server serves `manifest.webmanifest` with correct `start_url` and `scope`.
- SW caches: we bump cache names (`nomnom-static-v*`) on updates to invalidate old caches.

---

## Voice control (planned)

High-level plan:

- MVP: Browser ASR (Chrome `SpeechRecognition`) + Ollama for parsing into structured JSON intent.
- V1 intents: `shopping_add`, `stock_reduce`, `stock_move`, `stock_add`, `stock_query`.
- Server validates parsed result, resolves product/location names to IDs and executes via existing services.

Safety: All destructive actions require a confirmation UI unless confidence is high.

---

## Troubleshooting & Debug

- If the root path served by your reverse proxy returns an empty `200`, check Nginx/Proxy config for conflicting `location` blocks. Recommended canonical Nginx snippet for a subpath:

```nginx
location = /nomnomstock { return 308 /nomnomstock/; }
location ^~ /nomnomstock/ {
	proxy_pass http://127.0.0.1:3000;
	proxy_set_header Host $host;
	proxy_set_header X-Forwarded-Prefix /nomnomstock;
	proxy_set_header X-Forwarded-Proto $scheme;
	proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_http_version 1.1;
	proxy_buffering off;
}
```

- Check live headers:

```bash
curl -sSI https://your-domain/nomnomstock/ | sed -n '1,20p'
curl -sS https://your-domain/nomnomstock/manifest.webmanifest | sed -n '1,80p'
```

---

## Contributing

1. Create an issue describing the change.
2. Create a feature branch `feat/<short-desc>`.
3. Add tests and documentation where appropriate.
4. Open a PR with a clear description.

---

## Project status

See `progress.md` for a project task list and current priorities. Major remaining items:

- Shopping list workflows
- Ollama integration & voice parsing
- PWA/offline polishing and tests
- CI, tests and release automation

---

If you want, I can now:
- Add a short INSTALL.md with environment variable examples and `nginx` examples, or
- Generate a short API reference (OpenAPI / simple markdown) for the implemented endpoints.

Enjoy — if you want the README adjusted for printing (PDF-optimized CSS or shorter version), tell me which format you prefer.
# nomnomstock

Kurzanleitung zum Entwickeln und Starten

Voraussetzungen

- Node.js 18+
- npm / pnpm
- Docker (optional für Compose)

Lokale Entwicklung (ohne Docker)

```bash
cp .env.example .env
npm install
# ggf. SQLite-Datei initialisieren: mkdir -p data && touch data/nomnom.db
npm run dev
```

Mit Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Wichtige Dateien

- `docker-compose.yml` – Dev/Compose-Konfiguration
- `Dockerfile` – Container-Build
- `./data/nomnom.db` – gemountete SQLite-Datei (nicht im VCS)
- `prisma/` – (optional) Prisma-Schema & Migrationen
- `implementation_plan.md` – Implementierungsplan
- `progress.md` – Aktueller Fortschritt

Nächste Schritte

1. `npx create-next-app@latest . --typescript --tailwind --eslint --app` zum vollständigen Scaffold (optional)
2. Prisma optional initialisieren: `npx prisma init --datasource-provider sqlite`
3. Dev-Start: `npm run dev` (s. oben)

Auth setup

- Set the following environment variables in `.env` (or your environment):

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<a-secure-random-string>
```

For production, choose a secure random `NEXTAUTH_SECRET` and configure TLS and proper session storage.
