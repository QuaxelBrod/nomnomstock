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
