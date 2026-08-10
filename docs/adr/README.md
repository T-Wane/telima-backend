# Architecture Decision Records (ADR)

Ce répertoire contient les ADR du projet Telima Backend.

## Format

Chaque ADR suit le format suivant :

```
# ADR-XXX : Titre court

## Statut
Accepté / Proposé / Déprécié / Remplacé par ADR-YYY

## Contexte
Description du problème ou besoin qui a motivé la décision.

## Alternatives considérées
Liste des options évaluées avec leurs avantages/inconvénients.

## Décision retenue
La décision finale et sa justification.

## Conséquences
Impacts positifs et négatifs, risques, dépendances introduites.
```

## Numérotation

Les ADR sont numérotés séquentiellement (ADR-001, ADR-002, ...).
Un ADR accepté n'est jamais modifié — il est remplacé par un nouvel ADR si la décision évolue.

## Index

| ADR | Titre | Statut |
|---|---|---|
| [ADR-001](ADR-001-postgis-unsupported-columns.md) | PostGIS via Prisma Unsupported + $queryRaw | Accepté |
| [ADR-002](ADR-002-event-driven-decoupling.md) | Découplage modules par Domain Events (EventEmitter2) | Accepté |
| [ADR-003](ADR-003-dispatch-trips-direct-call.md) | Exception au découplage : Dispatch ↔ Trips appel direct | Accepté |
| [ADR-004](ADR-004-redis-setnx-dispatch-locks.md) | Locks Redis SETNX pour le dispatch multi-chauffeurs | Accepté |
| [ADR-005](ADR-005-bullmq-forwardref-circular-dep.md) | Résolution dépendance circulaire Queue ↔ Dispatch par forwardRef | Accepté |
| [ADR-006](ADR-006-repository-layer-sql-centralization.md) | Couche Repository pour centraliser le SQL brut | Accepté |
| [ADR-007](ADR-007-idempotency-interceptor.md) | Idempotence via Idempotency-Key + Redis | Accepté |
| [ADR-008](ADR-008-google-maps-cache-haversine-fallback.md) | Optimisation coûts Google Maps : cache Redis + fallback Haversine | Accepté |
| [ADR-009](ADR-009-websocket-redis-adapter.md) | Redis adapter Socket.io pour scaling multi-instance | Accepté |
| [ADR-010](ADR-010-observability-roadmap.md) | Roadmap observabilité : Sentry → Prometheus → OpenTelemetry | Accepté |
| [ADR-011](ADR-011-multi-service-platform.md) | Architecture multi-services : ServiceType, TripStop, Details, Capabilities, ServiceConfig | Accepté |
| [ADR-012](ADR-012-sendtext-sms-provider.md) | Fournisseur SMS sendtext.sn (auth par headers snt-api-key/snt-api-secret, remplace Africa's Talking) | Accepté |
