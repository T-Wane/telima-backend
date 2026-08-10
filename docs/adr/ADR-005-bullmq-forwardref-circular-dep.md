# ADR-005 : Résolution dépendance circulaire Queue ↔ Dispatch par forwardRef

## Statut
Accepté

## Contexte
Le module Dispatch a besoin de QueueService pour planifier des timeouts
(`queueService.scheduleDispatchTimeout`). Le module Queue a besoin de
DispatchService pour traiter les timeouts (`dispatchService.handleTimeout`).

Cela crée une dépendance circulaire : DispatchModule → QueueModule → DispatchModule.

## Alternatives considérées

1. **Fusionner Queue et Dispatch dans un seul module**
   - Avantage : Pas de dépendance circulaire
   - Inconvénient : Violation du principe de responsabilité unique, module trop gros

2. **Extraire l'interface du handler de timeout**
   - Avantage : Découplage par interface
   - Inconvénient : NestJS ne supporte pas naturellement l'injection d'interface
     sans token explicite, complexité ajoutée

3. **forwardRef() des deux côtés**
   - Avantage : Solution idiomatique NestJS, garde les modules séparés
   - Inconvénient : Léger code smell (dépendance circulaire), mais c'est le
     pattern recommandé par NestJS pour ce cas

4. **Event-driven : Queue émet un event au lieu d'appeler Dispatch**
   - Avantage : Découplage total
   - Inconvénient : Le handler de timeout doit être synchrone (mise à jour du
     statut du trip), un event introduit de l'async non contrôlé

## Décision retenue

Option 3 : `forwardRef()` des deux côtés.

```typescript
@Module({
  imports: [forwardRef(() => QueueModule), ...],
  exports: [DispatchService],
})
export class DispatchModule {}

@Module({
  imports: [forwardRef(() => DispatchModule), ...],
  exports: [QueueService],
})
export class QueueModule {}
```

## Conséquences

- **Positive** : Modules séparés, responsabilités claires, solution idiomatique NestJS
- **Négative** : Dépendance circulaire explicite — code smell acceptable mais à surveiller
- **Mitigation** : Documentée dans ARCHITECTURE.md, justifiée par la nature
  intrinsèquement couplée du dispatch timeout
- **Évolution** : Si d'autres queues sont ajoutées (notifications, payments),
  elles n'auront pas de dépendance circulaire avec Dispatch
