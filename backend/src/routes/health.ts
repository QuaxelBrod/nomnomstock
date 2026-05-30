import type { Express } from 'express'

import { apiRoute, openApiDocument } from '../apiContract'

export function registerHealthRoutes(app: Express) {
  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.get('/healthz', (_req, res) => res.json({ ok: true }))
  app.get(apiRoute('/api/health'), (_req, res) => res.json({ ok: true }))
  app.get(apiRoute('/api/openapi.json'), (_req, res) => res.json(openApiDocument))
}
