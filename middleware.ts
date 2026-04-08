import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/api/auth',
  '/api/auth/',
  '/api/profile',
  '/api/debug',
  '/api/recipes',
  '/favicon.ico',
  '/health',
  '/healthz',
  '/api/health',
].reduce((acc, p) => acc.concat(p, `${base}${p}`), [] as string[])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow Next internals, static files and public auth routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/fonts') ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) {
    const loginUrl = new URL('/auth/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
