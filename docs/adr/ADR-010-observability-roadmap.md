# ADR-010 : Roadmap observabilité — Sentry → Prometheus → OpenTelemetry

## Statut
Accepté

## Contexte
Le backend Telima n'a actuellement que des logs Pino (JSON structuré) et un
healthcheck. Pour la production, il faut :
- **Error tracking** : Capturer et alerter sur les erreurs non gérées
- **Métriques** : Surveiller la latence, le taux d'erreur, les queues, les connexions
- **Tracing distribué** : Suivre une requête à travers les modules et services

L'utilisateur a demandé de "préparer l'intégration future de Prometheus,
OpenTelemetry et Sentry pour l'observabilité" et de préparer la phase
d'exploitation après le Sprint 3.

## Alternatives considérées

1. **Tout intégrer immédiatement (Sprint 2)**
   - Avantage : Observabilité complète dès maintenant
   - Inconvénient : Sprint 2 déjà dense, risque de retarder les fonctionnalités
     métier, infrastructure de monitoring pas encore déployée

2. **Intégrer uniquement Sentry (error tracking)**
   - Avantage : Rapide, haute valeur
   - Inconvénient : Pas de métriques, pas de tracing, vision incomplète

3. **Phasage progressif : Sentry → Prometheus → OpenTelemetry**
   - Avantage : Priorité par valeur immédiate, chaque phase est indépendante
   - Inconvénient : Trois phases d'intégration, configuration étalée

## Décision retenue

Option 3 : Phasage progressif en trois étapes.

### Phase 1 : Sentry (Sprint 3) — Error tracking
- `@sentry/node` + `@sentry/tracing`
- Capture des exceptions non gérées, erreurs 5xx, timeouts
- Variables : `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`
- Valeur immédiate : visibilité sur les erreurs en production

### Phase 2 : Prometheus (Sprint 3-4) — Métriques
- `@willsoto/nestjs-prometheus`
- Endpoint `/metrics` exposant 12 métriques (HTTP, dispatch, WebSocket, BullMQ, Redis, Google Maps)
- Variables : `METRICS_ENABLED`, `METRICS_PATH`
- Dashboards Grafana à créer

### Phase 3 : OpenTelemetry (Sprint 4-5) — Tracing distribué
- `@opentelemetry/sdk-node` + auto-instrumentations
- Export OTLP vers Jaeger/Tempo
- Variables : `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`
- Permet de tracer une requête à travers tous les modules

### Phase 4 (post-Sprint 3) : Exploitation
- Tests de charge (k6 ou Artillery)
- CI/CD pipeline (GitHub Actions)
- Revues de sécurité (dependabot, audit npm, OWASP)
- Alerting (Grafana alerts ou Sentry alerts)

## Conséquences

- **Positive** : Chaque phase apporte de la valeur indépendamment
- **Positive** : Variables d'environnement déjà documentées dans CONFIGURATION.md
- **Négative** : Trois intégrations séparées avec des SDKs différents
- **Mitigation** : OpenTelemetry peut remplacer Sentry tracing à terme (mais
  Sentry reste pour l'error tracking qui est sa force principale)
- **Dépendance** : Infrastructure de monitoring (Grafana, Jaeger) à déployer
  en production (Sprint 5 ou phase d'exploitation)
