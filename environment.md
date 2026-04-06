Environment / Konfiguration
===========================

Kurze Dokumentation der Umgebungsvariablen, die das Projekt verwendet, inkl. Beispielwerte und Hinweise zur Erzeugung von `NEXTAUTH_SECRET`.

Wichtige Variablen
------------------

- `APP_URL`
  - Zweck: Basis-URL der App, wird in E‑Mail-Links verwendet (z. B. `http://localhost:3000`).
  - Beispiel: `APP_URL=http://localhost:3000`

- `NEXTAUTH_SECRET`
  - Zweck: Secret für NextAuth (JWT/Session-Signing). Muss sicher sein.
  - Erforderlich: Ja (production).
  - Generieren (Beispiele):
    - OpenSSL: `openssl rand -hex 32`
    - Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Beispiel: `NEXTAUTH_SECRET=2b3f4d...` (32+ bytes hex)

- `SUPER_ADMIN_EMAIL`
  - Zweck: E‑Mail-Adresse des Super-Admins (eine Adresse). Erhält Registrierungs‑Genehmigungen.
  - Beispiel: `SUPER_ADMIN_EMAIL=admin@example.com`

- SMTP Einstellungen (für Strato oder beliebigen SMTP-Provider)
  - `SMTP_HOST` — Hostname des SMTP-Servers (z. B. `smtp.strato.de`).
  - `SMTP_PORT` — Port (üblich `587`).
  - `SMTP_USER` — SMTP Benutzer (E‑Mail-Adresse).
  - `SMTP_PASS` — SMTP Passwort.
  - `EMAIL_FROM` — Absenderadresse für ausgehende E‑Mails (optional, fallback: `SMTP_USER`).
  - Beispiel:
    ```
    SMTP_HOST=smtp.strato.de
    SMTP_PORT=587
    SMTP_USER=you@domain.tld
    SMTP_PASS=super-secret
    EMAIL_FROM=you@domain.tld
    ```

- `EMAIL_AUTH_ENABLED`
  - Zweck: Schaltet E‑Mail‑Sende-/Autorisierungs-Flow ein/aus.
  - Werte:
    - `true` (Standard): E‑Mails werden gesendet (Registrierung → Super‑Admin → Aktivierung).
    - `false`: E‑Mails werden nicht gesendet. Nützlich für Offline-Tests.
  - Beispiel: `EMAIL_AUTH_ENABLED=true`

Hinweise zum Registrierungs-Flow
--------------------------------
- Wenn `EMAIL_AUTH_ENABLED=true` (Standard):
  1. Neuer Nutzer registriert sich → Einträge werden angelegt und eine Genehmigungs‑E‑Mail an `SUPER_ADMIN_EMAIL` gesendet.
  2. Super‑Admin klickt den Genehmigungslink → Nutzer erhält Aktivierungs‑Mail. Nach Klick auf Aktivierungslink wird `isActive=true` gesetzt.

- Wenn `EMAIL_AUTH_ENABLED=false`:
  - E‑Mails werden nicht verschickt (nur geloggt). Für Offline-Tests solltest du ggf. die Registrierungslogik anpassen, damit Accounts automatisch aktiv gesetzt werden (aktuell wird keine Aktivierungs‑Mail verschickt).

Shopping‑Liste per E‑Mail
------------------------
- Es existiert eine (optionale) Route, um die Einkaufsliste per E‑Mail an die registrierte Adresse zu senden. Die Route nutzt dieselben SMTP‑Einstellungen.

Templates
---------
- E‑Mail-Texte liegen als editierbare Textdateien unter `emails/`:
  - `emails/approval-request.txt` — Mail an Super‑Admin
  - `emails/activation.txt` — Aktivierungs‑Mail an Nutzer
  - `emails/invite.txt` — Einladungs‑Mail

Empfehlungen
-------------
- Lege sichere Werte für `NEXTAUTH_SECRET` an (siehe oben).
- Testweise lokale Installation: setze `EMAIL_AUTH_ENABLED=false` und optionally aktiviere automatische Aktivierung in der Registrierung, sonst fehlt dem Nutzer der Aktivierungslink.
- Installiere `nodemailer` für das Senden von E‑Mails:
  ```bash
  npm install nodemailer
  ```

Beispiel `.env`-Ausschnitt
--------------------------
```
APP_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_with_secure_hex_32_bytes
SUPER_ADMIN_EMAIL=admin@example.com
SMTP_HOST=smtp.strato.de
SMTP_PORT=587
SMTP_USER=you@domain.tld
SMTP_PASS=super-secret
EMAIL_FROM=you@domain.tld
EMAIL_AUTH_ENABLED=true
```

Datei erstellt: `environment.md` — passe `APP_URL`/SMTP/`SUPER_ADMIN_EMAIL` an bevor du E‑Mails testest.
