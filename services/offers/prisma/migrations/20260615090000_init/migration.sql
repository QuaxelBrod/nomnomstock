-- CreateTable
CREATE TABLE "ScanTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "retailerKey" TEXT NOT NULL,
    "retailerName" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "postalCode" TEXT,
    "storeId" TEXT,
    "regionId" TEXT,
    "label" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "lastFingerprint" TEXT,
    "lastRefreshedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scanTargetId" INTEGER NOT NULL,
    "retailerKey" TEXT NOT NULL,
    "retailerName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceFingerprint" TEXT NOT NULL,
    "extractionMethod" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "unitPriceCents" INTEGER,
    "unit" TEXT,
    "quantityText" TEXT,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "confidence" REAL NOT NULL DEFAULT 0.6,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rawText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Offer_scanTargetId_fkey" FOREIGN KEY ("scanTargetId") REFERENCES "ScanTarget" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "requestedBy" TEXT,
    "postalCode" TEXT,
    "retailerKeys" TEXT,
    "scannedTargets" INTEGER NOT NULL DEFAULT 0,
    "changedTargets" INTEGER NOT NULL DEFAULT 0,
    "offersFound" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "RefreshItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "refreshRunId" INTEGER NOT NULL,
    "scanTargetId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "fingerprint" TEXT,
    "changed" BOOLEAN NOT NULL DEFAULT false,
    "offersFound" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshItem_refreshRunId_fkey" FOREIGN KEY ("refreshRunId") REFERENCES "RefreshRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RefreshItem_scanTargetId_fkey" FOREIGN KEY ("scanTargetId") REFERENCES "ScanTarget" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfferPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "householdId" INTEGER NOT NULL,
    "postalCode" TEXT NOT NULL,
    "retailerKeys" TEXT NOT NULL,
    "maxStores" INTEGER NOT NULL DEFAULT 3,
    "settingsSnapshot" TEXT NOT NULL,
    "shoppingSnapshot" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanTarget_retailerKey_scopeType_scopeValue_key" ON "ScanTarget"("retailerKey", "scopeType", "scopeValue");

-- CreateIndex
CREATE INDEX "ScanTarget_postalCode_idx" ON "ScanTarget"("postalCode");

-- CreateIndex
CREATE INDEX "ScanTarget_retailerKey_idx" ON "ScanTarget"("retailerKey");

-- CreateIndex
CREATE INDEX "Offer_scanTargetId_isActive_idx" ON "Offer"("scanTargetId", "isActive");

-- CreateIndex
CREATE INDEX "Offer_retailerKey_idx" ON "Offer"("retailerKey");

-- CreateIndex
CREATE INDEX "Offer_sourceFingerprint_idx" ON "Offer"("sourceFingerprint");

-- CreateIndex
CREATE INDEX "Offer_validUntil_idx" ON "Offer"("validUntil");

-- CreateIndex
CREATE INDEX "RefreshItem_refreshRunId_idx" ON "RefreshItem"("refreshRunId");

-- CreateIndex
CREATE INDEX "RefreshItem_scanTargetId_idx" ON "RefreshItem"("scanTargetId");

-- CreateIndex
CREATE INDEX "OfferPlan_householdId_createdAt_idx" ON "OfferPlan"("householdId", "createdAt");
