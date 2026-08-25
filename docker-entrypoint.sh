#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database..."
npx prisma db seed || echo "Seed failed (may already be seeded)"
npx ts-node prisma/seed-service-config.ts || echo "Service-config seed failed"

echo "Starting application..."
exec node dist/src/main
