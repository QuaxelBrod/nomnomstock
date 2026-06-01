import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

function resolveBasePath() {
  const explicit = process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || ''
  if (explicit) return explicit.startsWith('/') ? explicit.replace(/\/$/, '') : `/${explicit.replace(/\/$/, '')}`
  try {
    const raw = process.env.NEXTAUTH_URL || process.env.APP_URL || ''
    if (!raw) return ''
    const p = new URL(raw).pathname
    return p && p !== '/' ? p.replace(/\/$/, '') : ''
  } catch {
    return ''
  }
}

const base = resolveBasePath()
const PUBLIC_EXACT_PATHS_BASELESS = ['/api/devices/pair', '/api/v1/devices/pair']
// list of public paths WITHOUT base prefix — we'll compare against a normalized pathname
const PUBLIC_PATHS_BASELESS = [
  '/auth/login',
  '/auth/register',
  '/auth/activated',
  '/auth/approval',
  '/api/auth',
  '/api/auth/',
  '/api/profile',
  '/api/debug',
  '/api/recipes',
  '/manifest.webmanifest',
  '/sw.js',
  '/icons',
  '/uploads',
  '/favicon.ico',
  '/health',
  '/healthz',
  '/api/health',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Normalize pathname by removing base prefix (if present) for matching
  let normPath = pathname
  if (base && pathname.startsWith(base)) {
    normPath = pathname.slice(base.length) || '/'
  }

  // Allow Next internals, static files and public auth routes
  if (
    normPath.startsWith('/_next') ||
    normPath.startsWith('/static') ||
    normPath.startsWith('/fonts') ||
    PUBLIC_EXACT_PATHS_BASELESS.includes(normPath) ||
    PUBLIC_PATHS_BASELESS.some((p) => normPath === p || normPath.startsWith(p))
  ) {
    return NextResponse.next()
  }

  const authHeader = req.headers.get('authorization') || ''
  if (normPath.startsWith('/api/') && /^Bearer\s+/i.test(authHeader)) {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) {
    const loginPath = `${base}/auth/login`
    const loginUrl = new URL(loginPath, req.url)
    const forwardedProto = req.headers.get('x-forwarded-proto')
    const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
    const callbackOrigin = forwardedHost
      ? `${forwardedProto || 'https'}://${forwardedHost}`
      : (process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : req.nextUrl.origin)
    const callbackPath = base
      ? `${base}${normPath === '/' ? '/' : normPath}`.replace(/\/\/+/, '/')
      : normPath
    const callbackUrl = `${callbackOrigin}${callbackPath}${req.nextUrl.search}`
    loginUrl.searchParams.set('callbackUrl', callbackUrl)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
