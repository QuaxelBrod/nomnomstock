import type { Express } from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'

import { prisma } from '../../lib/prisma'
import { ensureImageColumn } from '../../lib/dbFixes'
import { apiRoute } from '../apiContract'
import { isAdmin, normalizeEmail, requireAuth, resolveUploadsDir, type RequestWithFile } from '../serverUtils'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

export function registerProfileRoutes(app: Express) {
  app.get(apiRoute('/api/profile'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const email = normalizeEmail(req.query.email)
      if (!email) return res.status(400).json({ error: 'missing email' })

      if (!isAdmin(auth) && auth.email && auth.email.toLowerCase() !== email) {
        return res.status(403).json({ error: 'forbidden' })
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true } as any,
      })
      if (!user) return res.json(null)

      try {
        const rows = await prisma.$queryRaw`SELECT image FROM "User" WHERE email = ${email}`
        if (Array.isArray(rows) && rows[0] && (rows[0] as any).image) {
          ;(user as any).image = (rows[0] as any).image
        }
      } catch {
        // optional column may not exist
      }

      return res.json(user)
    } catch (err) {
      console.error('GET /api/profile error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/profile'), upload.single('image'), async (req: RequestWithFile, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const email = normalizeEmail(req.body?.email)
      const name = req.body?.name ? String(req.body.name) : ''
      if (!email) return res.status(400).json({ error: 'missing email' })

      if (!isAdmin(auth) && auth.email && auth.email.toLowerCase() !== email) {
        return res.status(403).json({ error: 'forbidden' })
      }

      await ensureImageColumn()

      let imagePath: string | null = null
      if (req.file && req.file.buffer) {
        const uploadsDir = resolveUploadsDir()
        const ext = path.extname(req.file.originalname || '') || '.jpg'
        const filename = `profile-${Date.now()}${Math.random().toString(36).slice(2, 8)}${ext}`
        const filepath = path.join(uploadsDir, filename)
        fs.writeFileSync(filepath, req.file.buffer)
        imagePath = `/uploads/${filename}`
      }

      if (name) {
        await prisma.user.update({ where: { email }, data: { name } as any })
      }

      if (imagePath) {
        await prisma.$executeRaw`UPDATE "User" SET image = ${imagePath} WHERE email = ${email}`
      }

      return res.json({ ok: true, image: imagePath || null })
    } catch (err) {
      console.error('POST /api/profile error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })
}
