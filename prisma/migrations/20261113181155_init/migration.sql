-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryNumber" (
    "number" INTEGER NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3),

    CONSTRAINT "LotteryNumber_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "lotteryNumber" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "mentorName" TEXT,
    "churchName" TEXT,
    "informationSource" TEXT,
    "informationSourceOther" TEXT,
    "submissionToken" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_lotteryNumber_key" ON "Guest"("lotteryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_submissionToken_key" ON "Guest"("submissionToken");

-- CreateIndex
CREATE INDEX "Guest_fullName_idx" ON "Guest"("fullName");

-- CreateIndex
CREATE INDEX "Guest_phoneNumber_idx" ON "Guest"("phoneNumber");

-- CreateIndex
CREATE INDEX "Guest_registeredAt_idx" ON "Guest"("registeredAt");

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_lotteryNumber_fkey" FOREIGN KEY ("lotteryNumber") REFERENCES "LotteryNumber"("number") ON DELETE RESTRICT ON UPDATE CASCADE;
