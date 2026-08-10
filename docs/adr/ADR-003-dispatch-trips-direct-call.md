# ADR-003 : Exception au découplage — Dispatch ↔ Trips appel direct

## Statut
Accepté

## Contexte
ADR-002 établit le découplage par Domain Events entre les modules. Cependant,
certaines opérations nécessitent une coordination synchrone entre Trips et Dispatch :

- **Accept** : Un chauffeur accepte une course → Trips doit vérifier le lock Redis
  du chauffeur via Dispatch, puis Dispatch doit marquer l'attempt comme accepté
- **Decline** : Un chauffeur refuse → Dispatch doit enregistrer le refus et
  potentiellement passer au chauffeur suivant
- **Cancel** : Le client annule → Dispatch doit nettoyer les locks et attempts

Ces opérations sont déclenchées par `PATCH /trips/:id/status` et nécessitent
une réponse synchrone (succès/échec) au client HTTP.

## Alternatives considérées

1. **Tout par events (TripAcceptRequested, TripDeclineRequested, etc.)**
   - Avantage : Découplage total
   - Inconvénient : La requête HTTP doit attendre la réponse asynchrone du handler,
     ce qui nécessite un mécanisme de request/reply sur EventEmitter2 (complexe,
     fragile, timeout handling)

2. **Appel direct TripsService → DispatchService**
   - Avantage : Simple, synchrone, réponse immédiate au client HTTP
   - Inconvénient : Couplage direct entre Trips et Dispatch, violation du principe
     de découplage ADR-002

3. **Service de coordination séparé (TripOrchestratorService)**
   - Avantage : Ni Trips ni Dispatch ne se connaissent
   - Inconvénient : Couche supplémentaire, complexité, et l'orchestrator dépend
     quand même des deux modules

## Décision retenue

Option 2 : Appel direct `TripsService → DispatchService` pour les opérations
accept/decline/cancel, **documenté comme exception explicite** au découplage.

Les autres communications (création, échec, assignation) restent par Domain Events.

Cette exception est justifiée par :
- La nécessité d'une réponse synchrone au client HTTP
- La coordination avec les locks Redis du Dispatch
- La simplicité de l'implémentation

## Conséquences

- **Positive** : Simple, performant, pas de mécanisme request/reply complexe
- **Négative** : Couplage direct Trips → Dispatch (TripsModule importe DispatchModule)
- **Mitigation** : Exception documentée dans ARCHITECTURE.md, limitée à 3 méthodes
  (accept, decline, cancel)
- **Évolution** : Si le couplage devient problématique, migration vers un
  TripOrchestratorService possible
