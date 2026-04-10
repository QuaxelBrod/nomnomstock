-- Ensure ShoppingListItem exists for installations with incomplete init migrations
CREATE TABLE IF NOT EXISTS "ShoppingListItem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "productId" INTEGER NOT NULL,
  "householdId" INTEGER NOT NULL,
  "quantity" REAL NOT NULL DEFAULT 1,
  "unit" TEXT,
  "addedById" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShoppingListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ShoppingListItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ShoppingListItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);