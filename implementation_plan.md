### **Detaillierter Implementierungsplan: NomNomStock**

#### **Phase 1: Fundament – Projekt-Setup, Docker, Datenbank & Basis-UI**

*   **1.1. Next.js Projektinitialisierung**
    *   Erstellen des Next.js-Projekts mit `npx create-next-app@latest nomnom --typescript --tailwind --eslint --app`.
    *   Einrichten der Verzeichnisstruktur: `app/`, `components/`, `lib/`, `prisma/`.
    *   Installation der Basis-Abhängigkeiten: `shadcn/ui`, `framer-motion`, `lucide-react`.

*   **1.2. Docker-Infrastruktur**
    *   Erstellen eines `Dockerfile` für die Next.js-Anwendung (Multi-Stage-Build für optimierte Image-Größe).
    *   Erstellen einer `docker-compose.yml` zum Orchestrieren der Dienste:
        *   `nomnomstock`: Die Next.js-Anwendung.
    *   Verwendung einer lokalen SQLite-Datenbankdatei, die per Volume in den Container gemountet wird (z. B. `./data/nomnom.db:/data/nomnom.db`).
    *   Dadurch ist kein separater DB-Container nötig — die App nutzt die gemountete SQLite-Datei.
    *   Konfiguration von Umgebungsvariablen (`.env`) und Pfad zur DB-Datei (z. B. `DATABASE_URL=file:./data/nomnom.db`).

*   **1.3. Datenbank-Schema (SQLite, optional mit Prisma)**
    *   Ziel: SQLite-Datei als zentrale DB, gemountet via `docker-compose`.
    *   Optional mit Prisma: `npx prisma init --datasource-provider sqlite` und `DATABASE_URL="file:./data/nomnom.db"` setzen.
    *   Modelle in `prisma/schema.prisma` definieren (Product, Location, Stock, ShoppingListItem, History, User, Household) — oder bei Verzicht auf Prisma eine leichte SQLite-Bibliothek (z. B. `better-sqlite3`) verwenden.
    *   Wenn Prisma genutzt wird: `npx prisma migrate dev --name "initial_schema"` lokal ausführen; bei reinem SQLite ohne ORM reicht ein SQL-Skript/DDL.
    *   Hinweis: Prisma ist optional — für einfache lokale Setups kann ein leichter DB-Client weniger Overhead bedeuten.

*   **1.4. UI-Grundgerüst & Routing**
    *   Einrichten des globalen Layouts in `app/layout.tsx`.
    *   Implementierung der fixierten `BottomNav.tsx` Komponente (Client Component).
    *   Erstellen der leeren Seiten für die Haupt-Routen: `lager`, `scan`, `einkauf`, `verlauf`, `profil`.
    *   Integration von `framer-motion` (`AnimatePresence`) im Layout, um die Seiteninhalte für sanfte Übergänge zu umschließen.

#### **Phase 2: Kernfunktionalität – Scanner & API-Anbindung**

*   **2.1. Barcode-Scanner-Komponente**
    *   Auswahl und Integration einer mobil-freundlichen Barcode-Scanner-Bibliothek (z. B. `react-zxing`).
    *   Erstellen der `/scan`-Seite, die die Kamera-Ansicht rendert und den erfassten Barcode an eine Server Action übergibt.

*   **2.2. Server-Logik zur Produkt-Identifikation**
    *   Erstellen einer Server Action (`app/actions/productLookup.ts`).
    *   Implementierung der Suchkaskade:
        1.  Prüfe lokale `Product`-Tabelle via Prisma.
        2.  *Falls nicht gefunden:* Rufe die Open Food Facts API auf.
        3.  *Falls immer noch nicht gefunden:* Rufe die Open Beauty Facts API auf.
    *   Erstellen von robusten API-Client-Funktionen in `lib/api/`.

*   **2.3. UI für Produkt-Management**
    *   Bei Fund: Anzeige einer Produkt-Detailseite mit der Option, den Artikel dem Bestand hinzuzufügen (`"Einbuchen"`).
    *   Bei Nicht-Fund: Anzeige eines Formulars zur manuellen Erfassung eines neuen Produkts, wobei der Barcode vorausgefüllt ist.

#### **Phase 3: Bestandslogik & Lagerverwaltung**

*   **3.1. Bestandsübersicht (`/lager`)**
    *   Entwicklung der `StockList`-Komponente, die alle `Stock`-Einträge mit den zugehörigen Produkt- und Lagerort-Informationen anzeigt.
    *   Implementierung von UI-Komponenten (Dropdowns, Suchfelder) für das Filtern und Sortieren des Bestands.

*   **3.2. CRUD-Operationen für den Bestand (Server Actions)**
    *   **Einbuchen:** Erstellen eines neuen `Stock`-Eintrags. Der Nutzer wählt Menge, Einheit und `Location`.
    *   **Umbuchen:** Ändern der `locationId` eines bestehenden `Stock`-Eintrags.
    *   **Entnahme:** Reduzieren der Menge. Bei Menge `0`:
        *   Anzeige eines Modals: `"Auf Einkaufsliste setzen?"`.
        *   Bei "Ja": Erstelle einen Eintrag in `ShoppingListItem`.
        *   Verschiebe den `Stock`-Eintrag in die `History`-Tabelle.

