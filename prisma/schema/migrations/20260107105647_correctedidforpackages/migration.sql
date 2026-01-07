/*
  Warnings:

  - The primary key for the `Package` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Package` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `PackageOnTest` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `PackageOnTest` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Test` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Test` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `packageId` on the `PackageOnTest` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `testId` on the `PackageOnTest` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "public"."PackageOnTest" DROP CONSTRAINT "PackageOnTest_packageId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PackageOnTest" DROP CONSTRAINT "PackageOnTest_testId_fkey";

-- AlterTable
ALTER TABLE "public"."Package" DROP CONSTRAINT "Package_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Package_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."PackageOnTest" DROP CONSTRAINT "PackageOnTest_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "packageId",
ADD COLUMN     "packageId" INTEGER NOT NULL,
DROP COLUMN "testId",
ADD COLUMN     "testId" INTEGER NOT NULL,
ADD CONSTRAINT "PackageOnTest_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."Test" DROP CONSTRAINT "Test_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Test_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "public"."User" DROP CONSTRAINT "User_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "PackageOnTest_packageId_testId_key" ON "public"."PackageOnTest"("packageId", "testId");

-- AddForeignKey
ALTER TABLE "public"."PackageOnTest" ADD CONSTRAINT "PackageOnTest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PackageOnTest" ADD CONSTRAINT "PackageOnTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "public"."Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
