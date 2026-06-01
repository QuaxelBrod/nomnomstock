#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/$/, '')
}

const smokeMode = process.env.SMOKE_MODE || 'web'
if (!['web', 'backend'].includes(smokeMode)) {
  throw new Error(`Invalid SMOKE_MODE "${smokeMode}". Use "web" or "backend".`)
}

const webBaseUrl = normalizeBaseUrl(
  process.env.SMOKE_WEB_BASE_URL || process.env.SMOKE_BASE_URL || 'http://localhost:3000'
)
const backendBaseUrl = normalizeBaseUrl(
  process.env.SMOKE_BACKEND_BASE_URL || process.env.BACKEND_URL || 'http://localhost:3001'
)
const authBaseUrl = normalizeBaseUrl(process.env.SMOKE_AUTH_BASE_URL || webBaseUrl)
const apiBaseUrl = normalizeBaseUrl(
  process.env.SMOKE_API_BASE_URL || (smokeMode === 'backend' ? backendBaseUrl : webBaseUrl)
)
const apiPrefix = normalizeBaseUrl(process.env.SMOKE_API_PREFIX || '')

if (!process.env.DATABASE_URL) {
  const defaultDbPath = path.resolve(process.cwd(), 'backend', 'prisma', 'data', 'nomnom.db')
  process.env.DATABASE_URL = `file:${defaultDbPath}`
}

const prisma = new PrismaClient()

class CookieJar {
  constructor() {
    this.cookies = new Map()
  }

  setFromResponse(response) {
    const setCookieHeader = response.headers
    let values = []

    if (typeof setCookieHeader.getSetCookie === 'function') {
      values = setCookieHeader.getSetCookie()
    } else {
      const single = setCookieHeader.get('set-cookie')
      if (single) values = [single]
    }

    for (const raw of values) {
      if (!raw) continue
      const firstPair = raw.split(';', 1)[0]
      const eq = firstPair.indexOf('=')
      if (eq <= 0) continue
      const name = firstPair.slice(0, eq).trim()
      const value = firstPair.slice(eq + 1).trim()
      if (!name) continue
      this.cookies.set(name, value)
    }
  }

  toHeader() {
    if (!this.cookies.size) return ''
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }
}

function asStatusList(status) {
  if (Array.isArray(status)) return status
  return [status]
}

async function request(
  pathname,
  {
    method = 'GET',
    jar,
    json,
    form,
    body,
    headers: extraHeaders,
    expectedStatus = [200],
    base = apiBaseUrl,
    prefixApi = true,
  } = {}
) {
  const headers = { ...(extraHeaders || {}) }
  const cookieHeader = jar?.toHeader()
  if (cookieHeader) headers.cookie = cookieHeader

  let payload = body
  if (typeof json !== 'undefined') {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(json)
  } else if (typeof form !== 'undefined') {
    headers['content-type'] = 'application/x-www-form-urlencoded'
    payload = new URLSearchParams(form).toString()
  }

  const targetPath =
    prefixApi && apiPrefix && pathname.startsWith('/api/') ? `${apiPrefix}/${pathname.slice('/api/'.length)}` : pathname

  const response = await fetch(`${base}${targetPath}`, {
    method,
    headers,
    body: payload,
    redirect: 'manual',
  })

  if (jar) jar.setFromResponse(response)

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  const allowed = asStatusList(expectedStatus)
  if (!allowed.includes(response.status)) {
    throw new Error(`Unexpected status ${response.status} for ${method} ${targetPath}. Body: ${text.slice(0, 400)}`)
  }

  return { response, text, data }
}

async function loginWithCredentials(email, password) {
  const jar = new CookieJar()

  const csrf = await request('/api/auth/csrf', {
    jar,
    base: authBaseUrl,
    prefixApi: false,
    expectedStatus: [200],
  })
  const csrfToken = csrf.data?.csrfToken
  assert.ok(csrfToken, 'csrf token missing')

  await request('/api/auth/callback/credentials', {
    method: 'POST',
    jar,
    base: authBaseUrl,
    prefixApi: false,
    form: {
      csrfToken,
      email,
      password,
      callbackUrl: '/lager/',
      json: 'true',
    },
    expectedStatus: [200, 302],
  })

  const session = await request('/api/auth/session', {
    jar,
    base: authBaseUrl,
    prefixApi: false,
    expectedStatus: [200],
  })
  assert.equal(session.data?.user?.email?.toLowerCase(), email.toLowerCase(), 'login session email mismatch')

  return jar
}

function step(label) {
  console.log(`\n[smoke] ${label}`)
}