*   **3.3. Verwaltung der Lagerorte (`/profil/lagerorte`)**
    *   Erstellen einer UI, in der Nutzer ihre `Location`-Einträge selbst anlegen, bearbeiten und löschen können.

#### **Phase 4: Multi-User, Einkaufsliste & KI-Integration**

 *   **4.1. Authentifizierung & Haushalts-System**
     *   Auth ist verpflichtend: Jeder Nutzer muss sich zunächst einloggen, bevor er App-Funktionen nutzt.
     *   Empfehlung: NextAuth.js (oder ein leichtgewichtiges Auth-System) einsetzen.
     *   Beim ersten Anlegen/Registrieren eines Nutzers wird dieser automatisch als Administrator des zugehörigen `Household` (Gruppe) markiert.
     *   Anpassen des Datenmodells (z. B. `User` → `Household`-Relation + `role`-Feld), sodass beim Erstlogin die Rolle `admin` gesetzt wird.
     *   Absicherung aller Routen und Server Actions, sodass Daten nur innerhalb des eigenen Haushalts sichtbar/änderbar sind.
     *   **Einladungssystem (optional):** Generiere signierte Einladungslinks (`/haushalt/beitreten?token=...`) für das Beitreten weiterer Nutzer.

*   **4.2. Einkaufsliste (`/einkauf`)**
    *   Erstellen der UI zur Anzeige der `ShoppingListItem`-Tabelle.
    *   Implementierung der "Gekauft"-Funktion: Beim Scannen eines Artikels wird geprüft, ob er auf der Einkaufsliste steht. Wenn ja, wird er entfernt und der "Einbuchen"-Workflow gestartet.

*   **4.3. KI-Rezeptvorschläge (Ollama)**
    *   Integration des "Smart Cook"-Buttons in der UI.
    *   Erstellen einer Server Action `getRecipeSuggestions.ts`.
    *   Konfigurierbare Verbindung / Betriebsmodi:
        -   Umgebungsvariablen zur Konfiguration:
            -   `OLLAMA_ENABLED` (true|false) – Feature-Flag, um die KI-Funktionalität zu deaktivieren.
            -   `OLLAMA_URL` – Basis-URL zur Ollama-Instanz (z. B. `http://ollama:11434` oder `http://localhost:11434`).
            -   `OLLAMA_MODEL` – Name/ID des zu verwendenden Modells.
            -   `OLLAMA_API_KEY` (optional) – Falls eine Authentifizierung erforderlich ist.
            -   `OLLAMA_TIMEOUT_MS` – Request-Timeout in ms.
        -   Docker-Optionen:
            -   Optionaler `ollama`-Service in `docker-compose.yml`, oder Verbindung zu einer externen/remote Ollama-Instanz via `OLLAMA_URL`.
            -   Wenn in Docker betrieben: `docker-compose` sollte ein gemeinsames Netzwerk verwenden, sodass `OLLAMA_URL` z. B. `http://ollama:11434` funktioniert.
        -   Fallback & Fehlertoleranz:
            -   Implementiere Rückfallverhalten, falls Ollama deaktiviert oder nicht erreichbar ist (z. B. freundliche UI-Nachricht, keine Vorschläge, oder alternative LLM-Provider).
            -   Fehler, Timeouts und Response-Größen sollten sauber behandelt und geloggt werden.
        -   Konfigurierbare Prompt-Parameter:
            -   `OLLAMA_MAX_TOKENS`, `OLLAMA_TEMPERATURE`, `OLLAMA_TOP_P` als optional konfigurierbare Einstellungen.
        -   Sicherheit:
            -   API-Schlüssel und sensible Einstellungen nur via `.env`/Secret-Management verwalten; niemals ins VCS committen.
    *   Logik der Server Action (`getRecipeSuggestions.ts`):
        1.  Prüfe `OLLAMA_ENABLED` und Erreichbarkeit von `OLLAMA_URL`.
        2.  Lade den aktuellen `Stock` des Haushalts, sortiert nach MHD.
        3.  Formatiere die Daten zu einem Prompt für das LLM, wende ggf. Token-/Längenbegrenzungen an.
        4.  Sende den Prompt an die konfigurierte Ollama-Instanz mit den konfigurierten Modell- und Prompt-Parametern.
        5.  Verarbeite und forme die Antwort zu UI-freundlichen Rezeptvorschlägen; bei Fehlern ein Fallback-UI anzeigen.

*   **4.4. PWA-Konfiguration**
    *   Erstellen der `manifest.json` mit App-Namen, Icons und Theme-Farben.
    *   Hinzufügen der PWA-Meta-Tags im `layout.tsx`.
    *   Implementierung eines Service Workers (z.B. mit `next-pwa`) für grundlegendes Offline-Caching.
