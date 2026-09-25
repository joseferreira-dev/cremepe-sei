-- AlterTable
ALTER TABLE "users" ADD COLUMN "ad_username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_ad_username_key" ON "users"("ad_username");

