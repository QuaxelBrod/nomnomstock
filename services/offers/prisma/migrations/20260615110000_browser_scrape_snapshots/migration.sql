-- CreateTable
CREATE TABLE "BrowserScrapeSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scanTargetId" INTEGER,
    "retailerKey" TEXT NOT NULL,
    "retailerName" TEXT NOT NULL,
    "postalCode" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "offersFound" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "htmlPath" TEXT,
    "screenshotPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrowserScrapeSnapshot_scanTargetId_fkey" FOREIGN KEY ("scanTargetId") REFERENCES "ScanTarget" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BrowserScrapeSnapshot_retailerKey_createdAt_idx" ON "BrowserScrapeSnapshot"("retailerKey", "createdAt");

-- CreateIndex
CREATE INDEX "BrowserScrapeSnapshot_scanTargetId_createdAt_idx" ON "BrowserScrapeSnapshot"("scanTargetId", "createdAt");

-- CreateIndex
CREATE INDEX "BrowserScrapeSnapshot_status_createdAt_idx" ON "BrowserScrapeSnapshot"("status", "createdAt");
