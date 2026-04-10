import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { readFileSync } from 'fs'
import path from 'path'
import { renderTemplate, sendMail } from '../../../../lib/mail'

const AUTH_URL = (process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')

export async function GET(req: Request) {
  try {
    console.log('[auth/approve] request received')
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) {
      console.warn('[auth/approve] missing token')
      return NextResponse.json({ error: 'missing' }, { status: 400 })
    }
    const row = await prisma.verificationToken.findUnique({ where: { token } as any })
    if (!row || row.type !== 'approval') {
      console.warn('[auth/approve] invalid token')
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    // create activation token for user
    const actToken = require('crypto').randomBytes(20).toString('hex')
    await prisma.verificationToken.create({ data: { email: row.email, token: actToken, type: 'activation', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) } })
    // delete approval token
    await prisma.verificationToken.delete({ where: { token } as any })

    // send activation email to user
    try {
      const tpl = readFileSync(path.join(process.cwd(), 'emails', 'activation.txt'), 'utf8')
      const activateUrl = `${AUTH_URL}/api/auth/activate?token=${actToken}`
      const text = renderTemplate(tpl, { name: row.email, activateUrl })
      console.log('[auth/approve] sending activation email', { to: row.email, activateUrl })
      await sendMail({ to: row.email, subject: 'Account aktivieren', text })
    } catch (e) {
      console.error('[auth/approve] activation email failed', e)
      return NextResponse.json({ error: 'activation_mail_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[auth/approve] fatal error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
