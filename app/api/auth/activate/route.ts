import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'missing' }, { status: 400 })
    const row = await prisma.verificationToken.findUnique({ where: { token } as any })
    if (!row || row.type !== 'activation') return NextResponse.json({ error: 'invalid' }, { status: 400 })

    // activate user
    await prisma.user.update({ where: { email: row.email }, data: { isActive: true } as any })
    await prisma.verificationToken.delete({ where: { token } as any })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
