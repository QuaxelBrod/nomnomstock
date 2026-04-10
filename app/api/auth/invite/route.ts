import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { renderTemplate, sendMail } from '../../../../lib/mail'

const AUTH_URL = (process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, inviter } = body
    if (!email) return NextResponse.json({ error: 'missing' }, { status: 400 })

    const token = randomBytes(20).toString('hex')
    await prisma.verificationToken.create({ data: { email, token, type: 'invite', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) } })

    // send invite email
    try {
      const tpl = readFileSync(path.join(process.cwd(), 'emails', 'invite.txt'), 'utf8')
      const registerUrl = `${AUTH_URL}/auth/register?invite=${token}`
      const activateUrl = `${AUTH_URL}/api/auth/activate?token=${token}`
      const text = renderTemplate(tpl, { inviter: inviter || 'Einladung', registerUrl, activateUrl })
      await sendMail({ to: email, subject: 'Du wurdest eingeladen', text })
    } catch (e) { console.error(e) }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
