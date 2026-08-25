#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database..."
node dist/prisma/seed.js || echo "Seed failed (may already be seeded)"
node dist/prisma/seed-service-config.js || echo "Service-config seed failed"

echo "Starting application..."
exec node dist/src/main
