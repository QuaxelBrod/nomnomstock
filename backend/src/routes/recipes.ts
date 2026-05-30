import type { Express } from 'express'
import fs from 'fs'

import { prisma } from '../../lib/prisma'
import { renderTemplate, sendMail } from '../../lib/mail'
import { apiRoute } from '../apiContract'
import { buildHouseholdScope, callOllama, isTruthy, requireAuth, resolvePromptTemplatePath } from '../serverUtils'

export function registerRecipeRoutes(app: Express) {
  app.get(apiRoute('/api/recipes/available'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const stocks = await prisma.stock.findMany({
        where: {
          quantity: { gt: 0 },
          ...buildHouseholdScope(auth.householdId),
        },
        include: { product: true },
      })
      const items = stocks.map((s: any) => ({ id: s.id, name: s.product.name, quantity: s.quantity, unit: s.unit }))
      return res.json(items)
    } catch (err) {
      console.error('GET /api/recipes/available error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/recipes/generate'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const userInput = String(req.body?.userInput || '').trim()
      const stocks = await prisma.stock.findMany({
        where: {
          quantity: { gt: 0 },
          ...buildHouseholdScope(auth.householdId),
        },
        include: { product: true },
      })
      const ingredientNames = stocks.map(
        (s: any) => `${s.product.name}${s.quantity ? ` (${s.quantity}${s.unit ? ` ${s.unit}` : ''})` : ''}`
      )

      const templatePath = resolvePromptTemplatePath()
      const template = templatePath
        ? fs.readFileSync(templatePath, 'utf8')
        : 'Verfügbare Zutaten:\n{{ingredients}}\n\nBenutzerwunsch:\n{{user_input}}\n\nErstelle ein Rezept.'

      const prompt = renderTemplate(template, {
        ingredients: ingredientNames.join('\n'),
        user_input: userInput || 'keine speziellen Wünsche',
      })

      const ollamaEnabledRaw = process.env.OLLAMA_ENABLED
      const enabled = typeof ollamaEnabledRaw === 'undefined' ? true : isTruthy(ollamaEnabledRaw)
      if (!enabled || !process.env.OLLAMA_URL) {
        return res.status(503).json({ recipe: 'Chat nicht verfügbar' })
      }

      try {
        const recipe = await callOllama(prompt)
        return res.json({ recipe })
      } catch (err) {
        console.error('POST /api/recipes/generate ollama error', err)
        return res.status(503).json({ recipe: 'Chat nicht verfügbar' })
      }
    } catch (err) {
      console.error('POST /api/recipes/generate error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })

  app.post(apiRoute('/api/recipes/email'), async (req, res) => {
    try {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const recipe = String(req.body?.recipe || '').trim()
      const subject = req.body?.subject ? String(req.body.subject) : 'Dein Rezept von nomnomstock'
      if (!recipe) return res.status(400).json({ error: 'missing recipe' })

      let recipient = auth.email
      if (!recipient && auth.userId) {
        const user = await prisma.user.findUnique({ where: { id: auth.userId } })
        recipient = user?.email || null
      }
      if (!recipient) return res.status(400).json({ error: 'no email available' })

      const text = recipe
      const html = `<pre style="white-space:pre-wrap">${recipe.replace(/</g, '&lt;')}</pre>`
      await sendMail({ to: recipient, subject, text, html })
      return res.json({ ok: true })
    } catch (err) {
      console.error('POST /api/recipes/email error', err)
      return res.status(500).json({ error: 'server error' })
    }
  })
}
