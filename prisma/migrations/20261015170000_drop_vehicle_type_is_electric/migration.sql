-- Abandonne : l'electrique se choisit via l'energie du vehicule du chauffeur (trips.electric_only), pas via un type.
ALTER TABLE "vehicle_types" DROP COLUMN IF EXISTS "is_electric";
