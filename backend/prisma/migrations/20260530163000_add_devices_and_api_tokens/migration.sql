CREATE TABLE "Device" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'scanner',
  "status" TEXT NOT NULL DEFAULT 'active',
  "householdId" INTEGER NOT NULL,
  "createdById" INTEGER,
  "defaultLocationId" INTEGER,
  "defaultMode" TEXT NOT NULL DEFAULT 'lookup',
  "lastSeenAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Device_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Device_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Device_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ApiToken" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "clientType" TEXT NOT NULL DEFAULT 'device',
  "householdId" INTEGER,
  "userId" INTEGER,
  "deviceId" INTEGER,
  "expiresAt" DATETIME,
  "lastUsedAt" DATETIME,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiToken_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ApiToken_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DevicePairing" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "keyHash" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "householdId" INTEGER NOT NULL,
  "createdById" INTEGER,
  "deviceId" INTEGER,
  "deviceName" TEXT,
  "deviceType" TEXT NOT NULL DEFAULT 'scanner',
  "defaultLocationId" INTEGER,
  "defaultMode" TEXT NOT NULL DEFAULT 'lookup',
  "scopes" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DevicePairing_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DevicePairing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DevicePairing_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ScannerEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "barcode" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'lookup',
  "source" TEXT NOT NULL DEFAULT 'esp',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "note" TEXT,
  "rawPayload" TEXT,
  "householdId" INTEGER NOT NULL,
  "deviceId" INTEGER,
  "apiTokenId" INTEGER,
  "productId" INTEGER,
  "locationId" INTEGER,
  "quantity" REAL,
  "processedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScannerEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScannerEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ScannerEvent_apiTokenId_fkey" FOREIGN KEY ("apiTokenId") REFERENCES "ApiToken" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ScannerEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ScannerEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE UNIQUE INDEX "DevicePairing_keyHash_key" ON "DevicePairing"("keyHash");
CREATE INDEX "Device_householdId_idx" ON "Device"("householdId");
CREATE INDEX "Device_status_idx" ON "Device"("status");
CREATE INDEX "ApiToken_householdId_idx" ON "ApiToken"("householdId");
CREATE INDEX "ApiToken_deviceId_idx" ON "ApiToken"("deviceId");
CREATE INDEX "ApiToken_revokedAt_idx" ON "ApiToken"("revokedAt");
CREATE INDEX "DevicePairing_householdId_idx" ON "DevicePairing"("householdId");
CREATE INDEX "DevicePairing_expiresAt_idx" ON "DevicePairing"("expiresAt");
CREATE INDEX "DevicePairing_usedAt_idx" ON "DevicePairing"("usedAt");
CREATE INDEX "ScannerEvent_householdId_status_idx" ON "ScannerEvent"("householdId", "status");
CREATE INDEX "ScannerEvent_deviceId_idx" ON "ScannerEvent"("deviceId");
CREATE INDEX "ScannerEvent_barcode_idx" ON "ScannerEvent"("barcode");
CREATE INDEX "ScannerEvent_createdAt_idx" ON "ScannerEvent"("createdAt");
