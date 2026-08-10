-- CreateEnum
CREATE TYPE "SenderRole" AS ENUM ('client', 'driver');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('android', 'ios', 'web');

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "payment_received_amount" DECIMAL(10,2),
ADD COLUMN     "payment_received_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "has_ac" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "sender_role" "SenderRole" NOT NULL,
    "content" TEXT,
    "audio_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_ratings" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "rater_id" TEXT NOT NULL,
    "rater_role" "SenderRole" NOT NULL,
    "rating" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_messages_trip_id_idx" ON "chat_messages"("trip_id");

-- CreateIndex
CREATE INDEX "trip_ratings_trip_id_idx" ON "trip_ratings"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_ratings_trip_id_rater_id_key" ON "trip_ratings"("trip_id", "rater_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_ratings" ADD CONSTRAINT "trip_ratings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_ratings" ADD CONSTRAINT "trip_ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
