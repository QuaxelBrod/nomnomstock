import type { Express } from 'express'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

import { prisma } from '../../lib/prisma'
import { ensurePasswordColumn, ensureVerificationTokenTable } from '../../lib/dbFixes'
import { renderTemplate, sendMail } from '../../lib/mail'
import { apiRoute } from '../apiContract'
import {
  authBaseFromEnv,
  createHouseholdForUser,
  getEmailTemplate,
  normalizeEmail,
  requireAuth,
  resolveAuthUrl,
  type AuthUser,
} from '../serverUtils'

export function registerAuthRoutes(app: Express) {
  app.post(apiRoute('/api/auth/credentials'), async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const password = String(req.body?.password || '')

      if (!email || !password) return res.status(400).json({ ok: false, error: 'missing' })

      await ensurePasswordColumn()

      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) return res.status(401).json({ ok: false, error: 'invalid_credentials' })
      if (!(user as any).isActive) return res.status(401).json({ ok: false, error: 'inactive' })

      const hash = (user as any).password
      if (!hash) return res.status(401).json({ ok: false, error: 'invalid_credentials' })

      const valid = await bcrypt.compare(password, hash)
      if (!valid) return res.status(401).json({ ok: false, error: 'invalid_credentials' })

      const authUser: AuthUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        householdId: user.householdId,
      }

      return res.json({ ok: true, user: authUser })
    } catch (err) {
      console.error('POST /api/auth/credentials error', err)
      return res.status(500).json({ ok: false, error: 'server_error' })
    }
  })

  app.post(apiRoute('/api/auth/register'), async (req, res) => {
    try {
      const authUrl = resolveAuthUrl()

      await ensurePasswordColumn()
      await ensureVerificationTokenTable()

      const normalizedEmail = normalizeEmail(req.body?.email)
      const normalizedName = req.body?.name ? String(req.body.name).trim() : null
      const password = String(req.body?.password || '')
      const inviteToken = req.body?.inviteToken ? String(req.body.inviteToken) : null
      const emailAuthEnabled = process.env.EMAIL_AUTH_ENABLED !== 'false'
      const superadmin = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase()

      if (!normalizedEmail || !password) return res.status(400).json({ error: 'missing' })

      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
      const passwordHash = await bcrypt.hash(password, 10)

      if (existing && (existing as any).isActive) {
        return res.status(400).json({ error: 'exists' })
      }

      if (existing && !(existing as any).isActive) {
        await prisma.user.update({
          where: { email: normalizedEmail },
          data: { name: normalizedName, password: passwordHash } as any,
        })
      } else {
        await prisma.user.create({
          data: { email: normalizedEmail, name: normalizedName, password: passwordHash } as any,
        })
      }

      await prisma.verificationToken.deleteMany({
        where: { email: normalizedEmail, type: { in: ['approval', 'activation'] } as any } as any,
      })

      let skipSuper = false
      let invitedHouseholdId: number | null = null

      if (inviteToken) {
        const invite = await prisma.verificationToken.findUnique({ where: { token: inviteToken } as any })
        const isInviteType = !!invite && (invite.type === 'invite' || invite.type.startsWith('invite:'))

        if (invite && isInviteType && (!invite.expiresAt || invite.expiresAt > new Date())) {
          if (invite.email && invite.email.toLowerCase() !== normalizedEmail) {
            return res.status(400).json({
              error: 'invite_email_mismatch',
              expectedEmail: invite.email,
              message: `Diese Einladung ist fuer ${invite.email}. Bitte registriere dich mit dieser E-Mail-Adresse.`,
            })
          }

          if (invite.type.startsWith('invite:')) {
            const hh = Number(invite.type.split(':')[1] || '')
            if (Number.isFinite(hh) && hh > 0) invitedHouseholdId = hh
          }

          skipSuper = true
          await prisma.verificationToken.delete({ where: { token: inviteToken } as any })
        }
      }

      if (skipSuper && invitedHouseholdId) {
        await prisma.user.update({
          where: { email: normalizedEmail },
          data: { householdId: invitedHouseholdId } as any,
        })
      } else {
        const userAfterUpsert = await prisma.user.findUnique({ where: { email: normalizedEmail } })
        if (!userAfterUpsert?.householdId) {
          const householdId = await createHouseholdForUser(normalizedEmail, normalizedName)
          await prisma.user.update({ where: { email: normalizedEmail }, data: { householdId } as any })
        }
      }

      if (!emailAuthEnabled || skipSuper) {
        const token = randomBytes(20).toString('hex')
        await prisma.verificationToken.create({
          data: {
            email: normalizedEmail,
            token,
            type: 'activation',
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
          },
        })

        try {
          const tpl = getEmailTemplate('activation.txt')
          const activateUrl = `${authUrl}/api/auth/activate?token=${token}`
          const text = renderTemplate(tpl, {
            name: normalizedName || normalizedEmail,
            activateUrl,
            homeUrl: `${authUrl}/`,
          })
          await sendMail({ to: normalizedEmail, subject: 'Account aktivieren', text })
        } catch (mailErr) {
          console.error('register activation mail error', mailErr)
          return res.status(500).json({ error: 'activation_mail_failed' })
        }

        return res.json({
          ok: true,
          message: 'Die Registrierung wird durchgeführt. Bitte prüfen Sie Ihr E-Mail-Postfach.',
        })
      }

      if (!superadmin) {
        return res.status(500).json({ error: 'superadmin_not_configured' })
      }

      const approvalToken = randomBytes(24).toString('hex')
      await prisma.verificationToken.create({
        data: {
          email: normalizedEmail,
          token: approvalToken,
          type: 'approval',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        },
      })

      try {
        const tpl = getEmailTemplate('approval-request.txt')
        const approveUrl = `${authUrl}/api/auth/approve?token=${approvalToken}`
        const text = renderTemplate(tpl, {
          email: normalizedEmail,
          approveUrl,
          homeUrl: `${authUrl}/`,
        })
        await sendMail({ to: superadmin, subject: 'Registrierungsanfrage', text })
      } catch (mailErr) {
        console.error('register approval mail error', mailErr)
        return res.status(500).json({ error: 'approval_mail_failed' })
      }

      return res.json({
        ok: true,
        message: 'Die Registrierung wird durchgeführt, Sie erhalten in Kürze eine E-Mail.',
      })
    } catch (err) {
      console.error('POST /api/auth/register error', err)
      return res.status(500).json({ error: 'server_error' })
    }
  })

  app.post(apiRoute('/api/auth/password/forgot'), async (req, res) => {
    try {
      const authUrl = resolveAuthUrl()
      await ensurePasswordColumn()
      await ensureVerificationTokenTable()

      const email = normalizeEmail(req.body?.email)
      const genericResponse = {
        ok: true,
        message: 'Falls diese E-Mail registriert ist, wurde ein Link zum Zuruecksetzen des Passworts versendet.',
      }
      if (!email) return res.json(genericResponse)

      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || !(user as any).isActive) return res.json(genericResponse)

      const recentToken = await prisma.verificationToken.findFirst({
        where: {
          email,
          type: 'password-reset',
          createdAt: { gt: new Date(Date.now() - 1000 * 60 * 5) },
        } as any,
        orderBy: { createdAt: 'desc' },
      })
      if (recentToken) return res.json(genericResponse)

      await prisma.verificationToken.deleteMany({
        where: { email, type: 'password-reset' } as any,
      })

      const token = randomBytes(32).toString('hex')
      await prisma.verificationToken.create({
        data: {
          email,
          token,
          type: 'password-reset',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        },
      })

      try {
        const tpl = getEmailTemplate('password-reset.txt')
        const resetUrl = `${authUrl}/auth/reset-password?token=${token}`
        const text = renderTemplate(tpl, {
          name: user.name || user.email,
          resetUrl,
          homeUrl: `${authUrl}/`,
        })
        await sendMail({ to: email, subject: 'Passwort zuruecksetzen', text })
      } catch (mailErr) {
        console.error('password reset mail error', mailErr)
      }

      return res.json(genericResponse)
    } catch (err) {
      console.error('POST /api/auth/password/forgot error', err)
      return res.status(500).json({ error: 'server_error' })
    }
  })

  app.post(apiRoute('/api/auth/password/reset'), async (req, res) => {
    try {
      await ensurePasswordColumn()
      await ensureVerificationTokenTable()

      const token = String(req.body?.token || '').trim()
      const password = String(req.body?.password || '')
      if (!token || password.length < 8) return res.status(400).json({ error: 'invalid_request' })

      const row = await prisma.verificationToken.findUnique({ where: { token } as any })
      if (!row || row.type !== 'password-reset' || (row.expiresAt && row.expiresAt <= new Date())) {
        return res.status(400).json({ error: 'invalid_or_expired_token' })
      }

      const user = await prisma.user.findUnique({ where: { email: row.email } })
      if (!user || !(user as any).isActive) {
        await prisma.verificationToken.delete({ where: { token } as any }).catch(() => null)
        return res.status(400).json({ error: 'invalid_or_expired_token' })
      }

      const passwordHash = await bcrypt.hash(password, 10)
      await prisma.user.update({
        where: { email: row.email },
        data: { password: passwordHash } as any,
      })
      await prisma.verificationToken.delete({ where: { token } as any })

      return res.json({ ok: true })
    } catch (err) {
      console.error('POST /api/auth/password/reset error', err)
      return res.status(500).json({ error: 'server_error' })
    }
  })

  app.post(apiRoute('/api/auth/invite'), async (req, res) => {
    try {
      const authUrl = resolveAuthUrl()
      await ensureVerificationTokenTable()

      const auth = await requireAuth(req, res)
      if (!auth) return

      if (!auth.email) return res.status(401).json({ error: 'unauthorized' })

      const inviterUser = await prisma.user.findUnique({ where: { email: auth.email.toLowerCase() } })
      if (!inviterUser) return res.status(404).json({ error: 'inviter_not_found' })
      if (!(inviterUser as any).householdId) return res.status(400).json({ error: 'no_household' })

      const inviteEmail = normalizeEmail(req.body?.email)
      if (!inviteEmail) return res.status(400).json({ error: 'missing' })

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

      try {
        const tpl = getEmailTemplate('invite.txt')
        const registerUrl = `${authUrl}/auth/register?invite=${token}`
        const text = renderTemplate(tpl, {
          inviter: inviterLabel,
          registerUrl,
          inviteEmail,
          homeUrl: `${authUrl}/`,
        })
        await sendMail({ to: inviteEmail, subject: 'Einladung zum Vorratsschrank', text })
      } catch (mailErr) {
        console.error('invite mail error', mailErr)
        return res.status(500).json({ error: 'invite_mail_failed' })
      }

      return res.json({ ok: true })
    } catch (err) {
      console.error('POST /api/auth/invite error', err)
      return res.status(500).json({ error: 'server_error' })
    }
  })

  app.get(apiRoute('/api/auth/activate'), async (req, res) => {
    try {
      await ensureVerificationTokenTable()
      const token = String(req.query.token || '')

      if (!token) {
        return res.redirect(`${authBaseFromEnv()}/auth/activated?status=error&reason=missing`)
      }

      const row = await prisma.verificationToken.findUnique({ where: { token } as any })
      if (!row || row.type !== 'activation') {
        return res.redirect(`${authBaseFromEnv()}/auth/activated?status=error&reason=invalid`)
      }

      await prisma.user.update({ where: { email: row.email }, data: { isActive: true } as any })
      await prisma.verificationToken.delete({ where: { token } as any })
      return res.redirect(`${authBaseFromEnv()}/auth/activated?status=success`)
    } catch (err) {
      console.error('GET /api/auth/activate error', err)
      return res.redirect(`${authBaseFromEnv()}/auth/activated?status=error&reason=server`)
    }
  })

  app.get(apiRoute('/api/auth/approve'), async (req, res) => {
    try {
      const authUrl = resolveAuthUrl()
      await ensureVerificationTokenTable()
      const token = String(req.query.token || '')

      if (!token) return res.redirect(`${authBaseFromEnv()}/auth/approval?status=error`)

      const row = await prisma.verificationToken.findUnique({ where: { token } as any })
      if (!row || row.type !== 'approval') {
        return res.redirect(`${authBaseFromEnv()}/auth/approval?status=error`)
      }

      const actToken = randomBytes(20).toString('hex')
      await prisma.verificationToken.create({
        data: {
          email: row.email,
          token: actToken,
          type: 'activation',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      })
      await prisma.verificationToken.delete({ where: { token } as any })

      try {
        const tpl = getEmailTemplate('activation.txt')
        const activateUrl = `${authUrl}/api/auth/activate?token=${actToken}`
        const text = renderTemplate(tpl, { name: row.email, activateUrl, homeUrl: `${authUrl}/` })
        await sendMail({ to: row.email, subject: 'Account aktivieren', text })
      } catch (mailErr) {
        console.error('approve activation mail error', mailErr)
        return res.redirect(`${authBaseFromEnv()}/auth/approval?status=error`)
      }

      return res.redirect(`${authBaseFromEnv()}/auth/approval?status=success`)
    } catch (err) {
      console.error('GET /api/auth/approve error', err)
      return res.redirect(`${authBaseFromEnv()}/auth/approval?status=error`)
    }
  })
}
