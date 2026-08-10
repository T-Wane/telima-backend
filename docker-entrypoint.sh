#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database (if needed)..."
npx prisma db seed || true

echo "Starting application..."
exec node dist/main
