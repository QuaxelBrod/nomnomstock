-- CreateTable
CREATE TABLE "HouseholdOfferSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "householdId" INTEGER NOT NULL,
    "postalCode" TEXT,
    "retailerKeys" TEXT NOT NULL DEFAULT '["aldi","kaufland","lidl","rewe"]',
    "maxStores" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseholdOfferSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdOfferSettings_householdId_key" ON "HouseholdOfferSettings"("householdId");

-- CreateIndex
CREATE INDEX "HouseholdOfferSettings_postalCode_idx" ON "HouseholdOfferSettings"("postalCode");
