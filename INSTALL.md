Install & Entwickeln (pnpm)
=============================

Voraussetzungen:
- Node.js 18+
- pnpm (https://pnpm.io) installiert

Schnellstart:

```bash
# im Repo-Root
pnpm install

# Prisma generieren + Migration (lokal sqlite)
pnpm --filter nomnomstock-backend run prisma:generate
DATABASE_URL=file:./data/nomnom.db pnpm --filter nomnomstock-backend run prisma:migrate
DATABASE_URL=file:./data/nomnom.db pnpm --filter nomnomstock-backend run prisma:seed

# Frontend + Backend parallel starten
pnpm dev
```

Tipps:
- Einzelstart Backend: `pnpm --filter nomnomstock-backend run dev`
- Einzelstart Frontend: `pnpm --filter nomnomstock-web run dev`
- Einzelbuild komplett: `pnpm build`

Minimale .env Werte (lokal):

```bash
APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change_me
BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_API_BASE=http://localhost:3001
DATABASE_URL=file:./data/nomnom.db
EMAIL_AUTH_ENABLED=false
```
