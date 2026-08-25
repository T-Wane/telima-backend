#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database..."
npx ts-node prisma/seed.ts 2>&1 || echo "WARNING: Seed failed (may already be seeded)"
npx ts-node prisma/seed-service-config.ts 2>&1 || echo "WARNING: Service-config seed failed"

echo "Starting application..."
exec node dist/src/main
