Deployment (Docker Compose - Split Runtime)
===========================================

Dieses Projekt läuft in Production mit zwei getrennten Services:
- web (Next.js Frontend)
- backend (Express API)

Zusätzlich:
- migrate (one-off Prisma Migration/Seed)
- studio (optional via tools profile)

Wichtige Dateien
----------------
- Dockerfile.prod
- docker-compose.prod.yml
- .env.example

1) .env anlegen
---------------
Im Projekt-Root:

```sh
cp .env.example .env
```

Pflichtwerte in .env:
- NEXTAUTH_SECRET
- APP_URL
- NEXTAUTH_URL

Wichtige Vertragsvariablen für den Split:
- BACKEND_URL
- NEXT_PUBLIC_API_BASE

Empfehlung in Compose:
- BACKEND_URL=http://backend:3001
- NEXT_PUBLIC_API_BASE=http://backend:3001

2) Build und Start
------------------

```sh
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend web
```

Frontend ist danach auf Port 8069 erreichbar (Standard aus Compose).

3) Migrationen ausführen
------------------------

```sh
docker compose -f docker-compose.prod.yml run --rm migrate
```

Dieser Schritt führt aus:
- prisma generate
- prisma migrate deploy
- optional backend/prisma/seed.js

4) Optional: Prisma Studio
--------------------------

```sh
docker compose -f docker-compose.prod.yml --profile tools up -d studio
```

Studio ist dann auf Port 8068 verfügbar.

5) Persistenz
-------------
Die Production-Compose nutzt Named Volumes:
- data (SQLite DB)
- uploads (Produkt-/Profilbilder, von backend und web gemeinsam verwendet)

6) Logs und Prüfung
-------------------

```sh
docker compose -f docker-compose.prod.yml logs -f backend web
docker compose -f docker-compose.prod.yml ps
```

7) Häufige Fehler
-----------------
- Frontend erreicht API nicht:
	- BACKEND_URL/NEXT_PUBLIC_API_BASE prüfen (intern auf http://backend:3001)
- Login/Session fehlschlägt:
	- NEXTAUTH_SECRET identisch in web und backend halten
	- NEXTAUTH_URL/APP_URL auf öffentliche URL setzen
- Migration fehlt:
	- migrate Service einmalig ausführen
