/*
  Warnings:

  - You are about to drop the column `otpCode` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "otpCode",
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "otpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otpHash" TEXT;
