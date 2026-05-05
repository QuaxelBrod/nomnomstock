import { getToken } from 'next-auth/jwt'
import { prisma } from './prisma'

type AuthContext = {
  token: any
  householdId: number | null
  userId: number | null
  email: string | null
}

function parsePositiveInt(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function buildAuthContext(token: any): Promise<AuthContext> {
  const email = typeof token?.email === 'string' ? token.email : null
  const householdIdFromToken = parsePositiveInt(token?.householdId)
  const userId = parsePositiveInt(token?.sub)

  if (householdIdFromToken) {
    return { token, householdId: householdIdFromToken, userId, email }
  }

  if (!email) {
    return { token, householdId: null, userId, email: null }
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { householdId: true },
  })

  return {
    token,
    householdId: user?.householdId ?? null,
    userId,
    email,
  }
}

function parseCookieHeader(value: string | null) {
  if (!value) return {} as Record<string, string>

  const cookies: Record<string, string> = {}
  for (const part of value.split(';')) {
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

export async function getRequestAuthContext(request: Request) {
  const secret = process.env.NEXTAUTH_SECRET
  const reqForToken = {
    headers: request.headers,
    cookies: parseCookieHeader(request.headers.get('cookie')),
  } as any

  // @ts-ignore
  let token = await getToken({ req: reqForToken, secret })
  if (!token) {
    // @ts-ignore
    token = await getToken({ req: reqForToken, secret, cookieName: 'next-auth.session-token' })
  }
  if (!token) {
    // @ts-ignore
    token = await getToken({ req: reqForToken, secret, cookieName: '__Secure-next-auth.session-token' })
  }
  if (!token) return null
  return buildAuthContext(token)
}
