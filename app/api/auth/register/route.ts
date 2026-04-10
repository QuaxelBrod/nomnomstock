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
    console.log('[auth/register] request received')
    // Best effort migration safety for older SQLite files.
    const dbFixes = await import('../../../../lib/dbFixes')
    try { await dbFixes.ensurePasswordColumn() } catch {}
    await dbFixes.ensureVerificationTokenTable()

    const body = await req.json()
    const { email, name, password, inviteToken } = body
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedName = name ? String(name).trim() : null
    const emailAuthEnabled = process.env.EMAIL_AUTH_ENABLED !== 'false'
    const superadmin = (process.env.SUPER_ADMIN_EMAIL || '').trim()

    if (!normalizedEmail || !password) {
      console.warn('[auth/register] missing email or password')
      return NextResponse.json({ error: 'missing' }, { status: 400 })
    }

    // check existing
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    const passwordHash = await bcrypt.hash(password, 10)

    if (existing && (existing as any).isActive) {
      console.warn('[auth/register] active user already exists', { email: normalizedEmail })
      return NextResponse.json({ error: 'exists' }, { status: 400 })
    }

    if (existing && !(existing as any).isActive) {
      console.log('[auth/register] inactive user exists, updating credentials and retrying flow', { email: normalizedEmail })
      await prisma.user.update({
        where: { email: normalizedEmail },
        data: { name: normalizedName, password: passwordHash } as any,
      })
    } else {
      console.log('[auth/register] creating new user', { email: normalizedEmail })
      await prisma.user.create({ data: { email: normalizedEmail, name: normalizedName, password: passwordHash } as any })
    }

    // Remove stale approval/activation tokens so only latest links remain valid.
    await prisma.verificationToken.deleteMany({
      where: { email: normalizedEmail, type: { in: ['approval', 'activation'] } as any } as any,
    })

    // if invite token provided and valid, create activation token and send directly
    let skipSuper = false
    let invitedHouseholdId: number | null = null
    if (inviteToken) {
      const inv = await prisma.verificationToken.findUnique({ where: { token: inviteToken } as any })
      const isInviteType = !!inv && (inv.type === 'invite' || inv.type.startsWith('invite:'))
      if (inv && isInviteType && (!inv.expiresAt || inv.expiresAt > new Date())) {
        if (inv.type.startsWith('invite:')) {
          const hh = Number(inv.type.split(':')[1] || '')
          if (Number.isFinite(hh) && hh > 0) invitedHouseholdId = hh
        }

        if (inv.email && inv.email.toLowerCase() !== normalizedEmail) {
          console.warn('[auth/register] invite token email mismatch', {
            tokenEmail: inv.email,
            requestEmail: normalizedEmail,
          })
          return NextResponse.json({ error: 'invite_email_mismatch' }, { status: 400 })
        }

        console.log('[auth/register] valid invite token found, skipping superadmin approval', { email: normalizedEmail })
        skipSuper = true
        // delete invite
        await prisma.verificationToken.delete({ where: { token: inviteToken } as any })
      } else {
        console.warn('[auth/register] invite token invalid or expired', { email: normalizedEmail })
      }
    }

    // if skipSuper or EMAIL_AUTH_ENABLED=false, send activation to user
    if (skipSuper && invitedHouseholdId) {
      await prisma.user.update({
        where: { email: normalizedEmail },
        data: { householdId: invitedHouseholdId } as any,
      })
      console.log('[auth/register] invited user assigned to household', {
        email: normalizedEmail,
        householdId: invitedHouseholdId,
      })
    }

    if (!emailAuthEnabled || skipSuper) {
      const token = randomBytes(20).toString('hex')
      await prisma.verificationToken.create({ data: { email: normalizedEmail, token, type: 'activation', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) } })
      // send activation email
      try {
        const tpl = readFileSync(path.join(process.cwd(), 'emails', 'activation.txt'), 'utf8')
        const activateUrl = `${AUTH_URL}/api/auth/activate?token=${token}`
        const text = renderTemplate(tpl, { name: normalizedName || normalizedEmail, activateUrl })
        console.log('[auth/register] sending activation email', { to: normalizedEmail, activateUrl })
        await sendMail({ to: normalizedEmail, subject: 'Account aktivieren', text })
      } catch (e) {
        console.error('[auth/register] activation email failed', e)
        return NextResponse.json({ error: 'activation_mail_failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, message: 'Die Registrierung wird durchgeführt. Bitte prüfen Sie Ihr E-Mail-Postfach.' })
    }

    // otherwise send approval request to superadmin
    if (!superadmin) {
      console.error('[auth/register] SUPER_ADMIN_EMAIL missing while approval flow is required')
      return NextResponse.json({ error: 'superadmin_not_configured' }, { status: 500 })
    }

    const approvalToken = randomBytes(24).toString('hex')
    await prisma.verificationToken.create({ data: { email: normalizedEmail, token: approvalToken, type: 'approval', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) } })
    try {
      const tpl = readFileSync(path.join(process.cwd(), 'emails', 'approval-request.txt'), 'utf8')
      const approveUrl = `${AUTH_URL}/api/auth/approve?token=${approvalToken}`
      const text = renderTemplate(tpl, { email: normalizedEmail, approveUrl })
      console.log('[auth/register] sending approval request', { to: superadmin, approveUrl, email: normalizedEmail })
      await sendMail({ to: superadmin, subject: 'Registrierungsanfrage', text })
    } catch (e) {
      console.error('[auth/register] approval email failed', e)
      return NextResponse.json({ error: 'approval_mail_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Die Registrierung wird durchgeführt, Sie erhalten in Kürze eine E-Mail.' })
  } catch (err: any) {
    console.error('[auth/register] fatal error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

