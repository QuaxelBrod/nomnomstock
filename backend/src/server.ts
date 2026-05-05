import express, { type Request as ExpressRequest, type Response } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { getToken } from 'next-auth/jwt'
import type { Prisma } from '@prisma/client'

import { prisma } from '../lib/prisma'
import { lookupOpenFoodFacts, lookupOpenBeautyFacts } from '../lib/api/lookup'
import {
  ensureImageColumn,
  ensurePasswordColumn,
  ensureShoppingListItemColumns,
  ensureShoppingListItemTable,
  ensureVerificationTokenTable,
} from '../lib/dbFixes'
import { renderTemplate, sendMail } from '../lib/mail'

type AuthContext = {
  token: any
  householdId: number | null
  userId: number | null
  email: string | null
  role: string | null
}

type AuthUser = {
  id: number
  email: string
  name?: string | null
  role?: string | null
  householdId?: number | null
}

type RequestWithFile = ExpressRequest & { file?: Express.Multer.File }

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

app.disable('x-powered-by')
app.use(cors())
app.use(bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.urlencoded({ extended: true }))

function parsePositiveInt(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function isTruthy(value: string | undefined) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function parseCookieHeader(value: string | string[] | undefined) {
  const header = Array.isArray(value) ? value.join('; ') : value || ''
  if (!header) return {} as Record<string, string>

  const cookies: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue

    const name = part.slice(0, idx).trim()
    if (!name) continue

    const rawValue = part.slice(idx + 1).trim()
    try {
      cookies[name] = decodeURIComponent(rawValue)
    } catch {
      cookies[name] = rawValue
    }
  }

  return cookies
}

function resolveAuthUrl() {
  const raw = process.env.NEXTAUTH_URL || process.env.APP_URL
  if (raw) return raw.replace(/\/$/, '')
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  throw new Error('AUTH_URL_NOT_CONFIGURED')
}

function authBaseFromEnv() {
  const explicit = process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || ''
  if (explicit) return explicit.startsWith('/') ? explicit.replace(/\/$/, '') : `/${explicit.replace(/\/$/, '')}`
  try {
    const raw = process.env.NEXTAUTH_URL || process.env.APP_URL || ''
    if (!raw) return ''
    const p = new URL(raw).pathname
    return p === '/' ? '' : p.replace(/\/$/, '')
  } catch {
    return ''
  }
}

function resolveFileFromCandidates(candidates: string[]) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function readTextFileFromCandidates(candidates: string[]) {
  const found = resolveFileFromCandidates(candidates)
  if (!found) throw new Error(`file_not_found: ${candidates.join(', ')}`)
  return fs.readFileSync(found, 'utf8')
}

function resolveUploadsDir() {
  const candidates = [
    path.resolve(process.cwd(), 'frontends', 'web', 'public', 'uploads'),
    path.resolve(process.cwd(), '..', 'frontends', 'web', 'public', 'uploads'),
    path.resolve(process.cwd(), 'public', 'uploads'),
    path.resolve(process.cwd(), '..', 'public', 'uploads'),
  ]

  for (const dir of candidates) {
    try {
      const parent = path.dirname(dir)
      if (fs.existsSync(parent)) {
        fs.mkdirSync(dir, { recursive: true })
        return dir
      }
    } catch {
      // try next candidate
    }
  }

  const fallback = candidates[0]
  fs.mkdirSync(fallback, { recursive: true })
  return fallback
}

function resolvePromptTemplatePath() {
  const candidates = [
    path.resolve(process.cwd(), 'prompts', 'recipe_prompt.txt'),
    path.resolve(process.cwd(), '..', 'prompts', 'recipe_prompt.txt'),
    path.resolve(process.cwd(), '..', '..', 'prompts', 'recipe_prompt.txt'),
  ]
  return resolveFileFromCandidates(candidates)
}

function getEmailTemplate(name: string) {
  return readTextFileFromCandidates([
    path.resolve(process.cwd(), 'emails', name),
    path.resolve(process.cwd(), '..', 'emails', name),
    path.resolve(process.cwd(), '..', '..', 'emails', name),
  ])
}

async function getAuthToken(req: ExpressRequest) {
  const secret = process.env.NEXTAUTH_SECRET
  const reqForToken = { ...req, cookies: parseCookieHeader(req.headers?.cookie as any) } as any

  const fromDefault = await getToken({ req: reqForToken, secret })
  if (fromDefault) return fromDefault

  // Accept both cookie names so mixed http/https and proxy setups keep working.
  const fromInsecureCookie = await getToken({ req: reqForToken, secret, cookieName: 'next-auth.session-token' })
  if (fromInsecureCookie) return fromInsecureCookie

  return getToken({ req: reqForToken, secret, cookieName: '__Secure-next-auth.session-token' })
}

async function getAuthContext(req: ExpressRequest): Promise<AuthContext | null> {
  const token = await getAuthToken(req)
  if (!token) return null

  const email = typeof token.email === 'string' ? token.email : null
  const householdIdFromToken = parsePositiveInt((token as any).householdId)
  const userId = parsePositiveInt(token.sub)
  const role = typeof (token as any).role === 'string' ? String((token as any).role) : null

  if (householdIdFromToken) {
    return { token, householdId: householdIdFromToken, userId, email, role }
  }

  if (!email) {
    return { token, householdId: null, userId, email: null, role }
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { householdId: true, role: true } })
  return {
    token,
    householdId: user?.householdId ?? null,
    userId,
    email,
    role: role || (user?.role ?? null),
  }
}

