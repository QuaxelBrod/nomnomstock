# nomnomstock API v1

Base path: `/api/v1`

The legacy `/api/*` paths remain available for the current web frontend. New clients should use `/api/v1/*`.

## Authentication

Current web clients authenticate with the existing NextAuth session cookie. External clients will use `Authorization: Bearer <token>` once the device/API-token phase is implemented.

Error responses should be treated as:

```json
{
  "error": {
    "code": "not_found",
    "message": "Human readable message",
    "details": {}
  }
}
```

Some legacy handlers still return older flat error bodies. The shared `ApiClient` normalizes both shapes into `ApiRequestError`.

## Discovery

- `GET /api/v1/health`
- `GET /api/v1/openapi.json`

## Products

- `POST /api/v1/lookup`
  - Body: `{ "barcode": "..." }`
  - Response: `{ "found": true, "product": Product }` or `{ "found": false }`
- `GET /api/v1/products?q=...`
- `POST /api/v1/products`
  - Body: `{ "name": "...", "barcode"?: "...", "brand"?: "...", "image"?: "..." }`
- `GET /api/v1/products/:id`
- `POST /api/v1/products/:id/image`
- `DELETE /api/v1/products/:id/image`

## Locations

- `GET /api/v1/locations`
- `POST /api/v1/locations`
  - Body: `{ "name": "...", "householdId"?: 1 }`
- `PATCH /api/v1/locations/:id`
  - Body: `{ "name": "..." }`
- `DELETE /api/v1/locations/:id`

## Stock

- `GET /api/v1/stock`
- `POST /api/v1/stock`
  - Body: `{ "productId"?: 1, "barcode"?: "...", "locationId": 1, "quantity"?: 1, "unit"?: "pcs", "mhd"?: "2026-12-31" }`
- `POST /api/v1/stock/move`
  - Body: `{ "fromStockId": 1, "toLocationId": 2, "amount"?: 1 }`
- `POST /api/v1/stock/:id/reduce`
  - Body: `{ "amount"?: 1, "toShopping"?: true }`

## Shopping

- `GET /api/v1/shopping`
- `POST /api/v1/shopping`
  - Body: `{ "productId"?: 1, "name"?: "...", "quantity"?: 1, "note"?: "..." }`
- `GET /api/v1/shopping/recent-removed`
- `GET /api/v1/shopping/:id`
- `PATCH /api/v1/shopping/:id`
  - Body: `{ "quantity"?: 1, "note"?: "..." }`
- `DELETE /api/v1/shopping/:id`

## Profile and Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/invite`
- `GET /api/v1/profile?email=...`
- `POST /api/v1/profile`

NextAuth browser endpoints stay under `/api/auth/*` and are not part of the external API contract.

## Recipes

- `GET /api/v1/recipes/available`
- `POST /api/v1/recipes/generate`
  - Body: `{ "userInput"?: "..." }`
- `POST /api/v1/recipes/email`
  - Body: `{ "recipe": "...", "subject"?: "..." }`
