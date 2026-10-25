-- Droits d'acces des comptes du dashboard. Les administrateurs existants gardent l'acces total.
ALTER TABLE "users" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "users" SET "permissions" = ARRAY['*']::TEXT[] WHERE "role" = 'admin';
