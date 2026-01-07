-- CreateTable
CREATE TABLE "public"."Test" (
    "id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "testCode" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "methodName" TEXT NOT NULL,
    "specimen" TEXT NOT NULL,
    "specimenVolume" TEXT NOT NULL,
    "container" TEXT NOT NULL,
    "reported" TEXT NOT NULL,
    "specialInstruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);
