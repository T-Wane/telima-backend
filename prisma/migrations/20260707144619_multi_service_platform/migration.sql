/*
  Warnings:

  - You are about to drop the column `parcel_description` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `recipient_name` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `recipient_phone` on the `trips` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('pickup', 'dropoff', 'waypoint');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceType" ADD VALUE 'food';
ALTER TYPE "ServiceType" ADD VALUE 'assistance';
ALTER TYPE "ServiceType" ADD VALUE 'intercity';

-- DropIndex
DROP INDEX "drivers_current_location_gist_idx";

-- DropIndex
DROP INDEX "trips_dropoff_location_gist_idx";

-- DropIndex
DROP INDEX "trips_pickup_location_gist_idx";

-- AlterTable
ALTER TABLE "trips" DROP COLUMN "parcel_description",
DROP COLUMN "recipient_name",
DROP COLUMN "recipient_phone";

-- CreateTable
CREATE TABLE "capabilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'equipment',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_type_capabilities" (
    "id" TEXT NOT NULL,
    "vehicle_type_id" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,

    CONSTRAINT "vehicle_type_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_capabilities" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,

    CONSTRAINT "driver_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_stops" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stop_type" "StopType" NOT NULL,
    "location" geometry(Point, 4326) NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "arrived_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_details" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "passenger_count" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_details" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "parcel_description" TEXT,
    "parcel_weight_kg" DECIMAL(5,2),
    "parcel_dimensions" TEXT,
    "is_fragile" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_configs" (
    "id" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "dispatch_radius_meters" INTEGER NOT NULL DEFAULT 5000,
    "max_dispatch_attempts" INTEGER NOT NULL DEFAULT 3,
    "lock_ttl_seconds" INTEGER NOT NULL DEFAULT 30,
    "dispatch_timeout_ms" INTEGER NOT NULL DEFAULT 15000,
    "surge_enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_surge_multiplier" DECIMAL(3,2) NOT NULL DEFAULT 2.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requirements" (
    "id" TEXT NOT NULL,
    "service_config_id" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'required',

    CONSTRAINT "service_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "capabilities_name_key" ON "capabilities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_type_capabilities_vehicle_type_id_capability_id_key" ON "vehicle_type_capabilities"("vehicle_type_id", "capability_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_capabilities_driver_id_capability_id_key" ON "driver_capabilities"("driver_id", "capability_id");

-- CreateIndex
CREATE INDEX "trip_stops_trip_id_idx" ON "trip_stops"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_stops_trip_id_sequence_key" ON "trip_stops"("trip_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ride_details_trip_id_key" ON "ride_details"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_details_trip_id_key" ON "delivery_details"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_configs_service_type_key" ON "service_configs"("service_type");

-- CreateIndex
CREATE UNIQUE INDEX "service_requirements_service_config_id_capability_id_key" ON "service_requirements"("service_config_id", "capability_id");

-- AddForeignKey
ALTER TABLE "vehicle_type_capabilities" ADD CONSTRAINT "vehicle_type_capabilities_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_type_capabilities" ADD CONSTRAINT "vehicle_type_capabilities_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_capabilities" ADD CONSTRAINT "driver_capabilities_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_capabilities" ADD CONSTRAINT "driver_capabilities_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_details" ADD CONSTRAINT "ride_details_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_details" ADD CONSTRAINT "delivery_details_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requirements" ADD CONSTRAINT "service_requirements_service_config_id_fkey" FOREIGN KEY ("service_config_id") REFERENCES "service_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requirements" ADD CONSTRAINT "service_requirements_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
