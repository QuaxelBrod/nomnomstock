# Progress — nomnomstock

Datum: 2026-04-04

Kurzstatus der Implementierungs-Phasen und Stories (Priorität/Sequenz beibehalten):

 - [x] Initialize repo & scaffolding
  - Beschreibung: Grundgerüst/Scaffold-Dateien erstellt (README, Dockerfile, docker-compose.yml, package.json, .env.example, VS Code Launch). Weiteres Scaffold (Next.js) per `npx create-next-app` empfohlen.

 - [x] Docker + SQLite mounting
  - Beschreibung: `Dockerfile` + `docker-compose.yml` erstellt; `./data/nomnom.db` als Volume mount; `DATABASE_URL` gesetzt. Lokale SQLite-Datei angelegt und Prisma-Migration angewendet.

  - Befehle ausgeführt:
```
cp .env.example .env
mkdir -p data && touch data/nomnom.db
npm install
npm run prisma:generate
DATABASE_URL=file:./data/nomnom.db npm run prisma:migrate
DATABASE_URL=file:./data/nomnom.db npm run prisma:seed
```

 - [x] Prisma schema & migrations
  - Beschreibung: `prisma/schema.prisma` erstellt; `prisma/seed.js` hinzugefügt; `package.json`-Scripts:
    - `npm run prisma:generate` — Prisma Client generieren
    - `npm run prisma:migrate` — Migration lokal erstellen und anwenden
    - `npm run prisma:studio` — Prisma Studio starten
    - `npm run prisma:seed` — Seed-Daten (Default Household + Admin)
  - Nächste Schritte (lokal ausführen):
```
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

 - [x] Next.js UI skeleton
  - Beschreibung: Grundlegendes App-Router-Gerüst (`app/layout.tsx`, `app/page.tsx`) und Tailwind-Styling (`styles/globals.css`, `tailwind.config.js`, `postcss.config.js`) erstellt.
  - UI-Komponenten: `components/BottomNav.tsx` angelegt; Seiten:
    - `app/lager/page.tsx`
    - `app/scan/page.tsx`
    - `app/einkauf/page.tsx`
    - `app/verlauf/page.tsx`
    - `app/profil/page.tsx`

- [x] Barcode scanning flow
  - Beschreibung: Kamera-Scanner (z. B. `react-zxing`), Scan-UI, Übergabe an Server Action.

 - [x] Product lookup & API clients
  - Beschreibung: Server Action `app/actions/productLookup.ts` erstellt. Helpers in `lib/api/lookup.ts` für OpenFoodFacts/OpenBeautyFacts hinzugefügt. `lib/prisma.ts` liefert Prisma-Client.
  - Hinweise: `productLookup(barcode)` prüft lokal, dann OpenFoodFacts, dann OpenBeautyFacts und legt gefundene Produkte in DB an.
  - Integration: Scan-Flow ist mit Lookup verbunden — `app/scan` ruft `/api/lookup` bei Scan auf und bietet ein `Einbuchen`-UI an, das POST `/api/stock` nutzt.

 - [x] Stock CRUD & history
  - Beschreibung: REST-API Route-Handler unter `app/api/stock` erstellt (GET, POST); Einzel-Routes `app/api/stock/[id]` (PATCH, DELETE) und `app/api/stock/[id]/reduce` (POST) implementiert. Client-Komponente `components/StockList.tsx` zeigt Bestände und ermöglicht Entnahme.
  - Hinweise: `reduce` legt `history` Eintrag an, reduziert Menge und legt optional `ShoppingListItem` an, wenn Bestand leer ist und `toShopping` gesetzt wird.

 - [x] Auth & household management
  - Beschreibung: Credentials-based auth implementiert (email/password) mit NextAuth Credentials Provider und Prisma Adapter. Endpoints:
    - `app/api/auth/[...nextauth]/route.ts` — NextAuth handler (Credentials)
    - `app/api/auth/register/route.ts` — einfacher Registrierungs-Endpoint (erstellt Household + Admin)
  - Hinweise: Passwörter werden mit `bcryptjs` gehasht. Setze `NEXTAUTH_SECRET` in `.env`.

- [ ] Shopping list workflows
  - Beschreibung: Einkaufsliste UI; Gekauft-Flow (Scan → Einbuchen); Sync/Edge-Cases.

- [ ] Ollama integration & config
  - Beschreibung: `getRecipeSuggestions.ts`, env-Variablen (`OLLAMA_*`), Docker-Service-Option, Fallbacks, Prompt-Parameter.

- [ ] PWA, offline & debug
  - Beschreibung: `manifest.json`, Service Worker (`next-pwa` optional), lokale Dev-Start-Anleitung, VS Code Launch-Config.

- [ ] Tests, CI & docs
  - Beschreibung: Unit/Integration-Tests; GitHub Actions; `README.md` mit lokalen Start-/Debug-Schritten.

- [ ] Release & deployment
  - Beschreibung: Docker-Image Build, Deployment-Guide, Release-Notes.

---

Nächster Schritt: Starte mit `Initialize repo & scaffolding` (Repository scaffolding und Basis-README). Wenn gewünscht, teile ich die erste Story in kleinere Tasks auf (Branches/PR-Größen).
