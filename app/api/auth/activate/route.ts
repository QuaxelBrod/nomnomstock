import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

function authBaseFromEnv() {
  try {
    const raw = process.env.NEXTAUTH_URL || ''
    if (!raw) return ''
    const p = new URL(raw).pathname
    return p === '/' ? '' : p.replace(/\/$/, '')
  } catch {
    return ''
  }
}

export async function GET(req: Request) {
  try {
    console.log('[auth/activate] request received')
    await (await import('../../../../lib/dbFixes')).ensureVerificationTokenTable()
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) {
      console.warn('[auth/activate] missing token')
      const target = `${authBaseFromEnv()}/auth/activated?status=error&reason=missing`
      return NextResponse.redirect(new URL(target, req.url))
    }
    const row = await prisma.verificationToken.findUnique({ where: { token } as any })
    if (!row || row.type !== 'activation') {
      console.warn('[auth/activate] invalid token')
      const target = `${authBaseFromEnv()}/auth/activated?status=error&reason=invalid`
      return NextResponse.redirect(new URL(target, req.url))
    }

    // activate user
    await prisma.user.update({ where: { email: row.email }, data: { isActive: true } as any })
    await prisma.verificationToken.delete({ where: { token } as any })
    console.log('[auth/activate] user activated', { email: row.email })
    const target = `${authBaseFromEnv()}/auth/activated?status=success`
    return NextResponse.redirect(new URL(target, req.url))
  } catch (err: any) {
    console.error('[auth/activate] fatal error', err)
    const target = `${authBaseFromEnv()}/auth/activated?status=error&reason=server`
    return NextResponse.redirect(new URL(target, req.url))
  }
}

export const dynamic = 'force-dynamic'
