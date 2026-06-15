import type { Request as ExpressRequest, Response } from 'express'
import { createHash, randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { getToken } from 'next-auth/jwt'

import { prisma } from '../lib/prisma'
import { lookupOpenBeautyFacts, lookupOpenFoodFacts } from '../lib/api/lookup'

export type AuthContext = {
  token: any
  householdId: number | null
  userId: number | null
  email: string | null
  role: string | null
  scopes: string[]
  clientType: 'web' | 'device' | 'api'
  apiTokenId?: number
  deviceId?: number | null
}

export type AuthUser = {
  id: number
  email: string
  name?: string | null
  role?: string | null
  householdId?: number | null
}

export type RequestWithFile = ExpressRequest & { file?: Express.Multer.File }

export function parsePositiveInt(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function isTruthy(value: string | undefined) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function hashSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

export function generatePairingKey() {
  return `NNSP${randomBytes(12).toString('hex').toUpperCase()}`
}

export function generateApiToken() {
  return `nns_${randomBytes(32).toString('base64url')}`
}

export function parseScopes(value: string | null | undefined) {
  if (!value) return [] as string[]
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map((scope) => String(scope)).filter(Boolean)
  } catch {
    // Fall through to whitespace/comma parsing for older manually-created rows.
  }
  return value
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
}

export function serializeScopes(scopes: string[]) {
  return JSON.stringify(Array.from(new Set(scopes.filter(Boolean))))
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

export function resolveAuthUrl() {
  const raw = process.env.NEXTAUTH_URL || process.env.APP_URL
  if (raw) return raw.replace(/\/$/, '')
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  throw new Error('AUTH_URL_NOT_CONFIGURED')
}

export function authBaseFromEnv() {
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

export function resolveUploadsDir() {
  const configured = process.env.UPLOAD_DIR ? path.resolve(process.cwd(), process.env.UPLOAD_DIR) : null
  const localBackendDir = fs.existsSync(path.resolve(process.cwd(), 'backend', 'prisma'))
    ? path.resolve(process.cwd(), 'backend', 'prisma', 'data', 'uploads')
    : path.resolve(process.cwd(), 'prisma', 'data', 'uploads')

  const dir = configured || localBackendDir
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function resolvePromptTemplatePath() {
  const candidates = [
    path.resolve(process.cwd(), 'prompts', 'recipe_prompt.txt'),
    path.resolve(process.cwd(), '..', 'prompts', 'recipe_prompt.txt'),
    path.resolve(process.cwd(), '..', '..', 'prompts', 'recipe_prompt.txt'),
  ]
  return resolveFileFromCandidates(candidates)
}

export function getEmailTemplate(name: string) {
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

function getBearerToken(req: ExpressRequest) {
  const header = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization || ''
  const match = String(header).match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

function normalizeApiPath(pathname: string) {
  if (pathname.startsWith('/api/v1/')) return `/api/${pathname.slice('/api/v1/'.length)}`
  return pathname
}

function requiredScopeForRequest(req: ExpressRequest) {
  const method = req.method.toUpperCase()
  const pathname = normalizeApiPath(req.path)

  if (method === 'GET' && (pathname === '/api/health' || pathname === '/api/openapi.json')) return null
  if (method === 'POST' && pathname === '/api/lookup') return 'product:lookup'
  if (method === 'GET' && (pathname === '/api/products' || /^\/api\/products\/\d+$/.test(pathname))) return 'product:read'
  if (method === 'GET' && pathname === '/api/locations') return 'location:read'
  if (method === 'GET' && pathname === '/api/stock') return 'stock:read'
  if (method === 'POST' && pathname === '/api/stock') return 'stock:add'
  if (method === 'POST' && (pathname === '/api/stock/move' || /^\/api\/stock\/\d+\/reduce$/.test(pathname))) {
    return 'stock:write'
  }
  if (method === 'POST' && pathname === '/api/scanner/events') return 'scanner:write'
  if (method === 'GET' && pathname === '/api/scanner/events') return 'scanner:read'
  if (method === 'PATCH' && /^\/api\/scanner\/events\/\d+$/.test(pathname)) return 'scanner:write'
  if (pathname === '/api/devices' || pathname.startsWith('/api/devices/')) return 'device:manage'
  if (pathname === '/api/offers/settings' || pathname === '/api/offers/refresh') return 'shopping:write'
  if (pathname === '/api/shopping/offer-plan' || pathname === '/api/shopping/offer-plan/latest') return 'shopping:read'

  return '*'
}

export function hasScope(auth: AuthContext, requiredScope: string | null) {
  if (!requiredScope) return true
  if (auth.clientType !== 'device' && auth.clientType !== 'api') return true
  if (auth.scopes.includes('*')) return true
  if (auth.scopes.includes(requiredScope)) return true

  const [resource] = requiredScope.split(':')
  return auth.scopes.includes(`${resource}:*`)
}

async function getBearerAuthContext(req: ExpressRequest) {
  const bearerToken = getBearerToken(req)
  if (!bearerToken) return { present: false, auth: null as AuthContext | null }

  const tokenHash = hashSecret(bearerToken)
  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, email: true, role: true, householdId: true } },
      device: true,
    },
  })

  const now = new Date()
  if (!apiToken || apiToken.revokedAt || (apiToken.expiresAt && apiToken.expiresAt <= now)) {
    return { present: true, auth: null as AuthContext | null }
  }

  if (apiToken.device && apiToken.device.status !== 'active') {
    return { present: true, auth: null as AuthContext | null }
  }

  await prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: now } }).catch(() => undefined)
  if (apiToken.deviceId) {
    await prisma.device.update({ where: { id: apiToken.deviceId }, data: { lastSeenAt: now } }).catch(() => undefined)
  }

  const householdId = apiToken.householdId ?? apiToken.device?.householdId ?? apiToken.user?.householdId ?? null
  const userId = apiToken.userId ?? apiToken.user?.id ?? null
  const email = apiToken.user?.email ?? null
  const role = apiToken.user?.role ?? null
  const clientType = apiToken.clientType === 'device' ? 'device' : 'api'

  return {
    present: true,
    auth: {
      token: null,
      householdId,
      userId,
      email,
      role,
      scopes: parseScopes(apiToken.scopes),
      clientType,
      apiTokenId: apiToken.id,
      deviceId: apiToken.deviceId,
    } satisfies AuthContext,
  }
}

