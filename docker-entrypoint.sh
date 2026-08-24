#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database (if needed)..."
npx prisma db seed 2>/dev/null || echo "Seed skipped (ts-node not available in production)"

echo "Starting application..."
exec node dist/main
