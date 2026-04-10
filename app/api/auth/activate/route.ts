import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export async function GET(req: Request) {
  try {
    console.log('[auth/activate] request received')
    await (await import('../../../../lib/dbFixes')).ensureVerificationTokenTable()
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) {
      console.warn('[auth/activate] missing token')
      return NextResponse.json({ error: 'missing' }, { status: 400 })
    }
    const row = await prisma.verificationToken.findUnique({ where: { token } as any })
    if (!row || row.type !== 'activation') {
      console.warn('[auth/activate] invalid token')
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    // activate user
    await prisma.user.update({ where: { email: row.email }, data: { isActive: true } as any })
    await prisma.verificationToken.delete({ where: { token } as any })
    console.log('[auth/activate] user activated', { email: row.email })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[auth/activate] fatal error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