export async function getAuthContext(req: ExpressRequest): Promise<AuthContext | null> {
  const bearer = await getBearerAuthContext(req)
  if (bearer.present) return bearer.auth

  const token = await getAuthToken(req)
  if (!token) return null

  const email = typeof token.email === 'string' ? token.email : null
  const householdIdFromToken = parsePositiveInt((token as any).householdId)
  const userId = parsePositiveInt(token.sub)
  const role = typeof (token as any).role === 'string' ? String((token as any).role) : null

  if (householdIdFromToken) {
    return { token, householdId: householdIdFromToken, userId, email, role, scopes: ['*'], clientType: 'web' }
  }

  if (!email) {
    return { token, householdId: null, userId, email: null, role, scopes: ['*'], clientType: 'web' }
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { householdId: true, role: true } })
  return {
    token,
    householdId: user?.householdId ?? null,
    userId,
    email,
    role: role || (user?.role ?? null),
    scopes: ['*'],
    clientType: 'web',
  }
}

export async function requireAuth(req: ExpressRequest, res: Response) {
  const auth = await getAuthContext(req)
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const requiredScope = requiredScopeForRequest(req)
  if (!hasScope(auth, requiredScope)) {
    res.status(403).json({ error: 'forbidden' })
    return null
  }
  return auth
}

export function isAdmin(auth: AuthContext) {
  return String(auth.role || '').toUpperCase() === 'ADMIN'
}

export function buildHouseholdScope(householdId: number | null) {
  if (!householdId) return {}
  return { householdId }
}

export async function productLookup(barcode: string) {
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

export async function createHouseholdForUser(email: string, name?: string | null) {
  const baseName = (name || email.split('@')[0] || 'Haushalt').trim()
  const safeBase = baseName.length > 40 ? baseName.slice(0, 40) : baseName

  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? `${safeBase} Haushalt` : `${safeBase} Haushalt ${i + 1}`
    const existing = await prisma.household.findUnique({ where: { name: candidate } })
    if (!existing) {
      const household = await prisma.household.create({ data: { name: candidate } })
      await ensureDefaultLocation(household.id)
      return household.id
    }
  }

  const household = await prisma.household.create({ data: { name: `Haushalt ${Date.now()}` } })
  await ensureDefaultLocation(household.id)
  return household.id
}

export const DEFAULT_LOCATION_NAME = 'Vorrat'

