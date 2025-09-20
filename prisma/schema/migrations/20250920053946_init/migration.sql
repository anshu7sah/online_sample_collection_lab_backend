-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "mobile" TEXT NOT NULL,
    "name" TEXT,
    "dob" TIMESTAMP(3),
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_mobile_key" ON "public"."User"("mobile");
