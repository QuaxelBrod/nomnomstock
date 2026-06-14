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
- ADMIN_MAINTENANCE_TOKEN (fuer lokale Reparaturkonsole)
- APP_URL
- NEXTAUTH_URL

Wichtige Vertragsvariablen für den Split:
- BACKEND_URL
- NEXT_PUBLIC_API_BASE
- API_BASE_URL (public URL reachable by the ESP scanner, including `/api/v1`)
- LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL für lokale OpenAI-kompatible Server wie llama.cpp
- OLLAMA_URL / OLLAMA_MODEL nur für Ollama

Empfehlung in Compose:
- BACKEND_URL=http://backend:3001
- NEXT_PUBLIC_API_BASE=http://backend:3001
- API_BASE_URL=https://example.tld/api/v1
- LLM_PROVIDER=openai
- LLM_BASE_URL=http://host-or-ip:11433

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
- data (SQLite DB und Backend-Uploads unter `/data/uploads`)

6) Logs und Prüfung
-------------------

```sh
docker compose -f docker-compose.prod.yml logs -f backend web
docker compose -f docker-compose.prod.yml ps
```

7) Lokale Admin-/Maintenance-Konsole
------------------------------------

Die Backend-Admin-Konsole ist nicht fuer nginx gedacht. In Production bindet Compose
den Backend-Port an die konfigurierte Admin-IP:

```sh
http://192.168.178.29:8070/admin
```

Setze vorher einen starken Token:

```sh
ADMIN_MAINTENANCE_TOKEN=<openssl-rand-base64-32>
ADMIN_MAINTENANCE_BIND_IP=192.168.178.29
ADMIN_MAINTENANCE_PORT=8070
```

Alternativ nur lokal binden und per SSH-Tunnel oeffnen:

```sh
ADMIN_MAINTENANCE_BIND_IP=127.0.0.1
ssh -L 8070:127.0.0.1:8070 user@server
```

Danach lokal im Browser `http://127.0.0.1:8070/admin` aufrufen.

8) Häufige Fehler
-----------------
- Frontend erreicht API nicht:
	- BACKEND_URL/NEXT_PUBLIC_API_BASE prüfen (intern auf http://backend:3001)
- Login/Session fehlschlägt:
	- NEXTAUTH_SECRET identisch in web und backend halten
	- NEXTAUTH_URL/APP_URL auf öffentliche URL setzen
- Migration fehlt:
	- migrate Service einmalig ausführen