export async function ensureDefaultLocation(householdId: number) {
  const existing = await prisma.location.findFirst({
    where: { householdId, name: DEFAULT_LOCATION_NAME },
    orderBy: { createdAt: 'asc' },
  })

  if (existing) return existing

  return prisma.location.create({
    data: { name: DEFAULT_LOCATION_NAME, householdId },
  })
}

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function llmProvider() {
  const explicit = (process.env.LLM_PROVIDER || '').trim().toLowerCase()
  if (explicit) return explicit
  if (process.env.LLM_BASE_URL) return 'openai'
  return 'ollama'
}

function openAiPath(baseUrl: string, pathName: string) {
  const base = baseUrl.replace(/\/$/, '')
  return base.endsWith('/v1') ? `${base}${pathName}` : `${base}/v1${pathName}`
}

export function isLanguageModelConfigured() {
  const enabledRaw = process.env.LLM_ENABLED ?? process.env.OLLAMA_ENABLED
  const enabled = typeof enabledRaw === 'undefined' ? true : isTruthy(enabledRaw)
  if (!enabled) return false
  return Boolean(process.env.LLM_BASE_URL || process.env.OLLAMA_URL)
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function callOllamaGenerate(prompt: string) {
  const url = process.env.OLLAMA_URL
  const model = process.env.OLLAMA_MODEL || process.env.LLM_MODEL || 'cortex'
  if (!url) throw new Error('OLLAMA_URL not configured')

  const full = `${url.replace(/\/$/, '')}/api/generate`
  const timeoutMs = envNumber('LLM_TIMEOUT_MS', envNumber('OLLAMA_TIMEOUT_MS', 60000))
  const temperature = process.env.LLM_TEMPERATURE || process.env.OLLAMA_TEMPERATURE
  const maxTokens = process.env.LLM_MAX_TOKENS || process.env.OLLAMA_MAX_TOKENS
  const options: Record<string, number> = {}
  if (temperature) options.temperature = Number(temperature)
  if (maxTokens) options.num_predict = Number(maxTokens)

  const response = await fetchWithTimeout(full, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, ...(Object.keys(options).length ? { options } : {}) }),
  }, timeoutMs)

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

async function resolveOpenAiCompatibleModel(baseUrl: string, timeoutMs: number) {
  const explicit = process.env.LLM_MODEL || process.env.OPENAI_MODEL
  if (explicit) return explicit

  try {
    const headers: Record<string, string> = {}
    if (process.env.LLM_API_KEY) headers.Authorization = `Bearer ${process.env.LLM_API_KEY}`
    const response = await fetchWithTimeout(openAiPath(baseUrl, '/models'), { headers }, Math.min(timeoutMs, 5000))
    if (response.ok) {
      const parsed = await response.json().catch(() => null)
      const id = parsed?.data?.[0]?.id
      if (id) return String(id)
    }
  } catch {
    // Some local llama.cpp servers accept any model id or do not expose /v1/models.
  }

  return 'local-model'
}

async function callOpenAiCompatibleChat(prompt: string) {
  const baseUrl = process.env.LLM_BASE_URL
  if (!baseUrl) throw new Error('LLM_BASE_URL not configured')

  const timeoutMs = envNumber('LLM_TIMEOUT_MS', envNumber('OLLAMA_TIMEOUT_MS', 60000))
  const model = await resolveOpenAiCompatibleModel(baseUrl, timeoutMs)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.LLM_API_KEY) headers.Authorization = `Bearer ${process.env.LLM_API_KEY}`

  const response = await fetchWithTimeout(openAiPath(baseUrl, '/chat/completions'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: 'Du bist ein hilfreicher Kochassistent. Antworte auf Deutsch.' },
        { role: 'user', content: prompt },
      ],
      temperature: envNumber('LLM_TEMPERATURE', envNumber('OLLAMA_TEMPERATURE', 0.7)),
      max_tokens: envNumber('LLM_MAX_TOKENS', envNumber('OLLAMA_MAX_TOKENS', 1024)),
    }),
  }, timeoutMs)

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`LLM request failed${errText ? `: ${errText.slice(0, 200)}` : ''}`)
  }

  const parsed = await response.json().catch(() => null)
  const content = parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text
  if (content) return String(content)
  return JSON.stringify(parsed)
}

export async function callLanguageModel(prompt: string) {
  const provider = llmProvider()
  if (['openai', 'llama', 'llama_cpp', 'llama-cpp'].includes(provider)) {
    return callOpenAiCompatibleChat(prompt)
  }
  return callOllamaGenerate(prompt)
}

export async function callOllama(prompt: string) {
  return callOllamaGenerate(prompt)
}
