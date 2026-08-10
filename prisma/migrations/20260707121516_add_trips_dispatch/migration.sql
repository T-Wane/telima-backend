-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('pending', 'accepted', 'driver_arriving', 'in_progress', 'completed', 'cancelled_by_client', 'cancelled_by_driver', 'cancelled_auto');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'orange_money');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('searching', 'driver_notified', 'driver_accepted', 'driver_declined', 'timed_out', 'exhausted');

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "vehicle_type_id" TEXT NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'pending',
    "pickup_location" geometry(Point, 4326) NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "dropoff_location" geometry(Point, 4326) NOT NULL,
    "dropoff_address" TEXT NOT NULL,
    "estimated_price" DECIMAL(10,2),
    "final_price" DECIMAL(10,2),
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "distance_meters" INTEGER,
    "duration_seconds" INTEGER,
    "accepted_at" TIMESTAMP(3),
    "driver_arrived_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "recipient_name" TEXT,
    "recipient_phone" TEXT,
    "parcel_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_attempts" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'searching',
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "dispatch_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_client_id_idx" ON "trips"("client_id");

-- CreateIndex
CREATE INDEX "trips_driver_id_idx" ON "trips"("driver_id");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_service_type_idx" ON "trips"("service_type");

-- CreateIndex
CREATE INDEX "dispatch_attempts_trip_id_idx" ON "dispatch_attempts"("trip_id");

-- CreateIndex
CREATE INDEX "dispatch_attempts_driver_id_idx" ON "dispatch_attempts"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_attempts_trip_id_driver_id_key" ON "dispatch_attempts"("trip_id", "driver_id");

-- CreateSpatialIndex (GiST indexes for PostGIS geometry columns — critical for ST_DWithin queries)
CREATE INDEX "trips_pickup_location_gist_idx" ON "trips" USING GIST ("pickup_location");
CREATE INDEX "trips_dropoff_location_gist_idx" ON "trips" USING GIST ("dropoff_location");
CREATE INDEX "drivers_current_location_gist_idx" ON "drivers" USING GIST ("current_location");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
