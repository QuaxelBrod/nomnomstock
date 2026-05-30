-- Add `isActive` column to User
-- Add `image` and `password` columns (nullable), and `isActive` with default false
ALTER TABLE "User" ADD COLUMN "image" TEXT;
ALTER TABLE "User" ADD COLUMN "password" TEXT;
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;
