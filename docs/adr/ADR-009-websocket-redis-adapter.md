# ADR-009 : Redis adapter Socket.io pour scaling multi-instance

## Statut
Accepté

## Contexte
Le module Events (WebSocket) doit supporter plusieurs instances du backend
derrière un load balancer (scaling horizontal). Sans mécanisme de partage,
un client connecté à l'instance A ne recevra pas les messages émis sur l'instance B.

Doc2 impose : "Redis Adapter Socket.io dès le Sprint 1 — CRITIQUE pour le scaling".

## Alternatives considérées

1. **Sticky sessions (load balancer)**
   - Avantage : Pas de modification du code
   - Inconvénient : Si l'instance tombe, le client doit se reconnecter à une autre,
     perte d'état. Ne scale pas bien avec WebSocket (longues connexions).

2. **Redis pub/sub adapter (@socket.io/redis-adapter)**
   - Avantage : Partage des rooms et des événements entre instances via Redis
     pub/sub, transparent pour le code applicatif
   - Inconvénient : Redis doit être disponible, latence supplémentaire (pub/sub)

3. **Message broker externe (RabbitMQ, NATS)**
   - Avantage : Plus robuste, persistence possible
   - Inconvénient : Infrastructure supplémentaire, overkill pour des événements
     WebSocket éphémères

## Décision retenue

Option 2 : `@socket.io/redis-adapter` avec Redis.

**Configuration** :
- `pubClient` : connexion Redis dédiée pour publier
- `subClient` : connexion Redis dédiée pour souscrire (duplicate de la connexion principale)
- Les rooms, broadcasts et événements targetés sont automatiquement synchronisés

**Présence** : Le sorted set Redis `telima:driver:presence` est déjà partagé
entre instances (même connexion Redis). Les locks de dispatch sont également
partagés. Le scaling horizontal est donc entièrement supporté.

## Conséquences

- **Positive** : Scaling horizontal transparent, pas de sticky sessions nécessaires
- **Positive** : Rooms et broadcasts partagés entre toutes les instances
- **Négative** : Deux connexions Redis supplémentaires par instance (pub + sub)
- **Négative** : Si Redis tombe, les événements WebSocket inter-instance sont perdus
  (les événements intra-instance continuent de fonctionner)
- **Mitigation** : Redis est déjà un point critique pour les locks et la présence,
  la disponibilité de Redis est un prérequis pour le système
