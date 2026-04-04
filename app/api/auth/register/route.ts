import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, name } = body
    if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 })

    // Ensure DB has password column (in case migrations weren't applied)
    // lazy-fix for local dev
    try { await (await import('../../../../lib/dbFixes')).ensurePasswordColumn() } catch {}

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'user exists' }, { status: 400 })

    // create household for this user
    const household = await prisma.household.create({ data: { name: `Household of ${email}` } })
    const hash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { email, name, role: 'ADMIN', householdId: household.id, password: hash } as any })

    return NextResponse.json({ ok: true, userId: user.id })
  } catch (err: any) {
    console.error('register error', err)
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