async function requireAuth(req: ExpressRequest, res: Response) {
  const auth = await getAuthContext(req)
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  return auth
}

function isAdmin(auth: AuthContext) {
  return String(auth.role || '').toUpperCase() === 'ADMIN'
}

function buildHouseholdScope(householdId: number | null) {
  if (!householdId) return {}
  return { householdId }
}

async function productLookup(barcode: string) {
  if (!barcode) return null

  const local = await prisma.product.findUnique({ where: { barcode } })
  if (local) return local

  const food = await lookupOpenFoodFacts(barcode)
  if (food) {
    try {
      return await prisma.product.create({ data: { barcode, name: food.name, brand: food.brand, image: food.image } })
    } catch {
      return prisma.product.findUnique({ where: { barcode } })
    }
  }

  const beauty = await lookupOpenBeautyFacts(barcode)
  if (beauty) {
    try {
      return await prisma.product.create({ data: { barcode, name: beauty.name, brand: beauty.brand, image: beauty.image } })
    } catch {
      return prisma.product.findUnique({ where: { barcode } })
    }
  }

  return null
}

async function createHouseholdForUser(email: string, name?: string | null) {
  const baseName = (name || email.split('@')[0] || 'Haushalt').trim()
  const safeBase = baseName.length > 40 ? baseName.slice(0, 40) : baseName

  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? `${safeBase} Haushalt` : `${safeBase} Haushalt ${i + 1}`
    const existing = await prisma.household.findUnique({ where: { name: candidate } })
    if (!existing) {
      const household = await prisma.household.create({ data: { name: candidate } })
      return household.id
    }
  }

  const household = await prisma.household.create({ data: { name: `Haushalt ${Date.now()}` } })
  return household.id
}

