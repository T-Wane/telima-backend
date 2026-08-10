# ADR-007 : Idempotence via Idempotency-Key + Redis

## Statut
Accepté

## Contexte
Les clients mobiles (Flutter) sur réseaux instables (Mali, 3G/4G) peuvent envoyer
des requêtes dupliquées : la requête part, le client ne reçoit pas la réponse
(timeout), il retry. Sans idempotence, cela peut créer des courses dupliquées
ou des transitions d'état incohérentes.

L'utilisateur a explicitement demandé "une stratégie globale d'idempotence
(Idempotency-Key) pour les endpoints sensibles".

## Alternatives considérées

1. **Idempotence au niveau base de données (contraintes uniques)**
   - Avantage : Garantie forte
   - Inconvénient : Difficile à mettre en œuvre pour des opérations multi-étapes
     (create trip + dispatch + broadcast), ne couvre pas les transitions d'état

2. **Idempotence via middleware Express (avant NestJS)**
   - Avantage : Simple, global
   - Inconvénient : Accès limité au contexte NestJS (DI, Reflector), difficile
     à tester avec l'écosystème NestJS

3. **Interceptor NestJS + Redis + décorateur @Idempotent()**
   - Avantage : Idiomatique NestJS, sélectif (décorateur), cache Redis partagé
     entre instances, testable
   - Inconvénient : Redis doit être disponible, TTL fini (pas de garantie
     d'idempotence au-delà de 5 minutes)

## Décision retenue

Option 3 : Interceptor NestJS global + Redis + décorateur `@Idempotent()`.

**Mécanisme** :
1. Client envoie header `Idempotency-Key: <uuid>` (optionnel)
2. Si l'endpoint est marqué `@Idempotent()` et la clé est présente :
   - Lock Redis `SET telima:idem:{key}:lock NX EX 300`
   - Si lock acquis : exécute la requête, cache la réponse, supprime le lock
   - Si lock échoue : vérifie le cache `telima:idem:{key}` → retourne la réponse
     cachée, sinon `409 Conflict` (requête en cours)
3. Sans header ou sans décorateur : transparent (no-op)

**Endpoints protégés** : `POST /trips`, `PATCH /trips/:id/status`
**Future** : `POST /payments/webhook` (Sprint 4, critique pour Orange Money)

## Conséquences

- **Positive** : Protection contre les doublons réseau, transparent pour les
  clients qui n'envoient pas le header
- **Positive** : Cache Redis partagé entre instances (scaling horizontal)
- **Négative** : TTL de 300s — une requête retry après 5 minutes sera re-exécutée
- **Négative** : La réponse cachée est stockée en JSON dans Redis (mémoire)
- **Mitigation** : 300s est largement supérieur aux timeouts réseau mobile (10-30s)
- **Évolution** : Pour les webhooks (Orange Money), le TTL pourrait être plus long
  (24h) car les webhooks peuvent être retryés par l'opérateur sur plusieurs heures
