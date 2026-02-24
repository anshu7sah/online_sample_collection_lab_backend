-- CreateEnum
CREATE TYPE "public"."MoneyTransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."MoneyTransferType" AS ENUM ('COLLECTION', 'SETTLEMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."RiderStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'RIDER';

-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "collectedByRider" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "collectionAmount" DECIMAL(65,30),
ADD COLUMN     "isSettled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riderId" INTEGER,
ADD COLUMN     "sampleCollectedAt" TIMESTAMP(3),
ADD COLUMN     "totalAmount" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "public"."MoneyTransfer" (
    "id" SERIAL NOT NULL,
    "riderId" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "type" "public"."MoneyTransferType" NOT NULL,
    "status" "public"."MoneyTransferStatus" NOT NULL DEFAULT 'PENDING',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedDate" TIMESTAMP(3),
    "approvedById" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,

    CONSTRAINT "MoneyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Rating" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "riderId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Rider" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "phone" TEXT,
    "drivingLicenseUrl" TEXT,
    "labDegreeUrl" TEXT,
    "status" "public"."RiderStatus" NOT NULL DEFAULT 'PENDING',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "walletBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rating_bookingId_riderId_key" ON "public"."Rating"("bookingId", "riderId");

-- CreateIndex
CREATE UNIQUE INDEX "Rider_userId_key" ON "public"."Rider"("userId");

-- CreateIndex
CREATE INDEX "Booking_riderId_idx" ON "public"."Booking"("riderId");

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "public"."Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "public"."Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Rating" ADD CONSTRAINT "Rating_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Rating" ADD CONSTRAINT "Rating_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "public"."Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Rider" ADD CONSTRAINT "Rider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
