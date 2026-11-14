-- Existing registrations remain valid; their deviceId is NULL until future registrations.
ALTER TABLE "Guest" ADD COLUMN "deviceId" TEXT;
CREATE UNIQUE INDEX "Guest_deviceId_key" ON "Guest"("deviceId");
