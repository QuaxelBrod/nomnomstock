import type { Express, Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import { randomBytes, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'

import { prisma } from '../../lib/prisma'
import { sendMail } from '../../lib/mail'
import { ensureDefaultLocation } from '../serverUtils'

type Flash = { type: 'ok' | 'error'; message: string }

function htmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {}
  for (const part of String(header || '').split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (!rawKey) continue
    cookies[rawKey] = decodeURIComponent(rawValue.join('=') || '')
  }
  return cookies
}

function configuredToken() {
  return String(process.env.ADMIN_MAINTENANCE_TOKEN || '').trim()
}

function tokenMatches(candidate: string, expected: string) {
  if (!candidate || !expected) return false
  const left = Buffer.from(candidate)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function requestToken(req: Request) {
  const auth = String(req.headers.authorization || '')
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  const headerToken = req.headers['x-admin-token']
  if (typeof headerToken === 'string') return headerToken.trim()
  if (Array.isArray(headerToken)) return String(headerToken[0] || '').trim()
  const queryToken = typeof req.query.token === 'string' ? req.query.token : ''
  if (queryToken) return queryToken.trim()
  return parseCookies(req.headers.cookie).admin_maintenance_token || ''
}

function isAuthorized(req: Request) {
  const expected = configuredToken()
  if (!expected) return false
  return tokenMatches(requestToken(req), expected)
}

function redirectWithFlash(res: Response, type: Flash['type'], message: string) {
  res.redirect(`/admin?${new URLSearchParams({ [type]: message }).toString()}`)
}

function generatedPassword() {
  return randomBytes(12).toString('base64url')
}

async function sendInitialPasswordMail(email: string, password: string) {
  await sendMail({
    to: email,
    subject: 'nomnomstock Zugang',
    text: [
      'Hallo,',
      '',
      'fuer deinen nomnomstock-Zugang wurde ein neues initiales Passwort gesetzt.',
      '',
      `E-Mail: ${email}`,
      `Passwort: ${password}`,
      '',
      'Bitte melde dich an und aendere das Passwort spaeter, sobald diese Funktion verfuegbar ist.',
    ].join('\n'),
  })
}

function pageShell(title: string, body: string) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f8fafc; color: #111827; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 26px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { margin: 6px 0; color: #4b5563; }
    a { color: #2563eb; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; align-items: start; }
    .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; margin: 16px 0; }
    label { display: block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 4px; }
    input, select { width: 100%; box-sizing: border-box; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; background: #fff; color: #111827; }
    button { padding: 9px 12px; border: 0; border-radius: 6px; background: #2563eb; color: white; font-weight: 700; cursor: pointer; }
    button.danger { background: #dc2626; }
    button.secondary { background: #475569; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; color: #64748b; }
    form.inline { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
    form.inline > div { min-width: 160px; flex: 1; }
    .muted { color: #64748b; font-size: 13px; }
    .ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 10px 12px; border-radius: 6px; margin: 12px 0; }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 12px; border-radius: 6px; margin: 12px 0; }
    @media (prefers-color-scheme: dark) {
      body { background: #020617; color: #e5e7eb; }
      .panel { background: #0f172a; border-color: #334155; }
      input, select { background: #020617; color: #e5e7eb; border-color: #475569; }
      th, td { border-color: #334155; }
      p, .muted { color: #94a3b8; }
    }
  </style>
</head>
<body><main>${body}</main></body>
</html>`
}

function loginPage(message?: string) {
  return pageShell('nomnomstock Admin', `
    <h1>nomnomstock Admin</h1>
    <p>Maintenance-Konsole fuer lokale Reparaturen. Setze zuerst <code>ADMIN_MAINTENANCE_TOKEN</code> in der Server-Umgebung.</p>
    ${message ? `<div class="error">${htmlEscape(message)}</div>` : ''}
    <section class="panel" style="max-width: 460px; margin-top: 16px;">
      <h2>Token</h2>
      <form method="post" action="/admin/login">
        <label for="token">Admin Token</label>
        <input id="token" name="token" type="password" autocomplete="current-password" required>
        <div style="margin-top: 12px;"><button type="submit">Anmelden</button></div>
      </form>
    </section>
  `)
}

async function adminDashboard(req: Request) {
  const q = String(req.query.q || '').trim()
  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q } },
            { name: { contains: q } },
            Number.isFinite(Number(q)) ? { id: Number(q) } : undefined,
          ].filter(Boolean) as any,
        }
      : undefined,
    include: { household: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const households = await prisma.household.findMany({
    include: {
      users: { orderBy: { email: 'asc' } },
      _count: {
        select: {
          users: true,
          locations: true,
          stocks: true,
          shoppingItems: true,
          devices: true,
          scannerEvents: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const flash =
    typeof req.query.ok === 'string'
      ? { type: 'ok', message: req.query.ok }
      : typeof req.query.error === 'string'
        ? { type: 'error', message: req.query.error }
        : null

  return pageShell('nomnomstock Admin', `
    <h1>nomnomstock Admin</h1>
    <p>Diese Konsole ist fuer Reparaturen und Haushaltsverwaltung gedacht. Nicht ueber nginx freigeben.</p>
    ${flash ? `<div class="${flash.type}">${htmlEscape(flash.message)}</div>` : ''}

    <form class="toolbar" method="get" action="/admin">
      <div style="min-width: 280px;">
        <label for="q">User suchen</label>
        <input id="q" name="q" value="${htmlEscape(q)}" placeholder="E-Mail, Name oder ID">
      </div>
      <button type="submit">Suchen</button>
      <a href="/admin">Zuruecksetzen</a>
      <span style="flex: 1"></span>
      <button class="secondary" formaction="/admin/logout" formmethod="post">Abmelden</button>
    </form>

    <section class="panel">
      <h2>Registrierte User</h2>
      <table>
        <thead><tr><th>ID</th><th>User</th><th>Status</th><th>Haushalt</th><th>Passwort</th></tr></thead>
        <tbody>
          ${users.map((user: any) => `
            <tr>
              <td>${user.id}</td>
              <td><strong>${htmlEscape(user.email)}</strong><br><span class="muted">${htmlEscape(user.name || '')}</span></td>
              <td>${htmlEscape(user.role)}<br>${user.isActive ? 'aktiv' : 'inaktiv'}</td>
              <td>${user.household ? `${user.household.id} - ${htmlEscape(user.household.name)}` : '<span class="muted">kein Haushalt</span>'}</td>
              <td>
                <form class="inline" method="post" action="/admin/users/${user.id}/password">
                  <div>
                    <label>Neues Passwort</label>
                    <input name="password" placeholder="leer = generieren">
                  </div>
                  <div style="flex: 0 0 auto; min-width: 130px;">
                    <label>Mail senden</label>
                    <select name="sendEmail"><option value="false">nein</option><option value="true">ja</option></select>
                  </div>
                  <button type="submit">Setzen</button>
                </form>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>

    <div class="grid" style="margin-top: 16px;">
      <section class="panel">
        <h2>Neuen Haushalt mit Admin anlegen</h2>
        <form method="post" action="/admin/households">
          <label>Haushaltsname</label>
          <input name="householdName" required>
          <label style="margin-top: 10px;">Admin E-Mail</label>
          <input name="adminEmail" type="email" required>
          <label style="margin-top: 10px;">Admin Name</label>
          <input name="adminName">
          <label style="margin-top: 10px;">Initiales Passwort</label>
          <input name="password" placeholder="leer = generieren">
          <label style="margin-top: 10px;">Mail senden</label>
          <select name="sendEmail"><option value="true">ja</option><option value="false">nein</option></select>
          <div style="margin-top: 12px;"><button type="submit">Haushalt anlegen</button></div>
        </form>
      </section>

      <section class="panel">
        <h2>Haushalte</h2>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Mitglieder / Daten</th><th>Loeschen</th></tr></thead>
          <tbody>
            ${households.map((household: any) => `
              <tr>
                <td>${household.id}</td>
                <td><strong>${htmlEscape(household.name)}</strong><br><span class="muted">${household.users.map((u: any) => htmlEscape(u.email)).join('<br>')}</span></td>
                <td>
                  User: ${household._count.users}<br>
                  Lager: ${household._count.locations}<br>
                  Bestaende: ${household._count.stocks}<br>
                  Einkauf: ${household._count.shoppingItems}<br>
                  Scanner: ${household._count.devices} / Events: ${household._count.scannerEvents}
                </td>
                <td>
                  <form method="post" action="/admin/households/${household.id}/delete" onsubmit="return confirm('Haushalt wirklich loeschen? User und Haushaltsdaten werden entfernt.')">
                    <label>Zum Bestaetigen Namen eingeben</label>
                    <input name="confirmName" placeholder="${htmlEscape(household.name)}" required>
                    <div style="margin-top: 8px;"><button class="danger" type="submit">Loeschen</button></div>
                  </form>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    </div>
  `)
}

async function resetUserPassword(userId: number, passwordInput: string, sendEmail: boolean) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User nicht gefunden')

  const password = passwordInput.trim() || generatedPassword()
  const hash = await bcrypt.hash(password, 10)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash, isActive: true } as any,
  })

  if (sendEmail) await sendInitialPasswordMail(user.email, password)
  return { email: user.email, password }
}

async function createHouseholdWithAdmin(body: any) {
  const householdName = String(body.householdName || '').trim()
  const adminEmail = String(body.adminEmail || '').trim().toLowerCase()
  const adminName = String(body.adminName || '').trim() || null
  const sendEmail = String(body.sendEmail || 'true') === 'true'

  if (!householdName || !adminEmail) throw new Error('Haushaltsname und Admin E-Mail sind Pflicht')

  const password = String(body.password || '').trim() || generatedPassword()
  const hash = await bcrypt.hash(password, 10)

  const household = await prisma.household.upsert({
    where: { name: householdName },
    update: {},
    create: { name: householdName },
  })
  await ensureDefaultLocation(household.id)

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: adminName, password: hash, isActive: true, role: 'ADMIN', householdId: household.id } as any,
    create: {
      email: adminEmail,
      name: adminName,
      password: hash,
      isActive: true,
      role: 'ADMIN',
      householdId: household.id,
    } as any,
  })
  await prisma.verificationToken.deleteMany({ where: { email: adminEmail } as any })

  if (sendEmail) await sendInitialPasswordMail(adminEmail, password)
  return { household, user, password }
}

async function deleteHouseholdAndUsers(householdId: number, confirmName: string) {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: { users: true, devices: true },
  })
  if (!household) throw new Error('Haushalt nicht gefunden')
  if (confirmName !== household.name) throw new Error('Bestaetigungsname stimmt nicht')

  const userIds = household.users.map((user: { id: number }) => user.id)
  const userEmails = household.users.map((user: { email: string }) => user.email)
  const deviceIds = household.devices.map((device: { id: number }) => device.id)

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.scannerEvent.deleteMany({ where: { householdId } })
    await tx.devicePairing.deleteMany({ where: { householdId } })
    await tx.apiToken.deleteMany({
      where: {
        OR: [
          { householdId },
          userIds.length ? { userId: { in: userIds } } : undefined,
          deviceIds.length ? { deviceId: { in: deviceIds } } : undefined,
        ].filter(Boolean) as any,
      },
    })
    await tx.device.deleteMany({ where: { householdId } })
    await tx.shoppingListItem.deleteMany({ where: { householdId } })
    await tx.history.deleteMany({ where: { householdId } })
    await tx.stock.deleteMany({ where: { householdId } })
    await tx.location.deleteMany({ where: { householdId } })
    if (userEmails.length) await tx.verificationToken.deleteMany({ where: { email: { in: userEmails } } as any })
    if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } })
    await tx.household.delete({ where: { id: householdId } })
  })

  return household
}

function guard(req: Request, res: Response) {
  if (!configuredToken()) {
    res.status(503).send(loginPage('ADMIN_MAINTENANCE_TOKEN ist nicht gesetzt.'))
    return false
  }
  if (!isAuthorized(req)) {
    res.status(401).send(loginPage('Token fehlt oder ist falsch.'))
    return false
  }
  return true
}

export function registerAdminMaintenanceRoutes(app: Express) {
  app.get('/admin', async (req, res) => {
    try {
      if (!guard(req, res)) return
      res.send(await adminDashboard(req))
    } catch (err) {
      console.error('GET /admin error', err)
      res.status(500).send(pageShell('nomnomstock Admin', `<div class="error">${htmlEscape((err as Error).message)}</div>`))
    }
  })

  app.post('/admin/login', (req, res) => {
    const expected = configuredToken()
    const token = String(req.body?.token || '').trim()
    if (!expected || !tokenMatches(token, expected)) {
      res.status(401).send(loginPage('Token fehlt oder ist falsch.'))
      return
    }
    res.setHeader('Set-Cookie', `admin_maintenance_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/admin`)
    res.redirect('/admin')
  })

  app.post('/admin/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'admin_maintenance_token=; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=0')
    res.redirect('/admin')
  })

  app.post('/admin/users/:id/password', async (req, res) => {
    try {
      if (!guard(req, res)) return
      const userId = Number(req.params.id)
      if (!Number.isInteger(userId) || userId <= 0) throw new Error('Ungueltige User-ID')
      const result = await resetUserPassword(userId, String(req.body?.password || ''), String(req.body?.sendEmail || 'false') === 'true')
      redirectWithFlash(res, 'ok', `Passwort fuer ${result.email} wurde gesetzt.`)
    } catch (err) {
      console.error('POST /admin/users/:id/password error', err)
      redirectWithFlash(res, 'error', (err as Error).message || 'Passwort konnte nicht gesetzt werden.')
    }
  })

  app.post('/admin/households', async (req, res) => {
    try {
      if (!guard(req, res)) return
      const result = await createHouseholdWithAdmin(req.body)
      redirectWithFlash(res, 'ok', `Haushalt ${result.household.name} mit Admin ${result.user.email} wurde angelegt.`)
    } catch (err) {
      console.error('POST /admin/households error', err)
      redirectWithFlash(res, 'error', (err as Error).message || 'Haushalt konnte nicht angelegt werden.')
    }
  })

  app.post('/admin/households/:id/delete', async (req, res) => {
    try {
      if (!guard(req, res)) return
      const householdId = Number(req.params.id)
      if (!Number.isInteger(householdId) || householdId <= 0) throw new Error('Ungueltige Haushalts-ID')
      const household = await deleteHouseholdAndUsers(householdId, String(req.body?.confirmName || ''))
      redirectWithFlash(res, 'ok', `Haushalt ${household.name} wurde geloescht.`)
    } catch (err) {
      console.error('POST /admin/households/:id/delete error', err)
      redirectWithFlash(res, 'error', (err as Error).message || 'Haushalt konnte nicht geloescht werden.')
    }
  })
}
