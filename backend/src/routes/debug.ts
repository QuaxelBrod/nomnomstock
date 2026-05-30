import type { Express } from 'express'
import bcrypt from 'bcryptjs'

import { prisma } from '../../lib/prisma'
import { apiRoute } from '../apiContract'
import { normalizeEmail } from '../serverUtils'

export function registerDebugRoutes(app: Express) {
  app.post(apiRoute('/api/debug/login'), async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const password = String(req.body?.password || '')
      if (!email || !password) return res.status(400).json({ ok: false, error: 'missing' })

      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) return res.status(404).json({ ok: false, error: 'not_found' })
      if (!(user as any).isActive) return res.status(403).json({ ok: false, error: 'inactive' })

      const hash = (user as any).password
      if (!hash) return res.status(403).json({ ok: false, error: 'no_password' })

      const ok = await bcrypt.compare(password, hash)
      return res.json({ ok, user: { id: user.id, email: user.email, name: user.name } })
    } catch (err) {
      console.error('POST /api/debug/login error', err)
      return res.status(500).json({ ok: false, error: 'server_error' })
    }
  })
}
