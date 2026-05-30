import type { Express } from 'express'
import fs from 'fs'
import path from 'path'

import { prisma } from '../../lib/prisma'
import { apiRoute } from '../apiContract'
import { buildHouseholdScope, productLookup, requireAuth, resolveUploadsDir } from '../serverUtils'

export function registerProductRoutes(app: Express) {
  app.post(apiRoute('/api/lookup'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const barcode = String(req.body?.barcode || '').trim()
      if (!barcode) return res.status(400).json({ error: 'barcode required' })

      const product = await productLookup(barcode)
      if (!product) return res.json({ found: false })
      return res.json({ found: true, product })
    } catch (err) {
      console.error('POST /api/lookup error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.get(apiRoute('/api/products'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const q = String(req.query.q || '').trim()
      const products = await prisma.product.findMany({
        where: q
          ? {
              OR: [{ name: { contains: q } }, { barcode: { contains: q } }],
            }
          : undefined,
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return res.json(products)
    } catch (err) {
      console.error('GET /api/products error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/products'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const name = String(req.body?.name || '').trim()
      const brand = req.body?.brand ? String(req.body.brand) : null
      const barcodeRaw = req.body?.barcode ? String(req.body.barcode).trim() : ''
      const image = req.body?.image ? String(req.body.image) : null

      if (!name) return res.status(400).json({ error: 'name required' })

      if (barcodeRaw) {
        const existingByBarcode = await prisma.product.findUnique({ where: { barcode: barcodeRaw } })
        if (existingByBarcode) return res.json(existingByBarcode)
      }

      const existingByName = await prisma.product.findFirst({ where: { name } })
      if (existingByName) {
        const isManual = typeof existingByName.barcode === 'string' && existingByName.barcode.startsWith('manual-')
        if (isManual) {
          const base = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '') || `manual-${Date.now()}`
          let candidate = base
          let suffix = 0
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const exists = await prisma.product.findUnique({ where: { barcode: candidate } })
            if (!exists) {
              const updated = await prisma.product.update({ where: { id: existingByName.id }, data: { barcode: candidate } })
              return res.json(updated)
            }
            suffix += 1
            candidate = `${base}-${suffix}`
          }
        }
        return res.json(existingByName)
      }

      let barcode = barcodeRaw
      if (!barcode) {
        const base = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '') || `manual-${Date.now()}`
        let candidate = base
        let suffix = 0
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const exists = await prisma.product.findUnique({ where: { barcode: candidate } })
          if (!exists) {
            barcode = candidate
            break
          }
          suffix += 1
          candidate = `${base}-${suffix}`
        }
      }

      const product = await prisma.product.create({
        data: {
          name,
          brand: brand || undefined,
          barcode,
          image: image || undefined,
        },
      })
      return res.json(product)
    } catch (err) {
      console.error('POST /api/products error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.get(apiRoute('/api/products/:id'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = Number(req.params.id)
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' })

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          stocks: {
            where: buildHouseholdScope(auth.householdId),
            include: { location: true },
            orderBy: { createdAt: 'desc' },
          },
          histories: {
            where: buildHouseholdScope(auth.householdId),
            orderBy: { createdAt: 'desc' },
            take: 200,
          },
        },
      })

      if (!product) return res.status(404).json({ error: 'not found' })
      return res.json(product)
    } catch (err) {
      console.error('GET /api/products/:id error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/products/:id/image'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ error: 'invalid id' })

      const data = req.body?.data ? String(req.body.data) : ''
      if (!data) return res.status(400).json({ error: 'no data' })

      const parsed = data.match(/^data:(image\/(png|jpe?g));base64,(.+)$/)
      if (!parsed) return res.status(400).json({ error: 'invalid data' })

      const mime = parsed[1]
      const ext = mime.includes('png') ? 'png' : 'jpg'
      const b64 = parsed[3]
      const buffer = Buffer.from(b64, 'base64')

      const uploadsDir = resolveUploadsDir()
      const filename = `product-${id}-${Date.now()}.${ext}`
      const filepath = path.join(uploadsDir, filename)
      fs.writeFileSync(filepath, buffer)

      const imageUrl = `/uploads/${filename}`
      await prisma.product.update({ where: { id }, data: { image: imageUrl } })
      return res.json({ ok: true, url: imageUrl })
    } catch (err) {
      console.error('POST /api/products/:id/image error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.delete(apiRoute('/api/products/:id/image'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const id = Number(req.params.id)
      if (!id) return res.status(400).json({ error: 'invalid id' })

      const product = await prisma.product.findUnique({ where: { id } })
      if (!product) return res.status(404).json({ error: 'not found' })

      if (product.image && product.image.startsWith('/uploads/')) {
        const uploadsDir = resolveUploadsDir()
        const filename = path.basename(product.image)
        const filepath = path.join(uploadsDir, filename)
        if (fs.existsSync(filepath)) {
          try {
            fs.unlinkSync(filepath)
          } catch (err) {
            console.error('delete product image file error', err)
          }
        }
      }

      await prisma.product.update({ where: { id }, data: { image: null } })
      return res.json({ ok: true })
    } catch (err) {
      console.error('DELETE /api/products/:id/image error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })
}
