import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { sendMail, renderTemplate } from '../../../../lib/mail'
import bcrypt from 'bcryptjs'

const AUTH_URL = (process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')

export async function POST(req: Request) {
  try {
    // Best effort migration safety for older SQLite files.
    try { await (await import('../../../../lib/dbFixes')).ensurePasswordColumn() } catch {}

    const body = await req.json()
    const { email, name, password, inviteToken } = body
    if (!email || !password) return NextResponse.json({ error: 'missing' }, { status: 400 })

    // check existing
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'exists' }, { status: 400 })

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { email, name: name || null, password: passwordHash } as any })

    // if invite token provided and valid, create activation token and send directly
    let skipSuper = false
    if (inviteToken) {
      const inv = await prisma.verificationToken.findUnique({ where: { token: inviteToken } as any })
      if (inv && inv.type === 'invite' && (!inv.expiresAt || inv.expiresAt > new Date())) {
        skipSuper = true
        // delete invite
        await prisma.verificationToken.delete({ where: { token: inviteToken } as any })
      }
    }

    // if skipSuper or EMAIL_AUTH_ENABLED=false, send activation to user
    if (!process.env.EMAIL_AUTH_ENABLED || process.env.EMAIL_AUTH_ENABLED === 'false' || skipSuper) {
      const token = randomBytes(20).toString('hex')
      await prisma.verificationToken.create({ data: { email, token, type: 'activation', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) } })
      // send activation email
      try {
        const tpl = readFileSync(path.join(process.cwd(), 'emails', 'activation.txt'), 'utf8')
        const activateUrl = `${AUTH_URL}/api/auth/activate?token=${token}`
        const text = renderTemplate(tpl, { name: name || email, activateUrl })
        await sendMail({ to: email, subject: 'Account aktivieren', text })
      } catch (e) { console.error(e) }
      return NextResponse.json({ ok: true })
    }

    // otherwise send approval request to superadmin
    const approvalToken = randomBytes(24).toString('hex')
    await prisma.verificationToken.create({ data: { email, token: approvalToken, type: 'approval', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) } })
    try {
      const tpl = readFileSync(path.join(process.cwd(), 'emails', 'approval-request.txt'), 'utf8')
      const approveUrl = `${AUTH_URL}/api/auth/approve?token=${approvalToken}`
      const superadmin = process.env.SUPER_ADMIN_EMAIL
      const text = renderTemplate(tpl, { email, approveUrl })
      if (superadmin) await sendMail({ to: superadmin, subject: 'Registrierungsanfrage', text })
    } catch (e) { console.error(e) }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

