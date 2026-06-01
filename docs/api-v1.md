# nomnomstock API v1

Base path: `/api/v1`

The legacy `/api/*` paths remain available for the current web frontend. New clients should use `/api/v1/*`.

## Authentication

Current web clients authenticate with the existing NextAuth session cookie. External clients use `Authorization: Bearer <token>`.

Device tokens are created through a one-time pairing flow. Tokens are stored only as hashes in the database; the clear token is returned exactly once from `POST /api/v1/devices/pair`.

Default scanner scopes:

- `scanner:write`
- `product:lookup`
- `stock:add`
- `location:read`

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

## Devices and Scanner Pairing

- `GET /api/v1/devices`
  - Auth: web session
  - Response: `{ "devices": Device[] }`
- `POST /api/v1/devices/pairing`
  - Auth: web session
  - Body: `{ "name"?: "Kueche Scanner", "type"?: "scanner", "defaultLocationId"?: 1, "defaultMode"?: "lookup" | "stock_add" | "shopping_check", "ttlSeconds"?: 600, "scopes"?: string[] }`
  - Response includes:
    - `key`: short-lived one-time pairing key for 1D barcode
    - `apiBase`: API base URL ending in `/api/v1`
    - `qrPayload`: JSON payload for QR codes, e.g. `{ "v": 1, "api": ".../api/v1", "pair": "NNSP..." }`
- `POST /api/v1/devices/pair`
  - Auth: none
  - Body: `{ "pairingKey": "NNSP...", "device"?: { "name"?: "ESP Scanner", "type"?: "esp-scanner", "firmwareVersion"?: "..." } }`
  - Response: `{ "ok": true, "device": Device, "apiBase": ".../api/v1", "token": "nns_...", "scopes": [...] }`
  - The pairing key is single-use and expires after the configured TTL.
- `POST /api/v1/devices/:id/revoke`
  - Auth: web session
  - Revokes the device and all active tokens for that device.
- `POST /api/v1/devices/:id/rotate-token`
  - Auth: web session
  - Revokes active tokens for the device and returns one new token exactly once.
  - Response: `{ "ok": true, "device": Device, "apiBase": ".../api/v1", "token": "nns_...", "tokenPrefix": "nns_..." }`

## Scanner Events

- `POST /api/v1/scanner/events`
  - Auth: device bearer token with `scanner:write`
  - Body: `{ "barcode": "...", "mode"?: "lookup" | "stock_add" | "shopping_check", "locationId"?: 1, "quantity"?: 1 }`
  - Response: `{ "ok": true, "event": ScannerEvent }`
  - The event is stored as `pending`; web clients decide how to process it.
- `GET /api/v1/scanner/events?status=pending`
  - Auth: web session
  - Response: `{ "events": ScannerEvent[] }`
- `PATCH /api/v1/scanner/events/:id`
  - Auth: web session
  - Body: `{ "status"?: "pending" | "processed" | "ignored", "note"?: "...", "productId"?: 1, "locationId"?: 1 }`
