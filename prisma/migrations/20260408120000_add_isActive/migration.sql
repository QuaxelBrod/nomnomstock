-- Add `isActive` column to User
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;
