# ADR-006 : Couche Repository pour centraliser le SQL brut

## Statut
Accepté

## Contexte
ADR-001 établit que le SQL brut (`$queryRaw`) est nécessaire pour les colonnes
PostGIS `Unsupported`. Initialement, ce SQL brut était dans `TripsService`,
ce qui violait le principe de séparation des préoccupations : un service métier
ne devrait pas contenir de SQL.

L'utilisateur a explicitement demandé que "tous les accès SQL/PostGIS soient
centralisés dans une couche Repository dédiée afin qu'aucun SQL brut ne remonte
dans les services métier".

## Alternatives considérées

1. **Garder le SQL dans les services (statu quo)**
   - Avantage : Aucun refactoring
   - Inconvénient : SQL brut mélangé avec la logique métier, difficile à tester,
     violation de séparation des préoccupations

2. **Couche Repository générique (BaseRepository<T>)**
   - Avantage : Pattern uniforme
   - Inconvénient : Over-engineering pour le moment, la plupart des modèles
     Prisma n'ont pas besoin de SQL brut

3. **Repository dédié par modèle nécessitant du SQL brut**
   - Avantage : Pragmatique, créé uniquement quand nécessaire, encapsule le SQL
   - Inconvénient : Deux patterns d'accès aux données (Repository pour SQL brut,
     PrismaService direct pour le reste)

## Décision retenue

Option 3 : Repository dédié par modèle nécessitant du SQL brut.

**Règle** :
- Si un modèle Prisma a des colonnes `Unsupported` → créer un Repository dédié
- Le Repository est le **seul** endroit avec `$queryRaw`/`$executeRaw` pour ce modèle
- Les services injectent le Repository, jamais `PrismaService` pour du SQL brut
- Les modèles sans colonnes `Unsupported` utilisent `PrismaService` directement
  (migration progressive vers des Repositories selon la demande utilisateur)

**Repositories actuels** :
- `TripRepository` : INSERT avec geometry, CRUD trips
- `GeolocationService` : requêtes spatiales sur drivers (fait office de repository
  pour les opérations PostGIS sur la table `drivers`)

**Convention pour les futurs modules** : Créer un Repository dès qu'un modèle
nécessite du SQL brut, ou quand l'utilisateur le demande pour réduire la
dépendance à Prisma dans les services.

## Conséquences

- **Positive** : SQL brut encapsulé, services métier plus propres et testables
- **Positive** : Convention claire pour les futurs modules
- **Négative** : Deux patterns d'accès aux données (Repository vs Prisma direct)
- **Évolution** : Migration progressive vers des Repositories pour tous les
  modèles, y compris ceux sans SQL brut (objectif utilisateur : "les services
  métier dépendent le moins possible de Prisma directement")
