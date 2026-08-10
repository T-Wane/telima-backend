# ADR-002 : Découplage modules par Domain Events (EventEmitter2)

## Statut
Accepté

## Contexte
L'architecture Telima comporte plusieurs modules qui doivent communiquer :
Trips, Dispatch, Pricing, Events (WebSocket), Queue (BullMQ).

Un couplage direct entre tous les modules créerait une dépendance circulaire
et rendrait l'ajout de nouveaux modules risqué (effet ripple).

## Alternatives considérées

1. **Couplage direct (injection de services)**
   - Avantage : Simple, typage fort, debug facile
   - Inconvénient : Dépendances circulaires, modification d'un module impacte les autres

2. **Message broker externe (RabbitMQ, Kafka)**
   - Avantage : Découplage total, persistence des messages, retry natif
   - Inconvénient : Infrastructure supplémentaire, latence, overkill pour des
     événements intra-processus

3. **EventEmitter2 (NestJS in-process events)**
   - Avantage : Découplage sans infrastructure supplémentaire, typage TypeScript
     via interfaces, performant (in-process), compatible avec NestJS DI
   - Inconvénient : Pas de persistence, events perdus si handler échoue,
     pas de retry automatique sur les events

## Décision retenue

Option 3 : EventEmitter2 pour les événements intra-processus.

- Module `DomainEventsModule` wrappe EventEmitter2
- Constantes pour les noms d'événements (`DomainEvents` class)
- Interfaces TypeScript typées pour chaque payload
- Les handlers utilisent `@OnEvent()` decorator

Événements émis :
- `TripCreated` → Dispatch déclenche la recherche de chauffeurs
- `DispatchFailed` → Trips annule la course (auto)
- `DriverAssigned` → Trips met à jour le statut + broadcast WebSocket

## Conséquences

- **Positive** : Modules faiblement couplés, ajout de nouveaux handlers sans
  modification des émetteurs
- **Positive** : Typage fort via interfaces, refactor-safe
- **Négative** : Pas de persistence des events — si le processus crash entre
  l'émission et le traitement, l'event est perdu
- **Mitigation** : Les opérations critiques (dispatch timeout) utilisent BullMQ
  qui persiste les jobs dans Redis
- **Évolution** : Si besoin de persistence eventuelle, migration vers
  Redis Streams ou RabbitMQ possible sans changer les émetteurs (seuls les
  handlers changent)
