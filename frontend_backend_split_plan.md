# Frontend-Backend-Trennung und ESP-Scanner-Plan

Stand: 2026-05-29

## Aktueller Zustand

- Das Repository ist bereits als pnpm-Workspace angelegt: `backend`, `frontends/*`, `packages/*`.
- Das Backend ist ein Express-Server unter `backend/src/server.ts` und enthaelt heute den Grossteil der fachlichen API: Auth-Registrierung, Produkte, Lager, Orte, Einkauf, Profil, Rezepte.
- Das Web-Frontend ist eine Next.js-App unter `frontends/web`.
- Das Frontend nutzt eine Catch-all-Proxy-Route unter `frontends/web/app/api/[...proxy]/route.ts`, um `/api/*` an das Backend weiterzuleiten.
- Web-Login laeuft weiter ueber NextAuth im Frontend. Die Credentials-Pruefung wird gegen `POST /api/auth/credentials` im Backend gemacht.
- `frontends/web/lib` ist ein Symlink auf das Root-`lib`. Dadurch ist die Layer-Grenze unscharf.
- Prisma-Schema liegt doppelt in `prisma/schema.prisma` und `backend/prisma/schema.prisma`; Migrationen liegen aktuell nur im Root-`prisma/migrations`.
- Uploads werden vom Backend in `frontends/web/public/uploads` geschrieben. Das koppelt Backend an die Web-App-Struktur.
- `packages/shared` existiert, enthaelt aber nur einen minimalen API-Client und wenige DTOs.

## Zielbild

- Backend ist die einzige fachliche API und besitzt Datenbank, Migrationen, Dateiablage, Auth-Pruefung und externe Integrationen.
- Web ist ein Frontend-Client. Es kann fuer Browser-Komfort weiter einen Same-Origin-Proxy und NextAuth-Session-Cookies nutzen, aber keine DB- oder Backend-Dateistrukturen direkt besitzen.
- Externe Clients, inklusive ESP-Scanner, nutzen die Backend-API direkt ueber versionierte Endpoints und Bearer-Token.
- Gemeinsame DTOs, API-Client und ggf. OpenAPI/Zod-Schemata liegen in `packages/shared`.
- Deployment kann Web und API getrennt betreiben: `web` public, `backend` intern oder unter eigener public API-URL.

## Architekturentscheidungen

1. NextAuth bleibt vorerst im Web, damit der bestehende Browser-Login nicht neu gebaut werden muss.
2. Das Backend validiert zwei Auth-Arten:
   - NextAuth-JWT aus Cookie fuer das bestehende Web-Frontend.
   - Backend-eigene API-Tokens fuer ESP und andere Frontends.
3. API-Tokens werden nie im Klartext gespeichert, sondern nur gehasht.
4. Barcodes/QR-Codes fuer Geraete enthalten keine dauerhaften Credentials. Sie enthalten nur einen kurzlebigen Pairing-Key oder eine Pairing-URL.
5. Neue API wird unter `/api/v1/*` eingefuehrt. Bestehende `/api/*` Routen bleiben zunaechst als Kompatibilitaet bestehen oder werden intern auf v1 gemappt.

## Phasenplan

### Phase 0 Ergebnis

Umgesetzt am 2026-05-29:

- `pnpm run typecheck` prueft `packages/shared`, `backend` und `frontends/web`.
- `pnpm run smoke:flows:web` prueft die bestehenden Flows ueber den Web-Proxy.
- `pnpm run smoke:flows:backend` prueft dieselben fachlichen API-Flows direkt gegen das Backend; Login bleibt bis zur API-Token-Phase ueber Web/NextAuth.
- Neue Build-Artefakte sollen nicht mehr committed werden: `dist/`, `.next/`, `*.tsbuildinfo`.

### Phase 1 Ergebnis

Umgesetzt am 2026-05-30:

- `backend/prisma` ist die einzige Prisma-Quelle. Die Migrationen liegen jetzt unter `backend/prisma/migrations`; das Root-`prisma` wurde entfernt.
- `frontends/web/lib` ist kein Symlink mehr. Die Web-Auth-Konfiguration und Web-Env-Initialisierung liegen direkt im Web-Paket.
- Das alte Root-`lib` wurde entfernt; Backend-Hilfen liegen unter `backend/lib`.
- Uploads sind backend-owned. Das Backend schreibt nach `UPLOAD_DIR` und served `/uploads/*`; das Web proxyt `/uploads/*` nur noch an das Backend.
- Neue lokale DB-, Upload- und Build-Artefakte sind ignoriert. Bereits getrackte generierte Artefakte wurden aus dem Arbeitsbaum entfernt.
- `nomnomstock-shared` wird vom Web aus dem Workspace-Source transpiliert, damit `packages/shared/dist` nicht mehr versioniert werden muss.

