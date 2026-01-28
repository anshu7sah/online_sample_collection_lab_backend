/*
  Warnings:

  - A unique constraint covering the columns `[patientId]` on the table `Booking` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "patientId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "unique_patient_id_not_null" ON "public"."Booking"("patientId");

-- CreateIndex
CREATE INDEX "Booking_patientId_idx" ON "public"."Booking"("patientId");