async function callOllama(prompt: string) {
  const url = process.env.OLLAMA_URL
  const model = process.env.OLLAMA_MODEL || 'cortex'
  if (!url) throw new Error('OLLAMA_URL not configured')

  const full = `${url.replace(/\/$/, '')}/api/generate`
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 60000)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: globalThis.Response
  try {
    response = await fetch(full, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Ollama request failed${errText ? `: ${errText.slice(0, 200)}` : ''}`)
  }

  const text = await response.text()
  try {
    const parsed = JSON.parse(text)
    if (parsed?.text) return parsed.text as string
    if (parsed?.choices?.[0]?.message?.content) return String(parsed.choices[0].message.content)
    return JSON.stringify(parsed)
  } catch {
    const lines = text.split(/\r?\n/).filter(Boolean)
    const chunks = lines
      .map((line) => {
        try {
          const parsed = JSON.parse(line)
          return String(parsed.response ?? parsed.text ?? '')
        } catch {
          return ''
        }
      })
      .join('')
    return chunks || text
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }))
app.get('/healthz', (_req, res) => res.json({ ok: true }))
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/credentials', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || '')

    if (!email || !password) return res.status(400).json({ ok: false, error: 'missing' })

    await ensurePasswordColumn()

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(401).json({ ok: false, error: 'invalid_credentials' })
    if (!(user as any).isActive) return res.status(401).json({ ok: false, error: 'inactive' })

    const hash = (user as any).password
    if (!hash) return res.status(401).json({ ok: false, error: 'invalid_credentials' })

    const valid = await bcrypt.compare(password, hash)
    if (!valid) return res.status(401).json({ ok: false, error: 'invalid_credentials' })

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      householdId: user.householdId,
    }

    return res.json({ ok: true, user: authUser })
  } catch (err) {
    console.error('POST /api/auth/credentials error', err)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const authUrl = resolveAuthUrl()

    await ensurePasswordColumn()
    await ensureVerificationTokenTable()

    const normalizedEmail = normalizeEmail(req.body?.email)
    const normalizedName = req.body?.name ? String(req.body.name).trim() : null
    const password = String(req.body?.password || '')
    const inviteToken = req.body?.inviteToken ? String(req.body.inviteToken) : null
    const emailAuthEnabled = process.env.EMAIL_AUTH_ENABLED !== 'false'
    const superadmin = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase()

    if (!normalizedEmail || !password) return res.status(400).json({ error: 'missing' })

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    const passwordHash = await bcrypt.hash(password, 10)

    if (existing && (existing as any).isActive) {
      return res.status(400).json({ error: 'exists' })
    }

    if (existing && !(existing as any).isActive) {
      await prisma.user.update({
        where: { email: normalizedEmail },
        data: { name: normalizedName, password: passwordHash } as any,
      })
    } else {
      await prisma.user.create({
        data: { email: normalizedEmail, name: normalizedName, password: passwordHash } as any,
      })
    }

    await prisma.verificationToken.deleteMany({
      where: { email: normalizedEmail, type: { in: ['approval', 'activation'] } as any } as any,
    })

    let skipSuper = false
    let invitedHouseholdId: number | null = null

    if (inviteToken) {
      const invite = await prisma.verificationToken.findUnique({ where: { token: inviteToken } as any })
      const isInviteType = !!invite && (invite.type === 'invite' || invite.type.startsWith('invite:'))

      if (invite && isInviteType && (!invite.expiresAt || invite.expiresAt > new Date())) {
        if (invite.email && invite.email.toLowerCase() !== normalizedEmail) {
          return res.status(400).json({
            error: 'invite_email_mismatch',
            expectedEmail: invite.email,
            message: `Diese Einladung ist fuer ${invite.email}. Bitte registriere dich mit dieser E-Mail-Adresse.`,
          })
        }

        if (invite.type.startsWith('invite:')) {
          const hh = Number(invite.type.split(':')[1] || '')
          if (Number.isFinite(hh) && hh > 0) invitedHouseholdId = hh
        }

        skipSuper = true
        await prisma.verificationToken.delete({ where: { token: inviteToken } as any })
      }
    }

    if (skipSuper && invitedHouseholdId) {
      await prisma.user.update({
        where: { email: normalizedEmail },
        data: { householdId: invitedHouseholdId } as any,
      })
    } else {
      const userAfterUpsert = await prisma.user.findUnique({ where: { email: normalizedEmail } })
      if (!userAfterUpsert?.householdId) {
        const householdId = await createHouseholdForUser(normalizedEmail, normalizedName)
        await prisma.user.update({ where: { email: normalizedEmail }, data: { householdId } as any })
      }
    }

    if (!emailAuthEnabled || skipSuper) {
      const token = randomBytes(20).toString('hex')
      await prisma.verificationToken.create({
        data: {
          email: normalizedEmail,
          token,
          type: 'activation',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      })

      try {
        const tpl = getEmailTemplate('activation.txt')
        const activateUrl = `${authUrl}/api/auth/activate?token=${token}`
        const text = renderTemplate(tpl, {
          name: normalizedName || normalizedEmail,
          activateUrl,
          homeUrl: `${authUrl}/`,
        })
        await sendMail({ to: normalizedEmail, subject: 'Account aktivieren', text })
      } catch (mailErr) {
        console.error('register activation mail error', mailErr)
        return res.status(500).json({ error: 'activation_mail_failed' })
      }

      return res.json({
        ok: true,
        message: 'Die Registrierung wird durchgeführt. Bitte prüfen Sie Ihr E-Mail-Postfach.',
      })
    }

    if (!superadmin) {
      return res.status(500).json({ error: 'superadmin_not_configured' })
    }

    const approvalToken = randomBytes(24).toString('hex')
    await prisma.verificationToken.create({
      data: {
        email: normalizedEmail,
        token: approvalToken,
        type: 'approval',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    })

    try {
      const tpl = getEmailTemplate('approval-request.txt')
      const approveUrl = `${authUrl}/api/auth/approve?token=${approvalToken}`
      const text = renderTemplate(tpl, {
        email: normalizedEmail,
        approveUrl,
        homeUrl: `${authUrl}/`,
      })
      await sendMail({ to: superadmin, subject: 'Registrierungsanfrage', text })
    } catch (mailErr) {
      console.error('register approval mail error', mailErr)
      return res.status(500).json({ error: 'approval_mail_failed' })
    }

    return res.json({
      ok: true,
      message: 'Die Registrierung wird durchgeführt, Sie erhalten in Kürze eine E-Mail.',
    })
  } catch (err) {
    console.error('POST /api/auth/register error', err)
    return res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/auth/invite', async (req, res) => {
  try {
    const authUrl = resolveAuthUrl()
    await ensureVerificationTokenTable()

    const auth = await requireAuth(req, res)
    if (!auth) return

    if (!auth.email) return res.status(401).json({ error: 'unauthorized' })

    const inviterUser = await prisma.user.findUnique({ where: { email: auth.email.toLowerCase() } })
    if (!inviterUser) return res.status(404).json({ error: 'inviter_not_found' })
    if (!(inviterUser as any).householdId) return res.status(400).json({ error: 'no_household' })

    const inviteEmail = normalizeEmail(req.body?.email)
    if (!inviteEmail) return res.status(400).json({ error: 'missing' })

    const inviterLabel = `${inviterUser.name || 'User'} <${inviterUser.email}>`
    const token = randomBytes(20).toString('hex')
    const tokenType = `invite:${(inviterUser as any).householdId}`

    await prisma.verificationToken.create({
      data: {
        email: inviteEmail,
        token,
        type: tokenType,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    })

    try {
      const tpl = getEmailTemplate('invite.txt')
      const registerUrl = `${authUrl}/auth/register?invite=${token}`
      const text = renderTemplate(tpl, {
        inviter: inviterLabel,
        registerUrl,
        inviteEmail,
        homeUrl: `${authUrl}/`,
      })
      await sendMail({ to: inviteEmail, subject: 'Einladung zum Vorratsschrank', text })
    } catch (mailErr) {
      console.error('invite mail error', mailErr)
      return res.status(500).json({ error: 'invite_mail_failed' })
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/auth/invite error', err)
    return res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/auth/activate', async (req, res) => {
  try {
    await ensureVerificationTokenTable()
    const token = String(req.query.token || '')

    if (!token) {
      return res.redirect(`${authBaseFromEnv()}/auth/activated?status=error&reason=missing`)
    }

    const row = await prisma.verificationToken.findUnique({ where: { token } as any })
    if (!row || row.type !== 'activation') {
      return res.redirect(`${authBaseFromEnv()}/auth/activated?status=error&reason=invalid`)
    }

    await prisma.user.update({ where: { email: row.email }, data: { isActive: true } as any })
    await prisma.verificationToken.delete({ where: { token } as any })
    return res.redirect(`${authBaseFromEnv()}/auth/activated?status=success`)
  } catch (err) {
    console.error('GET /api/auth/activate error', err)
    return res.redirect(`${authBaseFromEnv()}/auth/activated?status=error&reason=server`)
  }
})

app.get('/api/auth/approve', async (req, res) => {
  try {
    const authUrl = resolveAuthUrl()
    await ensureVerificationTokenTable()
    const token = String(req.query.token || '')

    if (!token) return res.redirect(`${authBaseFromEnv()}/auth/approval?status=error`)

    const row = await prisma.verificationToken.findUnique({ where: { token } as any })
    if (!row || row.type !== 'approval') {
      return res.redirect(`${authBaseFromEnv()}/auth/approval?status=error`)
    }

    const actToken = randomBytes(20).toString('hex')
    await prisma.verificationToken.create({
      data: {
        email: row.email,
        token: actToken,
        type: 'activation',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    })
    await prisma.verificationToken.delete({ where: { token } as any })

    try {
      const tpl = getEmailTemplate('activation.txt')
      const activateUrl = `${authUrl}/api/auth/activate?token=${actToken}`
      const text = renderTemplate(tpl, { name: row.email, activateUrl, homeUrl: `${authUrl}/` })
      await sendMail({ to: row.email, subject: 'Account aktivieren', text })
    } catch (mailErr) {
      console.error('approve activation mail error', mailErr)
      return res.redirect(`${authBaseFromEnv()}/auth/approval?status=error`)
    }

    return res.redirect(`${authBaseFromEnv()}/auth/approval?status=success`)
  } catch (err) {
    console.error('GET /api/auth/approve error', err)
    return res.redirect(`${authBaseFromEnv()}/auth/approval?status=error`)
  }
})

app.post('/api/lookup', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const barcode = String(req.body?.barcode || '').trim()
    if (!barcode) return res.status(400).json({ error: 'barcode required' })

    const product = await productLookup(barcode)
    if (!product) return res.json({ found: false })
    return res.json({ found: true, product })
  } catch (err) {
    console.error('POST /api/lookup error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.get('/api/products', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const q = String(req.query.q || '').trim()
    const products = await prisma.product.findMany({
      where: q
        ? {
            OR: [{ name: { contains: q } }, { barcode: { contains: q } }],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return res.json(products)
  } catch (err) {
    console.error('GET /api/products error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/products', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const name = String(req.body?.name || '').trim()
    const brand = req.body?.brand ? String(req.body.brand) : null
    const barcodeRaw = req.body?.barcode ? String(req.body.barcode).trim() : ''
    const image = req.body?.image ? String(req.body.image) : null

    if (!name) return res.status(400).json({ error: 'name required' })

    if (barcodeRaw) {
      const existingByBarcode = await prisma.product.findUnique({ where: { barcode: barcodeRaw } })
      if (existingByBarcode) return res.json(existingByBarcode)
    }

    const existingByName = await prisma.product.findFirst({ where: { name } })
    if (existingByName) {
      const isManual = typeof existingByName.barcode === 'string' && existingByName.barcode.startsWith('manual-')
      if (isManual) {
        const base = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '') || `manual-${Date.now()}`
        let candidate = base
        let suffix = 0
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const exists = await prisma.product.findUnique({ where: { barcode: candidate } })
          if (!exists) {
            const updated = await prisma.product.update({ where: { id: existingByName.id }, data: { barcode: candidate } })
            return res.json(updated)
          }
          suffix += 1
          candidate = `${base}-${suffix}`
        }
      }
      return res.json(existingByName)
    }

    let barcode = barcodeRaw
    if (!barcode) {
      const base = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '') || `manual-${Date.now()}`
      let candidate = base
      let suffix = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const exists = await prisma.product.findUnique({ where: { barcode: candidate } })
        if (!exists) {
          barcode = candidate
          break
        }
        suffix += 1
        candidate = `${base}-${suffix}`
      }
    }

    const product = await prisma.product.create({
      data: {
        name,
        brand: brand || undefined,
        barcode,
        image: image || undefined,
      },
    })
    return res.json(product)
  } catch (err) {
    console.error('POST /api/products error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.get('/api/products/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' })

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        stocks: {
          where: buildHouseholdScope(auth.householdId),
          include: { location: true },
          orderBy: { createdAt: 'desc' },
        },
        histories: {
          where: buildHouseholdScope(auth.householdId),
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
      },
    })

    if (!product) return res.status(404).json({ error: 'not found' })
    return res.json(product)
  } catch (err) {
    console.error('GET /api/products/:id error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/products/:id/image', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'invalid id' })

    const data = req.body?.data ? String(req.body.data) : ''
    if (!data) return res.status(400).json({ error: 'no data' })

    const parsed = data.match(/^data:(image\/(png|jpe?g));base64,(.+)$/)
    if (!parsed) return res.status(400).json({ error: 'invalid data' })

    const mime = parsed[1]
    const ext = mime.includes('png') ? 'png' : 'jpg'
    const b64 = parsed[3]
    const buffer = Buffer.from(b64, 'base64')

    const uploadsDir = resolveUploadsDir()
    const filename = `product-${id}-${Date.now()}.${ext}`
    const filepath = path.join(uploadsDir, filename)
    fs.writeFileSync(filepath, buffer)

    const imageUrl = `/uploads/${filename}`
    await prisma.product.update({ where: { id }, data: { image: imageUrl } })
    return res.json({ ok: true, url: imageUrl })
  } catch (err) {
    console.error('POST /api/products/:id/image error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.delete('/api/products/:id/image', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'invalid id' })

    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) return res.status(404).json({ error: 'not found' })

    if (product.image && product.image.startsWith('/uploads/')) {
      const uploadsDir = resolveUploadsDir()
      const filename = path.basename(product.image)
      const filepath = path.join(uploadsDir, filename)
      if (fs.existsSync(filepath)) {
        try {
          fs.unlinkSync(filepath)
        } catch (err) {
          console.error('delete product image file error', err)
        }
      }
    }

    await prisma.product.update({ where: { id }, data: { image: null } })
    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/products/:id/image error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.get('/api/locations', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const requestedHousehold = parsePositiveInt(req.query.householdId)
    if (requestedHousehold && auth.householdId && requestedHousehold !== auth.householdId) {
      return res.status(403).json({ error: 'forbidden' })
    }

    const householdId = requestedHousehold || auth.householdId || null
    if (!householdId) return res.json([])

    const locations = await prisma.location.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
    })
    return res.json(locations)
  } catch (err) {
    console.error('GET /api/locations error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/locations', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ error: 'name required' })

    const requestedHousehold = parsePositiveInt(req.body?.householdId)
    if (requestedHousehold && auth.householdId && requestedHousehold !== auth.householdId) {
      return res.status(403).json({ error: 'forbidden' })
    }

    const householdId = requestedHousehold || auth.householdId || null
    if (!householdId) return res.status(400).json({ error: 'householdId required' })

    const location = await prisma.location.create({ data: { name, householdId } })
    return res.json(location)
  } catch (err) {
    console.error('POST /api/locations error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.patch('/api/locations/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = Number(req.params.id)
    const name = String(req.body?.name || '').trim()
    if (!id || !name) return res.status(400).json({ error: 'invalid request' })

    const existing = await prisma.location.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'not found' })
    if (auth.householdId && existing.householdId !== auth.householdId) return res.status(404).json({ error: 'not found' })

    const updated = await prisma.location.update({ where: { id }, data: { name } })
    return res.json(updated)
  } catch (err) {
    console.error('PATCH /api/locations/:id error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.delete('/api/locations/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'invalid id' })

    const existing = await prisma.location.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'not found' })
    if (auth.householdId && existing.householdId !== auth.householdId) return res.status(404).json({ error: 'not found' })

    await prisma.location.delete({ where: { id } })
    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/locations/:id error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.get('/api/stock', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const stocks = await prisma.stock.findMany({
      where: buildHouseholdScope(auth.householdId),
      include: { product: true, location: true },
      orderBy: { createdAt: 'desc' },
    })

    const aggregate = new Map<string, any>()
    for (const stock of stocks) {
      const key = `${stock.productId}-${stock.locationId}-${stock.householdId ?? 'null'}`
      if (!aggregate.has(key)) {
        aggregate.set(key, { ...stock })
      } else {
        const current = aggregate.get(key)
        current.quantity = Number(current.quantity) + Number(stock.quantity)
        if (new Date(stock.createdAt) < new Date(current.createdAt)) current.createdAt = stock.createdAt
      }
    }

    const aggregated = Array.from(aggregate.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return res.json(aggregated)
  } catch (err) {
    console.error('GET /api/stock error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/stock', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const body = req.body || {}
    const locationId = parsePositiveInt(body.locationId)
    const quantity = Number(body.quantity || 1)
    const unit = body.unit ? String(body.unit) : undefined
    const mhd = body.mhd ? new Date(String(body.mhd)) : undefined

    if (!locationId) return res.status(400).json({ error: 'locationId required' })
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity invalid' })

    let productId = parsePositiveInt(body.productId)
    const barcode = body.barcode ? String(body.barcode).trim() : ''

    if (!productId && barcode) {
      const product = await productLookup(barcode)
      productId = product ? product.id : null
    }

    if (!productId) return res.status(400).json({ error: 'productId or barcode required' })

    const requestedHousehold = parsePositiveInt(body.householdId)
    if (requestedHousehold && auth.householdId && requestedHousehold !== auth.householdId) {
      return res.status(403).json({ error: 'forbidden' })
    }

    const householdId = requestedHousehold || auth.householdId || null

    const existing = await prisma.stock.findFirst({
      where: {
        productId,
        locationId,
        householdId: householdId ?? undefined,
      },
    })

    if (existing) {
      const updated = await prisma.stock.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
      })
      await prisma.history.create({
        data: {
          productId,
          locationId,
          quantity,
          action: 'ADD',
          householdId: householdId ?? undefined,
        },
      })
      return res.json(updated)
    }

    const created = await prisma.stock.create({
      data: {
        productId,
        locationId,
        quantity,
        unit,
        mhd,
        householdId: householdId ?? undefined,
      },
    })

    await prisma.history.create({
      data: {
        productId,
        locationId,
        quantity,
        action: 'ADD',
        householdId: householdId ?? undefined,
      },
    })

    return res.json(created)
  } catch (err) {
    console.error('POST /api/stock error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/stock/move', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const fromStockId = parsePositiveInt(req.body?.fromStockId)
    const toLocationId = parsePositiveInt(req.body?.toLocationId)
    const amount = Number(req.body?.amount || 1)

    if (!fromStockId || !toLocationId || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'invalid parameters' })
    }

    const source = await prisma.stock.findUnique({ where: { id: fromStockId } })
    if (!source) return res.status(404).json({ error: 'source stock not found' })
    if (auth.householdId && source.householdId !== auth.householdId) return res.status(404).json({ error: 'source stock not found' })
    if (source.locationId === toLocationId) return res.status(400).json({ error: 'target must be different' })
    if (source.quantity < amount) return res.status(400).json({ error: 'insufficient quantity' })

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const remaining = source.quantity - amount

      await tx.history.create({
        data: {
          productId: source.productId,
          locationId: source.locationId,
          quantity: amount,
          action: 'REMOVED',
          householdId: source.householdId ?? undefined,
        },
      })

      if (remaining <= 0) await tx.stock.delete({ where: { id: source.id } })
      else await tx.stock.update({ where: { id: source.id }, data: { quantity: remaining } })

      const target = await tx.stock.findFirst({
        where: {
          productId: source.productId,
          locationId: toLocationId,
          householdId: source.householdId ?? undefined,
        },
      })

      if (target) {
        await tx.stock.update({ where: { id: target.id }, data: { quantity: target.quantity + amount } })
      } else {
        await tx.stock.create({
          data: {
            productId: source.productId,
            locationId: toLocationId,
            quantity: amount,
            unit: source.unit || undefined,
            householdId: source.householdId ?? undefined,
          },
        })
      }

      await tx.history.create({
        data: {
          productId: source.productId,
          locationId: toLocationId,
          quantity: amount,
          action: 'ADDED',
          householdId: source.householdId ?? undefined,
        },
      })
    })

    return res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/stock/move error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/stock/:id/reduce', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = Number(req.params.id)
    const amount = Number(req.body?.amount || 1)
    const toShopping = Boolean(req.body?.toShopping)
    const userId = parsePositiveInt(req.body?.userId) || auth.userId

    if (!id || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'invalid amount' })

    const stock = await prisma.stock.findUnique({ where: { id } })
    if (!stock) return res.status(404).json({ error: 'not found' })
    if (auth.householdId && stock.householdId !== auth.householdId) return res.status(404).json({ error: 'not found' })

    const remaining = Number(stock.quantity) - amount

    await prisma.history.create({
      data: {
        productId: stock.productId,
        locationId: stock.locationId,
        quantity: amount,
        action: 'REMOVED',
        householdId: stock.householdId ?? undefined,
      },
    })

    if (toShopping && stock.householdId) {
      await ensureShoppingListItemTable()
      const existing = await prisma.shoppingListItem.findFirst({
        where: { productId: stock.productId, householdId: stock.householdId },
      })

      if (existing) {
        await prisma.shoppingListItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + 1 },
        })
      } else {
        await prisma.shoppingListItem.create({
          data: {
            productId: stock.productId,
            householdId: stock.householdId,
            quantity: 1,
            addedById: userId || undefined,
          },
        })
      }
    }

    if (remaining <= 0) {
      await prisma.stock.delete({ where: { id } })
      return res.json({ ok: true, deleted: true })
    }

    const updated = await prisma.stock.update({ where: { id }, data: { quantity: remaining } })
    return res.json({ ok: true, updated })
  } catch (err) {
    console.error('POST /api/stock/:id/reduce error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

async function resolveShoppingHouseholdId(req: ExpressRequest, auth: AuthContext) {
  const fromQuery = parsePositiveInt(req.query.householdId)
  if (fromQuery && auth.householdId && fromQuery !== auth.householdId) return { error: 'forbidden', householdId: null }
  const householdId = fromQuery || auth.householdId || null
  return { householdId, error: null }
}

app.get('/api/shopping', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const scope = await resolveShoppingHouseholdId(req, auth)
    if (scope.error) return res.status(403).json({ error: scope.error })
    if (!scope.householdId) return res.json({ items: [] })

    await ensureShoppingListItemTable()
    const items = await prisma.shoppingListItem.findMany({
      where: { householdId: scope.householdId },
      orderBy: { createdAt: 'desc' },
      include: { product: true, addedBy: true },
    })
    return res.json({ items })
  } catch (err) {
    console.error('GET /api/shopping error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/shopping', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!auth.householdId) return res.status(400).json({ error: 'No household assigned' })

    await ensureShoppingListItemTable()

    const productId = parsePositiveInt(req.body?.productId)
    const name = req.body?.name ? String(req.body.name).trim() : ''
    const note = req.body?.note ? String(req.body.note) : null
    const quantity = Number(req.body?.quantity || 1)

    if (!name && !productId) return res.status(400).json({ error: 'name or productId required' })

    let product = null as Awaited<ReturnType<typeof prisma.product.findUnique>>
    if (productId) {
      product = await prisma.product.findUnique({ where: { id: productId } })
      if (!product) return res.status(404).json({ error: 'product not found' })
    } else {
      const barcode = `manual-${Date.now()}-${Math.floor(Math.random() * 10000)}`
      product = await prisma.product.create({ data: { name, barcode } })
    }

    if (!product) return res.status(500).json({ error: 'product not resolved' })

    const existing = await prisma.shoppingListItem.findFirst({
      where: { productId: product.id, householdId: auth.householdId },
    })

    const item = existing
      ? await prisma.shoppingListItem.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1),
            note: note || existing.note,
          },
        })
      : await prisma.shoppingListItem.create({
          data: {
            productId: product.id,
            householdId: auth.householdId,
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            note,
            addedById: auth.userId || undefined,
          },
        })

    return res.json({ ok: true, item })
  } catch (err) {
    console.error('POST /api/shopping error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.get('/api/shopping/recent-removed', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!auth.householdId) return res.json([])

    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
    const history = await prisma.history.findMany({
      where: {
        action: 'REMOVED',
        createdAt: { gte: since },
        householdId: auth.householdId,
      },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    const seen = new Set<number>()
    const items: Array<any> = []

    for (const entry of history) {
      const product = entry.product
      if (!product) continue
      if (seen.has(entry.productId)) continue

      const dismissed = await prisma.history.findFirst({
        where: {
          productId: product.id,
          householdId: auth.householdId,
          action: 'SHOPPING_DISMISSED',
        },
        orderBy: { createdAt: 'desc' },
      })
      if (dismissed && dismissed.createdAt >= entry.createdAt) continue

      const hasStock = await prisma.stock.findFirst({
        where: { productId: product.id, householdId: auth.householdId, quantity: { gt: 0 } },
      })
      if (hasStock) continue

      const onList = await prisma.shoppingListItem.findFirst({
        where: { productId: product.id, householdId: auth.householdId },
      })
      if (onList) continue

      seen.add(entry.productId)
      items.push({ product, lastRemovedAt: entry.createdAt, quantity: entry.quantity })
      if (items.length >= 20) break
    }

    return res.json(items)
  } catch (err) {
    console.error('GET /api/shopping/recent-removed error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

async function findScopedShoppingItem(id: number, householdId: number | null) {
  if (!householdId) return null
  const item = await prisma.shoppingListItem.findUnique({ where: { id } })
  if (!item || item.householdId !== householdId) return null
  return item
}

app.get('/api/shopping/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'invalid id' })

    const item = await prisma.shoppingListItem.findUnique({
      where: { id },
      include: { product: true, addedBy: true },
    })

    if (!item || !auth.householdId || item.householdId !== auth.householdId) {
      return res.status(404).json({ error: 'not found' })
    }

    return res.json(item)
  } catch (err) {
    console.error('GET /api/shopping/:id error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.patch('/api/shopping/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'invalid id' })

    const item = await findScopedShoppingItem(id, auth.householdId)
    if (!item) return res.status(404).json({ error: 'not found' })

    await ensureShoppingListItemColumns()

    const data: Record<string, any> = {}
    if (typeof req.body?.quantity !== 'undefined') data.quantity = Number(req.body.quantity)
    if (typeof req.body?.note !== 'undefined') data.note = req.body.note || null

    try {
      const updated = await prisma.shoppingListItem.update({ where: { id }, data })
      return res.json({ ok: true, updated })
    } catch (err: any) {
      const msg = String(err?.message || '')
      if (msg.includes('Unknown argument') && msg.includes('note')) {
        const q = Number(data.quantity ?? item.quantity)
        const n = data.note ?? null
        await prisma.$executeRawUnsafe('UPDATE "ShoppingListItem" SET quantity = ?, note = ? WHERE id = ?', q, n, id)
        const refreshed = await prisma.shoppingListItem.findUnique({ where: { id } })
        return res.json({ ok: true, updated: refreshed })
      }
      throw err
    }
  } catch (err) {
    console.error('PATCH /api/shopping/:id error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.delete('/api/shopping/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'invalid id' })

    const item = await findScopedShoppingItem(id, auth.householdId)
    if (!item) return res.status(404).json({ error: 'not found' })

    await prisma.$transaction([
      prisma.history.create({
        data: {
          productId: item.productId,
          quantity: item.quantity,
          action: 'SHOPPING_DISMISSED',
          householdId: item.householdId,
        },
      }),
      prisma.shoppingListItem.delete({ where: { id } }),
    ])

    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/shopping/:id error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.get('/api/profile', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const email = normalizeEmail(req.query.email)
    if (!email) return res.status(400).json({ error: 'missing email' })

    if (!isAdmin(auth) && auth.email && auth.email.toLowerCase() !== email) {
      return res.status(403).json({ error: 'forbidden' })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true } as any,
    })
    if (!user) return res.json(null)

    try {
      const rows = await prisma.$queryRaw`SELECT image FROM "User" WHERE email = ${email}`
      if (Array.isArray(rows) && rows[0] && (rows[0] as any).image) {
        ;(user as any).image = (rows[0] as any).image
      }
    } catch {
      // optional column may not exist
    }

    return res.json(user)
  } catch (err) {
    console.error('GET /api/profile error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/profile', upload.single('image'), async (req: RequestWithFile, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const email = normalizeEmail(req.body?.email)
    const name = req.body?.name ? String(req.body.name) : ''
    if (!email) return res.status(400).json({ error: 'missing email' })

    if (!isAdmin(auth) && auth.email && auth.email.toLowerCase() !== email) {
      return res.status(403).json({ error: 'forbidden' })
    }

    await ensureImageColumn()

    let imagePath: string | null = null
    if (req.file && req.file.buffer) {
      const uploadsDir = resolveUploadsDir()
      const ext = path.extname(req.file.originalname || '') || '.jpg'
      const filename = `profile-${Date.now()}${Math.random().toString(36).slice(2, 8)}${ext}`
      const filepath = path.join(uploadsDir, filename)
      fs.writeFileSync(filepath, req.file.buffer)
      imagePath = `/uploads/${filename}`
    }

    if (name) {
      await prisma.user.update({ where: { email }, data: { name } as any })
    }

    if (imagePath) {
      await prisma.$executeRaw`UPDATE "User" SET image = ${imagePath} WHERE email = ${email}`
    }

    return res.json({ ok: true, image: imagePath || null })
  } catch (err) {
    console.error('POST /api/profile error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.get('/api/recipes/available', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const stocks = await prisma.stock.findMany({
      where: {
        quantity: { gt: 0 },
        ...buildHouseholdScope(auth.householdId),
      },
      include: { product: true },
    })
    const items = stocks.map((s: any) => ({ id: s.id, name: s.product.name, quantity: s.quantity, unit: s.unit }))
    return res.json(items)
  } catch (err) {
    console.error('GET /api/recipes/available error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/recipes/generate', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const userInput = String(req.body?.userInput || '').trim()
    const stocks = await prisma.stock.findMany({
      where: {
        quantity: { gt: 0 },
        ...buildHouseholdScope(auth.householdId),
      },
      include: { product: true },
    })
    const ingredientNames = stocks.map(
      (s: any) => `${s.product.name}${s.quantity ? ` (${s.quantity}${s.unit ? ` ${s.unit}` : ''})` : ''}`
    )

    const templatePath = resolvePromptTemplatePath()
    const template = templatePath
      ? fs.readFileSync(templatePath, 'utf8')
      : 'Verfügbare Zutaten:\n{{ingredients}}\n\nBenutzerwunsch:\n{{user_input}}\n\nErstelle ein Rezept.'

    const prompt = renderTemplate(template, {
      ingredients: ingredientNames.join('\n'),
      user_input: userInput || 'keine speziellen Wünsche',
    })

    const ollamaEnabledRaw = process.env.OLLAMA_ENABLED
    const enabled = typeof ollamaEnabledRaw === 'undefined' ? true : isTruthy(ollamaEnabledRaw)
    if (!enabled || !process.env.OLLAMA_URL) {
      return res.status(503).json({ recipe: 'Chat nicht verfügbar' })
    }

    try {
      const recipe = await callOllama(prompt)
      return res.json({ recipe })
    } catch (err) {
      console.error('POST /api/recipes/generate ollama error', err)
      return res.status(503).json({ recipe: 'Chat nicht verfügbar' })
    }
  } catch (err) {
    console.error('POST /api/recipes/generate error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/recipes/email', async (req, res) => {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const recipe = String(req.body?.recipe || '').trim()
    const subject = req.body?.subject ? String(req.body.subject) : 'Dein Rezept von nomnomstock'
    if (!recipe) return res.status(400).json({ error: 'missing recipe' })

    let recipient = auth.email
    if (!recipient && auth.userId) {
      const user = await prisma.user.findUnique({ where: { id: auth.userId } })
      recipient = user?.email || null
    }
    if (!recipient) return res.status(400).json({ error: 'no email available' })

    const text = recipe
    const html = `<pre style="white-space:pre-wrap">${recipe.replace(/</g, '&lt;')}</pre>`
    await sendMail({ to: recipient, subject, text, html })
    return res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/recipes/email error', err)
    return res.status(500).json({ error: 'server error' })
  }
})

app.post('/api/debug/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || '')
    if (!email || !password) return res.status(400).json({ ok: false, error: 'missing' })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(404).json({ ok: false, error: 'not_found' })
    if (!(user as any).isActive) return res.status(403).json({ ok: false, error: 'inactive' })

    const hash = (user as any).password
    if (!hash) return res.status(403).json({ ok: false, error: 'no_password' })

    const ok = await bcrypt.compare(password, hash)
    return res.json({ ok, user: { id: user.id, email: user.email, name: user.name } })
  } catch (err) {
    console.error('POST /api/debug/login error', err)
    return res.status(500).json({ ok: false, error: 'server_error' })
  }
})

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`[backend] server listening on http://0.0.0.0:${port}`)
})