### Phase 2 Ergebnis

Umgesetzt am 2026-05-30:

- Bestehende `/api/*` Routen bleiben kompatibel; neue Clients koennen die gleichen fachlichen Routen unter `/api/v1/*` nutzen.
- Das Backend liefert `GET /api/v1/openapi.json` und strukturierte 404-API-Fehler.
- `packages/shared` enthaelt erweiterte DTOs, einen versionierten API-Client und normalisierte `ApiRequestError`-Fehler.
- `docs/api-v1.md` dokumentiert den aktuellen externen API-Vertrag fuer Web, kuenftige Frontends und den ESP-Scanner.
- Erste Web-Server-Aufrufe nutzen die Shared-Client-Methoden statt ad-hoc Pfade.
- `backend/src/server.ts` ist auf App-Setup und Routenregistrierung reduziert; fachliche Handler liegen unter `backend/src/routes/*`, gemeinsame Backend-Helfer unter `backend/src/serverUtils.ts`.
- Verifiziert mit `pnpm run typecheck`, Web-Smoke, direktem Backend-Smoke und direktem `/api/v1`-Backend-Smoke.

### Phase 3 Ergebnis

Umgesetzt am 2026-05-30:

- Prisma enthaelt `ApiToken`, `Device` und `DevicePairing` inklusive Migration.
- `requireAuth` prueft zuerst `Authorization: Bearer <token>` und danach bestehende NextAuth-Cookies.
- API-Tokens werden als SHA-256-Hash gespeichert; Klartext-Tokens werden nur bei erfolgreichem Pairing ausgegeben.
- Device-Token besitzen Scopes. Der Standard fuer Scanner ist `scanner:write`, `product:lookup`, `stock:add`, `location:read`.
- Neue Endpoints:
  - `POST /api/v1/devices/pairing` erzeugt einen kurzlebigen Pairing-Key und QR-Payload.
  - `POST /api/v1/devices/pair` tauscht den Pairing-Key einmalig gegen Device-Token und API-Basis-URL.
  - `GET /api/v1/devices` listet gekoppelte Geraete.
  - `POST /api/v1/devices/:id/revoke` widerruft Geraet und Tokens.
- Fuer 1D-only ESP-Scanner zeigt das Web den Pairing-Key als Code-128-Barcode. Der ESP braucht die API-Basis vorerst vorkonfiguriert.
- `POST /api/v1/scanner/events` speichert 1D-Scans als Haushalt-/Device-gebundene Events; Web-Clients koennen sie ueber `GET/PATCH /api/v1/scanner/events` verarbeiten.
- Die Profilseite enthaelt eine erste "Scanner koppeln"-UI inklusive Geraeteliste und Widerruf.
- Die Scan-Seite zeigt pending ESP-Scans und kann sie einbuchen oder ignorieren.
- Shared DTOs und API-Client kennen die Device-/Pairing-Methoden.

### Phase 0: Bestand stabilisieren

- Typechecks fuer `backend`, `frontends/web` und `packages/shared` als Pflicht-Check dokumentieren.
- Aktuelle Smoke-Flows gegen Web-Proxy und zusaetzlich direkt gegen Backend ausfuehrbar machen.
- Entscheiden, ob `dist/`, `.next/` und generierte Artefakte im Repository bleiben sollen.

### Phase 1: Eindeutige Ownership herstellen

- Prisma nach `backend/prisma` als einzige Quelle festlegen.
- Root-`prisma/migrations` nach `backend/prisma/migrations` verschieben und Root-`prisma` entfernen oder nur noch als README/Verweis behalten.
- Root-`lib/authOptions.ts` nach `frontends/web/lib/authOptions.ts` verschieben und den Symlink `frontends/web/lib -> ../../lib` entfernen.
- Backend-Hilfen aus Root-`lib` nach `backend/lib` verschieben oder loeschen, falls sie Duplikate sind.
- Uploads ins Backend verschieben: z. B. `/data/uploads` plus `GET /uploads/*` oder `GET /api/v1/media/*`.

### Phase 2: API-Vertrag sauberziehen

- `backend/src/server.ts` in Module aufteilen: `auth`, `products`, `locations`, `stock`, `shopping`, `profile`, `recipes`, `devices`.
- Request-Validierung einfuehren, bevorzugt mit Zod oder einem vergleichbaren Schema.
- Einheitliche Fehlerform definieren: `{ error: { code, message, details? } }`.
- `packages/shared` mit DTOs, Request/Response-Typen und einem API-Client erweitern.
- API-Dokumentation erzeugen oder pflegen, idealerweise OpenAPI fuer externe Frontends.

