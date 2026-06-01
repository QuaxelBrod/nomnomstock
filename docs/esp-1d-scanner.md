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

## Sending Scans

For every scanned product barcode:

```http
POST /api/v1/scanner/events
Authorization: Bearer nns_...
Content-Type: application/json

{
  "barcode": "4006381333931",
  "mode": "lookup",
  "locationId": 1,
  "quantity": 1
}
```

The server stores the scan as a pending scanner event. The web scan page shows pending ESP scans and can book them into stock or ignore them.

## Token Rotation

The web app can rotate a device token. The previous token immediately stops working. For a 1D-only scanner, the practical recovery path is usually to pair the device again unless the firmware has another way to receive the new token.
