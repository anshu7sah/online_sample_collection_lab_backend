-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "riderEarning" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "public"."Rider" ADD COLUMN     "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
