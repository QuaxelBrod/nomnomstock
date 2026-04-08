**Deployment (Docker Compose - Production)**

- **Zweck:** Anleitung zum sauberen Deployment mit leerer SQLite‑DB, Migrationen und Optionalem Seeding.

**Voraussetzungen (Server)**
- Docker & Docker Compose installiert
- Git-Repository auf Server oder Code kopiert
- Offener Port 80/443 (Reverse proxy empfohlen)

**Wichtige Dateien**
- `Dockerfile.prod` – Production multi-stage Image
- `docker-compose.prod.yml` – Compose mit `nomnomstock` und `migrate` one-off
- `scripts/init-db.sh` – Entrypoint: generiert Prisma Client, führt Migrationen aus und seedet bei Erststart
- `scripts/generate-secret.sh` – erzeugt starken `NEXTAUTH_SECRET`

**1) `.env` anlegen (Beispiel)**
Erstelle im Projekt-Root eine `.env` mit mindestens diesen Variablen:

DATABASE_URL=file:/data/nomnom.db
NODE_ENV=production
NEXTAUTH_SECRET=<starker_random_string>
APP_URL=https://example.com

# Optional (E‑Mail)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# Optional (LLM)
OLLAMA_URL=
OLLAMA_MODEL=

Hinweis: Erzeuge `NEXTAUTH_SECRET` lokal mit:
```sh
chmod +x scripts/generate-secret.sh
./scripts/generate-secret.sh
```

**2) Datenverzeichnis vorbereiten**
```sh
mkdir -p ./data
chown -R $USER:$USER ./data
rm -f ./data/nomnom.db   # falls frischer Start gewünscht
```

**3) Build & Start (Production)**
```sh
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d nomnomstock
```

**4) Migrationen & Seed (one-off)**
Führe die Migrationen einmalig aus (nutze den enthaltenen `migrate` service):
```sh
docker compose -f docker-compose.prod.yml run --rm migrate
```
Das führt `npx prisma generate && npx prisma migrate deploy` und optional `prisma/seed.js` aus.

Alternativ (wenn Entrypoint verwendet wird) wird `init-db.sh` beim Containerstart ausgeführt und führt `prisma generate` + `migrate deploy` automatisch; seeding läuft nur, wenn die DB neu angelegt wurde.

**5) Logs & Prüfung**
- Logs: `docker compose -f docker-compose.prod.yml logs -f nomnomstock`
- Prüfe DB auf Host: `ls -l data/nomnom.db`

**6) Backup & Restore (kurz)**
- Backup: `docker compose -f docker-compose.prod.yml down` dann `cp data/nomnom.db /backup/location/nomnom.db` oder stoppe Container und kopiere Datei.
- Restore: stoppe Container, kopiere DB ins `./data/nomnom.db`, starte Container neu.

**7) Reverse Proxy / HTTPS**
- Empfohlen: Traefik/Caddy/Nginx vor den Containern setzen. Setze `APP_URL` auf die öffentliche URL.

**8) Troubleshooting**
- `@prisma/client` fehlt / Buildfehler → führe `docker compose -f docker-compose.prod.yml run --rm nomnomstock npx prisma generate`
- Migration schlägt fehl → `docker compose -f docker-compose.prod.yml run --rm nomnomstock npx prisma migrate status` und Logs prüfen

Wenn du möchtest, erstelle ich noch ein kurzes Systemd‑Service‑Snippet oder eine Anleitung für Traefik/Let's Encrypt Integration.
