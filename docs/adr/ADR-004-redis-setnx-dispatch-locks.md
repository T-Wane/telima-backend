# ADR-004 : Locks Redis SETNX pour le dispatch multi-chauffeurs

## Statut
Accepté

## Contexte
Lors du dispatch, plusieurs chauffeurs sont notifiés simultanément d'une nouvelle
course via WebSocket (`trip:new_request`). Il faut garantir :
1. Qu'un chauffeur ne soit pas notifié pour deux courses simultanées
2. Que l'acceptation d'une course par un chauffeur invalide les locks des autres
3. Que les locks expirent automatiquement (chauffeur injoignable)

## Alternatives considérées

1. **Locks en base de données (SELECT FOR UPDATE)**
   - Avantage : Transactionnel, ACID
   - Inconvénient : Contention sur la base, moins performant que Redis pour des
     locks éphémères, bloque des lignes de drivers

2. **Verrous optimistes (version field sur driver)**
   - Avantage : Pas de lock explicite
   - Inconvénient : Gestion des conflits complexe, retry nécessaire, pas adapté
     pour des notifications éphémères

3. **Redis SETNX avec TTL**
   - Avantage : Atomique, performant, auto-expiration, partagé entre instances
     (scaling horizontal)
   - Inconvénient : Pas de transaction ACID, Redis doit être disponible

## Décision retenue

Option 3 : Redis SETNX avec TTL pour les locks de dispatch.

**Clé** : `telima:driver:dispatch:{driverId}`
**Valeur** : `{tripId}` (pour vérifier que le lock correspond au bon trip)
**TTL** : 30 secondes (suffisant pour que le chauffeur réponde)

**Flow** :
1. Dispatch notifie le chauffeur → `SET lock {tripId} EX 30 NX`
2. Chauffeur accepte → `GET lock` vérifie `{tripId}` correspond → `DEL lock`
3. Chauffeur injoignable → lock expire après 30s → dispatch timeout

## Conséquences

- **Positive** : Locks éphémères performants, auto-expiration, pas de contention DB
- **Positive** : Compatible scaling horizontal (Redis partagé entre instances)
- **Négative** : Si Redis tombe, les locks sont perdus (mais le dispatch peut
  continuer sans locks, avec risque de double notification)
- **Négative** : Pas d'atomicité garantie entre la vérification du lock et
  l'assignation (race condition possible — voir ADR-003 et section 11 ARCHITECTURE.md)
- **Évolution** : Pour garantir l'atomicité stricte, ajouter un lock au niveau
  du trip : `SET trip:accept:{tripId} NX EX 5` (prévu Sprint 3)