async function main() {
  console.log(
    `[smoke] mode=${smokeMode} authBase=${authBaseUrl} apiBase=${apiBaseUrl} apiPrefix=${apiPrefix || '(none)'} backendBase=${backendBaseUrl}`
  )

  step('API health')
  await request('/api/health', { expectedStatus: [200] })

  const ts = Date.now()
  const inviterEmail = `smoke.inviter.${ts}@example.com`
  const invitedEmail = `smoke.invited.${ts}@example.com`
  const inviterPassword = 'SmokePass123!'
  const invitedPassword = 'InvitedPass123!'
  const householdName = `Smoke Household ${ts}`

  step('Prepare inviter user in database')
  const household = await prisma.household.create({ data: { name: householdName } })
  const inviterHash = await bcrypt.hash(inviterPassword, 10)

  await prisma.user.upsert({
    where: { email: inviterEmail },
    update: {
      name: 'Smoke Inviter',
      role: 'ADMIN',
      householdId: household.id,
      isActive: true,
      password: inviterHash,
    },
    create: {
      email: inviterEmail,
      name: 'Smoke Inviter',
      role: 'ADMIN',
      householdId: household.id,
      isActive: true,
      password: inviterHash,
    },
  })

  step('Login via NextAuth credentials')
  const inviterJar = await loginWithCredentials(inviterEmail, inviterPassword)

  step('Profile flow (GET + POST)')
  const profile = await request(`/api/profile?email=${encodeURIComponent(inviterEmail)}`, {
    jar: inviterJar,
    expectedStatus: [200],
  })
  assert.equal(profile.data?.email?.toLowerCase(), inviterEmail.toLowerCase(), 'profile email mismatch')

  const profileForm = new FormData()
  profileForm.append('email', inviterEmail)
  profileForm.append('name', 'Smoke Inviter Updated')
  await request('/api/profile', {
    method: 'POST',
    jar: inviterJar,
    body: profileForm,
    expectedStatus: [200],
  })

  step('Locations + Products + Stock flow')
  const location = await request('/api/locations', {
    method: 'POST',
    jar: inviterJar,
    json: { name: `Smoke Location ${ts}` },
    expectedStatus: [200],
  })
  const locationId = location.data?.id
  assert.ok(locationId, 'location id missing')

  const product = await request('/api/products', {
    method: 'POST',
    jar: inviterJar,
    json: { name: `Smoke Product ${ts}` },
    expectedStatus: [200],
  })
  const productId = product.data?.id
  const productBarcode = product.data?.barcode
  assert.ok(productId, 'product id missing')
  assert.ok(productBarcode, 'product barcode missing')

  await request('/api/stock', {
    method: 'POST',
    jar: inviterJar,
    json: { productId, locationId, quantity: 2 },
    expectedStatus: [200],
  })

  const stockList = await request('/api/stock', { jar: inviterJar, expectedStatus: [200] })
  assert.ok(Array.isArray(stockList.data) && stockList.data.length > 0, 'stock list should not be empty')
  const stockId = stockList.data.find((item) => item.productId === productId)?.id
  assert.ok(stockId, 'stock id missing')

  await request(`/api/stock/${stockId}/reduce`, {
    method: 'POST',
    jar: inviterJar,
    json: { amount: 1, toShopping: true },
    expectedStatus: [200],
  })

  step('Shopping flow (list + add + patch)')
  await request('/api/shopping', {
    method: 'POST',
    jar: inviterJar,
    json: { name: `Smoke Shopping ${ts}`, quantity: 1, note: 'smoke note' },
    expectedStatus: [200],
  })

  const shopping = await request('/api/shopping', { jar: inviterJar, expectedStatus: [200] })
  const firstItem = shopping.data?.items?.[0]
  assert.ok(firstItem?.id, 'shopping item missing')

  await request(`/api/shopping/${firstItem.id}`, {
    method: 'PATCH',
    jar: inviterJar,
    json: { quantity: 3, note: 'updated by smoke' },
    expectedStatus: [200],
  })

  step('Device pairing + bearer token flow')
  const pairing = await request('/api/devices/pairing', {
    method: 'POST',
    jar: inviterJar,
    json: {
      name: `Smoke Scanner ${ts}`,
      defaultLocationId: locationId,
      defaultMode: 'stock_add',
      ttlSeconds: 300,
    },
    expectedStatus: [200],
  })
  const pairingKey = pairing.data?.pairing?.key
  assert.ok(pairingKey, 'pairing key missing')
  assert.ok(String(pairing.data?.pairing?.qrPayload || '').includes(pairingKey), 'qr payload should include pairing key')

  const paired = await request('/api/devices/pair', {
    method: 'POST',
    json: { pairingKey, device: { name: `ESP Scanner ${ts}`, type: 'esp-scanner' } },
    expectedStatus: [200],
  })
  const bearerToken = paired.data?.token
  const pairedDeviceId = paired.data?.device?.id
  assert.ok(bearerToken, 'device bearer token missing')
  assert.ok(pairedDeviceId, 'paired device id missing')
  assert.equal(paired.data?.defaultLocationId, locationId, 'paired device default location mismatch')

  await request('/api/locations', {
    headers: { Authorization: `Bearer ${bearerToken}` },
    expectedStatus: [200],
  })

  const scannerEvent = await request('/api/scanner/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearerToken}` },
    json: { barcode: productBarcode, mode: 'lookup' },
    expectedStatus: [200],
  })
  assert.ok(scannerEvent.data?.event?.id, 'scanner event id missing')
  assert.equal(scannerEvent.data?.event?.productId, productId, 'scanner event product mismatch')

  const pendingScannerEvents = await request('/api/scanner/events?status=pending', {
    jar: inviterJar,
    expectedStatus: [200],
  })
  assert.ok(
    pendingScannerEvents.data?.events?.some((event) => event.id === scannerEvent.data.event.id),
    'pending scanner event missing'
  )

  const rotated = await request(`/api/devices/${pairedDeviceId}/rotate-token`, {
    method: 'POST',
    jar: inviterJar,
    expectedStatus: [200],
  })
  const rotatedBearerToken = rotated.data?.token
  assert.ok(rotatedBearerToken, 'rotated device bearer token missing')
  assert.notEqual(rotatedBearerToken, bearerToken, 'rotated bearer token should differ from original token')

  await request('/api/locations', {
    headers: { Authorization: `Bearer ${bearerToken}` },
    expectedStatus: [401],
  })

  await request('/api/locations', {
    headers: { Authorization: `Bearer ${rotatedBearerToken}` },
    expectedStatus: [200],
  })

  await request(`/api/profile?email=${encodeURIComponent(inviterEmail)}`, {
    headers: { Authorization: `Bearer ${rotatedBearerToken}` },
    expectedStatus: [403],
  })

  step('Recipes flow (available + generate)')
  const available = await request('/api/recipes/available', { jar: inviterJar, expectedStatus: [200] })
  assert.ok(Array.isArray(available.data), 'recipes available must be an array')

  const generated = await request('/api/recipes/generate', {
    method: 'POST',
    jar: inviterJar,
    json: { userInput: 'schnell und einfach' },
    expectedStatus: [200, 503],
  })
  if (generated.response.status === 200) {
    assert.ok(typeof generated.data?.recipe === 'string' && generated.data.recipe.length > 0, 'recipe text missing')
  } else {
    assert.ok(
      typeof generated.data?.recipe === 'string' && generated.data.recipe.length > 0,
      'fallback recipe message missing'
    )
  }

  step('Invite + Register + Activate + Login flow')
  await request('/api/auth/invite', {
    method: 'POST',
    jar: inviterJar,
    json: { email: invitedEmail },
    base: backendBaseUrl,
    expectedStatus: [200],
  })

  const inviteToken = await prisma.verificationToken.findFirst({
    where: {
      email: invitedEmail,
      type: { startsWith: 'invite:' },
    },
    orderBy: { createdAt: 'desc' },
  })
  assert.ok(inviteToken?.token, 'invite token missing')

  await request('/api/auth/register', {
    method: 'POST',
    json: {
      email: invitedEmail,
      password: invitedPassword,
      name: 'Smoke Invited',
      inviteToken: inviteToken.token,
    },
    base: backendBaseUrl,
    expectedStatus: [200],
  })

  const activationToken = await prisma.verificationToken.findFirst({
    where: {
      email: invitedEmail,
      type: 'activation',
    },
    orderBy: { createdAt: 'desc' },
  })
  assert.ok(activationToken?.token, 'activation token missing')

  await request(`/api/auth/activate?token=${encodeURIComponent(activationToken.token)}`, {
    base: backendBaseUrl,
    expectedStatus: [302],
  })

  const invitedJar = await loginWithCredentials(invitedEmail, invitedPassword)
  const invitedSession = await request('/api/auth/session', {
    jar: invitedJar,
    base: authBaseUrl,
    prefixApi: false,
    expectedStatus: [200],
  })
  assert.equal(
    invitedSession.data?.user?.email?.toLowerCase(),
    invitedEmail.toLowerCase(),
    'invited user login failed after activation'
  )

  const invitedUser = await prisma.user.findUnique({ where: { email: invitedEmail } })
  assert.equal(invitedUser?.householdId, household.id, 'invited user household mismatch')
  assert.equal(Boolean(invitedUser?.isActive), true, 'invited user should be active')

  console.log('\n[smoke] SUCCESS: all target flows passed')
}

main()
  .catch((err) => {
    console.error('\n[smoke] FAILED:', err?.message || err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined)
  })
