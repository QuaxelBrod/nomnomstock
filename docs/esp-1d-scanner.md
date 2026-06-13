# ESP 1D Scanner Protocol

This is the current minimum protocol for a scanner that can only read 1D barcodes.

## Configuration

The ESP must know the API base URL before pairing:

```text
https://example.tld/api/v1
```

For local tests this can be:

```text
http://<backend-host>:3001/api/v1
```

The 1D pairing barcode shown in the web profile contains only the short-lived pairing key.

## Pairing

1. In the web app, open `Profil` and create a scanner pairing.
2. Scan the Code-128 pairing key.
3. The ESP sends:

```http
POST /api/v1/devices/pair
Content-Type: application/json

{
  "pairingKey": "NNSP...",
  "device": {
    "name": "ESP Scanner",
    "type": "esp-scanner",
    "firmwareVersion": "0.1.0"
  }
}
```

Successful response:

```json
{
  "ok": true,
  "apiBase": "https://example.tld/api/v1",
  "token": "nns_...",
  "scopes": ["scanner:write", "product:lookup", "stock:add", "location:read"],
  "defaultMode": "lookup",
  "defaultLocationId": 1
}
```

The ESP stores `token`, `apiBase`, `defaultMode`, and `defaultLocationId`.

## Locations

The scanner has a `defaultLocationId`, but a hand scanner can override it for each scan.

To show a location picker on the device, load the household locations with the device token:

```http
GET /api/v1/locations
Authorization: Bearer nns_...
```

When sending a scan:

- omit `locationId` to use the paired scanner's `defaultLocationId`
- send `locationId` to override the default for this scan
- if neither exists, the backend falls back to the default `Vorrat` location

Example override:

```json
{
  "barcode": "4006381333931",
  "mode": "stock_add",
  "locationId": 2,
  "quantity": 1
}
```

## Modes

The scanner can send a mode with every scan. If no mode is sent, the backend uses the device `defaultMode` from pairing.

- `lookup`: store the scan as pending; the web app decides what to do.
- `stock_add`: book the scanned product into the selected/default location.
- `stock_remove`: book the scanned product out of the selected/default location.
- `shopping_check`: store the scan as pending for shopping-list/check workflows.

For firmware compatibility the backend also accepts `stock_out` and `stock_reduce` as aliases for `stock_remove`.

## Sending Scans

For every scanned product barcode:

```http
POST /api/v1/scanner/events
Authorization: Bearer nns_...
Content-Type: application/json

{
  "barcode": "4006381333931",
  "mode": "stock_add",
  "locationId": 1,
  "quantity": 1
}
```

For `stock_add` and `stock_remove`, the server processes the stock change directly when product, location, and stock state are valid. If processing is not possible, the scan remains pending. The web scan page shows pending ESP scans and can book them in, book them out, or ignore them.

For booking out:

```json
{
  "barcode": "4006381333931",
  "mode": "stock_remove",
  "locationId": 1,
  "quantity": 1
}
```

## Token Rotation

The web app can rotate a device token. The previous token immediately stops working. For a 1D-only scanner, the practical recovery path is usually to pair the device again unless the firmware has another way to receive the new token.
