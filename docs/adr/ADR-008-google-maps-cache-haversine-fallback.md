# ADR-008 : Optimisation coûts Google Maps — cache Redis + fallback Haversine

## Statut
Accepté

## Contexte
Le module Pricing utilise un `DistanceProvider` pour calculer la distance et la
durée entre deux points. L'implémentation Google Distance Matrix API coûte de
l'argent (0.01$ par requête au-delà du quota gratuit de 200$/mois).

Dans un contexte VTC, les mêmes trajets (même quartier → même destination) sont
fréquents. Sans cache, chaque création de course génère un appel API.

L'utilisateur a demandé de "vérifier que les appels Google Maps sont
systématiquement limités grâce à Redis et à un calcul local (Haversine)
lorsque cela est possible afin de maîtriser les coûts".

## Alternatives considérées

1. **Quota côté application (limiter le nombre d'appels/jour)**
   - Avantage : Simple
   - Inconvénient : Quand le quota est atteint, les courses ne peuvent plus
     être tarifées correctement

2. **Cache Redis uniquement (pas de fallback)**
   - Avantage : Réduit les appels API
   - Inconvénient : En cas d'échec API (quota, réseau), pas de solution de repli

3. **Cache Redis + fallback Haversine**
   - Avantage : Triple protection (cache → API → Haversine), toujours une réponse
   - Inconvénient : Haversine est moins précis (distance à vol d'oiseau, estimation
     vitesse moyenne)

4. **Toujours utiliser Haversine (pas de Google Maps)**
   - Avantage : Gratuit, pas de dépendance externe
   - Inconvénient : Précision insuffisante pour la tarification, contraire au cahier
     des charges (Google Distance Matrix requis)

## Décision retenue

Option 3 : Stratégie à trois niveaux.

```
Niveau 1: Cache Redis (TTL 1h, clé arrondie à 4 décimales)
Niveau 2: Appel Google Distance Matrix API
Niveau 3: Fallback Haversine (30 km/h, distance à vol d'oiseau)
```

Le résultat du fallback Haversine est également caché dans Redis pour éviter
de réessayer Google immédiatement après un échec.

**Mode motorcycle** : Google ne supporte pas ce mode. Correction appliquée sur
le mode `driving` : distance × 0.7, durée × 0.6.

## Conséquences

- **Positive** : Réduction drastique des appels API (hit rate cache > 70% estimé)
- **Positive** : Toujours une réponse, même en cas de panne Google
- **Positive** : Coûts maîtrisés (quota gratuit 200$/mois suffisant en V1)
- **Négative** : Haversine est moins précis (surestime distance, estimation durée
  grossière à 30 km/h)
- **Mitigation** : Le fallback n'est utilisé qu'en cas d'échec API, pas en régime
  normal. Les résultats Haversine sont loggés (warning) pour monitoring.
- **Évolution** : Ajouter des métriques Prometheus (`google_api_calls_total`
  avec labels hit/miss/fallback) pour suivre le hit rate et le taux de fallback
