-- CreateTable
CREATE TABLE "public"."Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PackageOnTest" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,

    CONSTRAINT "PackageOnTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageOnTest_packageId_testId_key" ON "public"."PackageOnTest"("packageId", "testId");

-- AddForeignKey
ALTER TABLE "public"."PackageOnTest" ADD CONSTRAINT "PackageOnTest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PackageOnTest" ADD CONSTRAINT "PackageOnTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "public"."Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
