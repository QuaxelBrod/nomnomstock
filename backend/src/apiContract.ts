import type { Response } from 'express'

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'server_error'

export function apiRoute(path: string) {
  if (!path.startsWith('/api/')) return path
  return [path, `/api/v1/${path.slice('/api/'.length)}`]
}

export function sendApiError(
  res: Response,
  status: number,
  code: ApiErrorCode | string,
  message: string,
  details?: unknown
) {
  return res.status(status).json({
    error: {
      code,
      message,
      ...(typeof details === 'undefined' ? {} : { details }),
    },
  })
}

export function requiredString(value: unknown) {
  const text = String(value || '').trim()
  return text || null
}

export function positiveNumber(value: unknown, fallback?: number) {
  const raw = typeof value === 'undefined' ? fallback : value
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'nomnomstock API',
    version: '1.0.0',
    description: 'Versioned API contract for web, device and future external clients.',
  },
  servers: [{ url: '/api/v1' }],
  security: [{ bearerAuth: [] }, { nextAuthCookie: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      nextAuthCookie: { type: 'apiKey', in: 'cookie', name: 'next-auth.session-token' },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid authentication',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiError' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiError' },
          },
        },
      },
    },
    schemas: {
      ApiError: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {},
            },
          },
        },
      },
      Product: {
        type: 'object',
        required: ['id', 'barcode', 'name'],
        properties: {
          id: { type: 'integer' },
          barcode: { type: 'string' },
          name: { type: 'string' },
          brand: { type: ['string', 'null'] },
          image: { type: ['string', 'null'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Location: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          householdId: { type: ['integer', 'null'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Stock: {
        type: 'object',
        required: ['id', 'productId', 'locationId', 'quantity'],
        properties: {
          id: { type: 'integer' },
          productId: { type: 'integer' },
          locationId: { type: 'integer' },
          householdId: { type: ['integer', 'null'] },
          quantity: { type: 'number' },
          unit: { type: ['string', 'null'] },
          mhd: { type: ['string', 'null'], format: 'date-time' },
          product: { $ref: '#/components/schemas/Product' },
          location: { $ref: '#/components/schemas/Location' },
        },
      },
      ShoppingListItem: {
        type: 'object',
        required: ['id', 'productId', 'householdId', 'quantity'],
        properties: {
          id: { type: 'integer' },
          productId: { type: 'integer' },
          householdId: { type: 'integer' },
          quantity: { type: 'number' },
          note: { type: ['string', 'null'] },
          unit: { type: ['string', 'null'] },
          product: { $ref: '#/components/schemas/Product' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: { summary: 'Health check', responses: { '200': { description: 'OK' } } },
    },
    '/lookup': {
      post: {
        summary: 'Lookup product by barcode',
        responses: { '200': { description: 'Lookup result' }, '401': { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/products': {
      get: { summary: 'List products', responses: { '200': { description: 'Products' } } },
      post: { summary: 'Create product', responses: { '200': { description: 'Product' } } },
    },
    '/products/{id}': {
      get: { summary: 'Get product details', parameters: [{ name: 'id', in: 'path', required: true }] },
    },
    '/locations': {
      get: { summary: 'List household locations' },
      post: { summary: 'Create household location' },
    },
    '/stock': {
      get: { summary: 'List stock' },
      post: { summary: 'Add stock' },
    },
    '/stock/{id}/reduce': {
      post: { summary: 'Reduce stock quantity', parameters: [{ name: 'id', in: 'path', required: true }] },
    },
    '/stock/move': {
      post: { summary: 'Move stock between locations' },
    },
    '/shopping': {
      get: { summary: 'List shopping items' },
      post: { summary: 'Add shopping item' },
    },
    '/shopping/{id}': {
      get: { summary: 'Get shopping item', parameters: [{ name: 'id', in: 'path', required: true }] },
      patch: { summary: 'Update shopping item', parameters: [{ name: 'id', in: 'path', required: true }] },
      delete: { summary: 'Delete shopping item', parameters: [{ name: 'id', in: 'path', required: true }] },
    },
    '/profile': {
      get: { summary: 'Get profile' },
      post: { summary: 'Update profile' },
    },
    '/recipes/available': {
      get: { summary: 'List available recipe ingredients' },
    },
    '/recipes/generate': {
      post: { summary: 'Generate recipe suggestion' },
    },
  },
} as const
