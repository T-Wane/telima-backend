# ADR-001 : PostGIS via Prisma Unsupported + $queryRaw

## Statut
Accepté

## Contexte
Le projet Telima nécessite des requêtes spatiales (recherche de chauffeurs à proximité,
calcul de distances, stockage de points géographiques) pour le module Dispatch et Trips.

Prisma ORM ne supporte pas nativement les types géométriques PostGIS
(`geometry(Point, 4326)`). Il faut donc trouver un moyen d'utiliser PostGIS tout en
gardant Prisma comme ORM principal (décision Doc2 : Prisma exclusif, pas de SQL brut
écrit à la main en dehors des cas documentés).

## Alternatives considérées

1. **Colonnes NUMERIC lat/lng au lieu de PostGIS**
   - Avantage : Simple, compatible Prisma natif
   - Inconvénient : Pas d'index spatial, performances dégradées, pas de ST_DWithin,
     contraire à la décision Doc2 (PostGIS réel requis)

2. **TypeORM ou mikro-ORM à côté de Prisma pour les requêtes spatiales**
   - Avantage : Support natif PostGIS
   - Inconvénient : Deux ORMs dans le projet, complexité accrue, violation de la
     décision "Prisma exclusif"

3. **Prisma avec colonnes `Unsupported("geometry(Point,4326)")` + `$queryRaw`**
   - Avantage : Prisma reste l'ORM unique, PostGIS utilisé pour les index et requêtes
     spatiales, SQL brut limité et encapsulé
   - Inconvénient : Prisma ne peut pas faire `create()` sur ces colonnes, il faut
     `$queryRaw` pour les INSERT et certaines requêtes

## Décision retenue

Option 3 : Prisma avec `Unsupported("geometry(Point,4326)")` pour les colonnes
géométriques. Les requêtes spatiales utilisent `$queryRaw` avec des templates
paramétrés (`Prisma.sql`), jamais de SQL concaténé à la main.

Le SQL brut est strictement limité à deux couches :
- `GeolocationService` : requêtes spatiales sur `drivers` (ST_DWithin, ST_MakePoint, etc.)
- `TripRepository` : INSERT de trips avec colonnes geometry

## Conséquences

- **Positive** : PostGIS réel avec index spatial GIST, performances optimales pour
  la recherche de chauffeurs à proximité
- **Positive** : Prisma reste l'ORM unique, pas de fragmentation
- **Négative** : Prisma ne génère pas de types pour les colonnes `Unsupported`,
  il faut des types manuels ou génériques (ex: `Record<string, unknown>` pour
  `TripUpdateInput`)
- **Négative** : Le SQL brut doit être audités régulièrement pour s'assurer qu'il
  reste dans les couches autorisées
- **Dépendance** : Nécessite l'extension PostGIS sur la base de données
