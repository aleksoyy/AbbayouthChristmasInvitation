CREATE TABLE "WheelState" ("id" INTEGER NOT NULL DEFAULT 1, "currentRound" INTEGER NOT NULL DEFAULT 1, CONSTRAINT "WheelState_pkey" PRIMARY KEY ("id"));
CREATE TABLE "WheelWinner" ("id" TEXT NOT NULL, "guestId" TEXT NOT NULL, "lotteryNumber" INTEGER NOT NULL, "guestName" TEXT NOT NULL, "round" INTEGER NOT NULL, "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WheelWinner_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "WheelWinner_round_guestId_key" ON "WheelWinner"("round", "guestId");
CREATE INDEX "WheelWinner_round_drawnAt_idx" ON "WheelWinner"("round", "drawnAt");
INSERT INTO "WheelState" ("id", "currentRound") VALUES (1, 1);
