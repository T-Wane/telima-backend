FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run prisma:generate
RUN npm run build
RUN npx tsc prisma/seed.ts prisma/seed-service-config.ts \
    --outDir dist/prisma \
    --esModuleInterop \
    --module commonjs \
    --target ES2021 \
    --skipLibCheck
RUN ls -la dist/ && ls -la dist/main.js || echo "dist/main.js NOT FOUND"

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
RUN ls -la dist/ && ls -la dist/main.js || echo "dist/main.js NOT FOUND in stage 2"
RUN ls -la dist/prisma/ || echo "dist/prisma/ NOT FOUND"
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
RUN addgroup -S telima && adduser -S telima -G telima
RUN chown -R telima:telima /app
USER telima
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/v1/health || exit 1
CMD ["./docker-entrypoint.sh"]
