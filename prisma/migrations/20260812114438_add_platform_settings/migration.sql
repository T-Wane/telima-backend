-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "platform_name" TEXT NOT NULL DEFAULT 'Telima',
    "contact_email" TEXT,
    "support_phone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "free_cancellation_min" INTEGER NOT NULL DEFAULT 5,
    "driver_search_radius_km" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);
