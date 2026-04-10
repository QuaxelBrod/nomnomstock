import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
// list of public paths WITHOUT base prefix — we'll compare against a normalized pathname
const PUBLIC_PATHS_BASELESS = [
  '/auth/login',
  '/auth/register',
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
    PUBLIC_PATHS_BASELESS.some((p) => normPath === p || normPath.startsWith(p))
  ) {
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
    const callbackUrl = `${callbackOrigin}${req.nextUrl.pathname}${req.nextUrl.search}`
    loginUrl.searchParams.set('callbackUrl', callbackUrl)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
