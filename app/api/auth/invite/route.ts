import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { renderTemplate, sendMail } from '../../../../lib/mail'
import { getToken } from 'next-auth/jwt'

const AUTH_URL = (process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')

export async function POST(req: NextRequest) {
  try {
    console.log('[auth/invite] request received')
    await (await import('../../../../lib/dbFixes')).ensureVerificationTokenTable()
    const auth = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!auth?.email) {
      console.warn('[auth/invite] unauthorized request')
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const inviterEmail = String(auth.email).toLowerCase()
    const inviterUser = await prisma.user.findUnique({ where: { email: inviterEmail } })
    if (!inviterUser) {
      console.warn('[auth/invite] inviter user not found', { inviterEmail })
      return NextResponse.json({ error: 'inviter_not_found' }, { status: 404 })
    }
    if (!(inviterUser as any).householdId) {
      console.warn('[auth/invite] inviter has no household', { inviterEmail })
      return NextResponse.json({ error: 'no_household' }, { status: 400 })
    }

    const body = await req.json()
    const { email } = body
    const inviteEmail = String(email || '').trim().toLowerCase()
    if (!inviteEmail) return NextResponse.json({ error: 'missing' }, { status: 400 })

    const inviterLabel = `${inviterUser.name || 'User'} <${inviterUser.email}>`

    const token = randomBytes(20).toString('hex')
    const tokenType = `invite:${(inviterUser as any).householdId}`
    await prisma.verificationToken.create({
      data: {
        email: inviteEmail,
        token,
        type: tokenType,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    })

    // send invite email
    try {
      const tpl = readFileSync(path.join(process.cwd(), 'emails', 'invite.txt'), 'utf8')
      const registerUrl = `${AUTH_URL}/auth/register?invite=${token}`
      const text = renderTemplate(tpl, { inviter: inviterLabel, registerUrl, inviteEmail })
      console.log('[auth/invite] sending invite email', { to: inviteEmail, inviterEmail, registerUrl })
      await sendMail({ to: inviteEmail, subject: 'Einladung zum Vorratsschrank', text })
    } catch (e) {
      console.error('[auth/invite] invite email failed', e)
      return NextResponse.json({ error: 'invite_mail_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[auth/invite] fatal error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