### Phase 3: Auth fuer externe Clients

- Neue Tabellen/Modelle einfuehren:
  - `ApiToken`: gehashter Token, Scope, Ablaufdatum, letzter Zugriff, revokedAt.
  - `Device`: Name, Typ, Haushalt, Status, defaultLocationId, defaultMode.
  - `DevicePairing`: kurzlebiger Pairing-Key, Haushalt, User, Ablauf, usedAt.
- Backend-Auth-Middleware umbauen:
  - Erst `Authorization: Bearer <token>` pruefen.
  - Danach bestehendes NextAuth-Cookie pruefen.
  - Ergebnis ist ein einheitlicher Auth-Kontext mit `userId`, `householdId`, `role`, `scopes`, `clientType`.
- Scopes fuer ESP minimal halten, z. B. `scanner:write`, `product:lookup`, optional `stock:add`.

### Phase 4: ESP-Pairing-Flow

- Web-UI: Seite "Scanner koppeln" im Profil.
- Backend erzeugt Pairing-Key mit 5-10 Minuten Ablaufzeit.
- Web zeigt QR-Code oder 1D-Barcode an.
- Empfohlener QR-Payload:
  - `{"v":1,"api":"https://example.tld/api/v1","pair":"<one-time-key>"}`
- Falls der ESP nur 1D-Barcodes lesen kann:
  - Barcode enthaelt nur den Pairing-Key.
  - API-Basis-URL muss auf dem ESP vorkonfiguriert sein oder ueber einen zweiten, kurzen Konfigurations-Barcode gesetzt werden.
- ESP ruft `POST /api/v1/devices/pair` mit Pairing-Key und Geraeteinfos auf.
- Backend gibt genau einmal `deviceId`, `apiBase`, `token`, `scopes`, `defaultMode` zurueck.
- ESP speichert den Token und nutzt danach `Authorization: Bearer <token>`.
- Web zeigt gekoppelte Geraete mit "Token rotieren" und "Geraet widerrufen".

### Phase 5: Scanner-API

MVP fuer den ESP:

- `POST /api/v1/scanner/events`
  - Body: `{ "barcode": "...", "source": "esp", "mode"?: "lookup" | "stock_add" | "shopping_check" }`
  - Auth: Device Bearer Token.
  - Wirkung: Event speichern, Produkt optional lookupen, Haushalt aus Token ableiten.

Web-Integration:

- Scan-Seite oder Dashboard liest pending events:
  - `GET /api/v1/scanner/events?status=pending`
  - `PATCH /api/v1/scanner/events/:id`
- Dadurch muss der ESP keine komplexe Lagerlogik kennen.

Optional spaeter:

- `POST /api/v1/products/lookup`
- `POST /api/v1/stock`
- `POST /api/v1/shopping/check-off`

### Phase 6: Frontend bereinigen

- Alle Fetch-Aufrufe im Web ueber einen gemeinsamen API-Client laufen lassen.
- Browserseitig weiter Same-Origin `/api/*` verwenden, serverseitig `BACKEND_URL`.
- Keine direkten Annahmen mehr ueber Backend-Dateipfade.
- Web-Middleware nur fuer UI-Routen verantwortlich machen; API-Auth liegt im Backend.

### Phase 7: Deployment und Tests

- Separate Docker-Images fuer `backend` und `web` bauen.
- Reverse-Proxy-Varianten dokumentieren:
  - `https://app.example.tld` fuer Web und `https://api.example.tld` fuer API.
  - Oder ein Host mit `/api` an Backend und alles andere an Web.
- CORS nur fuer bekannte Origins oeffnen.
- Tests:
  - Backend-Integration fuer Auth, Haushaltsscope, Lager, Einkauf.
  - Contract-Test fuer Shared-Client.
  - Device-Pairing: Ablauf, Single-Use, Token-Revoke, Scope-Enforcement.
  - Smoke-Test Web-Proxy plus direkter Backend-API.

## Naechste konkrete Umsetzung

1. ESP-Firmware gegen `POST /api/v1/devices/pair` und `POST /api/v1/scanner/events` anbinden.
2. Optional: Token-Rotation fuer gekoppelte Geraete ergaenzen.
3. Scanner-Event-UI spaeter erweitern: Lagerort pro Event aendern, Bulk-Aktionen, Live-Polling.
