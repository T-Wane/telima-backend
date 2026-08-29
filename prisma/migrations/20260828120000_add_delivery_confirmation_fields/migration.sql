-- AlterTable
ALTER TABLE "trips" ADD COLUMN "delivery_confirmed_at" TIMESTAMP(3);
ALTER TABLE "trips" ADD COLUMN "delivery_issue_reported" TEXT;
