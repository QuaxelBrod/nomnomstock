import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password } = body
    if (!email || !password) return NextResponse.json({ ok: false, error: 'missing' }, { status: 400 })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (!(user as any).isActive) return NextResponse.json({ ok: false, error: 'inactive' }, { status: 403 })
    const hash = (user as any).password
    if (!hash) return NextResponse.json({ ok: false, error: 'no_password' }, { status: 403 })
    const ok = await bcrypt.compare(password, hash)
    return NextResponse.json({ ok, user: { id: user.id, email: user.email, name: user.name } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
