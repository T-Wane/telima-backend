#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database..."
node dist/prisma/seed.js 2>&1 || echo "WARNING: Seed failed (may already be seeded)"
node dist/prisma/seed-service-config.js 2>&1 || echo "WARNING: Service-config seed failed"

echo "Starting application..."
exec node dist/src/main
