Super‑Admin & E‑Mail Setup
===========================

This document explains how to configure the Super‑Admin, SMTP credentials and how to test sending mail from the app.

1) Set environment variables
---------------------------

Edit your `.env` (or copy `.env.example`) and set at minimum:

- `NEXTAUTH_SECRET` — generate securely (see below)
- `SUPER_ADMIN_EMAIL` — the single Super‑Admin address
- `APP_URL` — base URL (e.g. `http://localhost:3000`)
- SMTP credentials:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- `EMAIL_AUTH_ENABLED` — set to `true` to enable email sending

Example `.env` snippet:

```
APP_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_with_secure_hex_32_bytes
SUPER_ADMIN_EMAIL=admin@example.com
SMTP_HOST=smtp.strato.de
SMTP_PORT=587
SMTP_USER=you@domain.tld
SMTP_PASS=your-smtp-password
EMAIL_FROM=you@domain.tld
EMAIL_AUTH_ENABLED=true
```

2) Generate `NEXTAUTH_SECRET`
----------------------------
Use one of these commands to create a secure secret:

OpenSSL:
```
openssl rand -hex 32
```

Node:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3) Install mail dependency
--------------------------
The app uses Nodemailer to send emails. Install it in your project:

```bash
npm install nodemailer
```

4) Test sending an invite (quick test)
------------------------------------
You can trigger a test email by calling the invite endpoint. This will create an invite token and attempt to send an invite mail to the given address.

Replace `you@domain.tld` with a real target address and ensure `.env` is configured.

```bash
curl -X POST http://localhost:3000/api/v1/auth/invite \
  -H "Content-Type: application/json" \
  -d '{"email":"you@domain.tld", "inviter":"Admin"}'
```

Check your SMTP logs or the recipient mailbox. If `EMAIL_AUTH_ENABLED=false`, the app will log the mail instead of sending it.

5) Test registration → Super‑Admin approval → activation
--------------------------------------------------------
- Register a new user via the registration UI or POST `/api/v1/auth/register` with `{ email, password, name }`.
- If `EMAIL_AUTH_ENABLED=true` and no invite token is provided, a notification is sent to `SUPER_ADMIN_EMAIL` for approval.
- Super‑Admin clicks the approval link → the user receives an activation mail containing the activation link.
- User clicks activation link → account `isActive` is set and login is allowed.

6) Notes for testing/offline use
--------------------------------
- For local or offline testing you can set `EMAIL_AUTH_ENABLED=false`. In that mode the mail helper only logs the email content and sending is skipped.
- If you want immediate activation without emails in test mode, we can add a small change to the registration handler that sets `isActive=true` automatically when `EMAIL_AUTH_ENABLED=false`. Tell me if you want that change.

7) Templates
------------
Editable templates live in `emails/`:
- `emails/approval-request.txt` — mail to Super‑Admin
- `emails/activation.txt` — activation mail to user
- `emails/invite.txt` — invite mail

If you want, I can add HTML templates and a small admin UI to edit these templates at runtime.

---
File: `README-EMAIL.md`
