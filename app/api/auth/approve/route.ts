import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { readFileSync } from 'fs'
import path from 'path'
import { renderTemplate, sendMail } from '../../../../lib/mail'

const APP_URL = process.env.APP_URL || 'http://localhost:3000'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'missing' }, { status: 400 })
    const row = await prisma.verificationToken.findUnique({ where: { token } as any })
    if (!row || row.type !== 'approval') return NextResponse.json({ error: 'invalid' }, { status: 400 })

    // create activation token for user
    const actToken = require('crypto').randomBytes(20).toString('hex')
    await prisma.verificationToken.create({ data: { email: row.email, token: actToken, type: 'activation', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) } })
    // delete approval token
    await prisma.verificationToken.delete({ where: { token } as any })

    // send activation email to user
    try {
      const tpl = readFileSync(path.join(process.cwd(), 'emails', 'activation.txt'), 'utf8')
      const activateUrl = `${APP_URL}/api/auth/activate?token=${actToken}`
      const text = renderTemplate(tpl, { name: row.email, activateUrl })
      await sendMail({ to: row.email, subject: 'Account aktivieren', text })
    } catch (e) { console.error(e) }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
