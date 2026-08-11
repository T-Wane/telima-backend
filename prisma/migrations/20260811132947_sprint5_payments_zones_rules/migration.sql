-- CreateEnum
CREATE TYPE "CommissionPaymentStatus" AS ENUM ('pending', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "commission_amount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "commission_payments" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "CommissionPaymentStatus" NOT NULL DEFAULT 'pending',
    "transaction_ref" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "center_lat" DOUBLE PRECISION NOT NULL,
    "center_lng" DOUBLE PRECISION NOT NULL,
    "radius_km" DOUBLE PRECISION NOT NULL,
    "surge_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service_type" "ServiceType",
    "vehicle_type_id" TEXT,
    "zone_id" TEXT,
    "condition" JSONB NOT NULL,
    "modifier" DECIMAL(4,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_payments_transaction_ref_key" ON "commission_payments"("transaction_ref");

-- CreateIndex
CREATE INDEX "commission_payments_driver_id_idx" ON "commission_payments"("driver_id");

-- CreateIndex
CREATE INDEX "commission_payments_status_idx" ON "commission_payments"("status");

-- CreateIndex
CREATE INDEX "pricing_rules_service_type_is_active_idx" ON "pricing_rules"("service_type", "is_active");

-- AddForeignKey
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "service_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
