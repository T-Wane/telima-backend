# ADR-012 : Fournisseur SMS sendtext.sn (remplace Africa's Talking)

## Statut

Accepté — 2026-08-03

## Contexte

La décision Sprint 1 initiale prévoyait Africa's Talking comme fournisseur SMS pour l'envoi
des OTP, avec un `MockSmsProvider` actif en attendant les credentials. Les credentials
Africa's Talking n'ont jamais été obtenus. L'exploitant a retenu **sendtext.sn**
(fournisseur sénégalais couvrant le Mali) et fourni un couple `API KEY` / `API SECRET`
ainsi que le sender name `Telima`.

La documentation publique de sendtext.sn est une SPA inexploitable côté serveur.
Le mécanisme d'authentification a donc été **confirmé par sondes live** sur
`POST https://api.sendtext.sn/v1/sms/ml` :

- Sans credentials : HTTP 401 `{"Message":"Unauthorized"}`.
- Schémas écartés par test : Bearer, Basic auth, `apikey`/`apisecret`, `X-API-KEY`,
  `api-key`/`api-secret`, body `api_key`/`api_secret`, query params.
- **Schéma retenu (validé) : headers `snt-api-key` / `snt-api-secret`.**
  Avec ces headers, l'API répond une erreur métier (`apiCode`/`apiMsg`) au lieu de 401.
- Succès : `{ statusId: 1, messageId: "...", msgStatus: "Sent" }`.
- Format numéro : `223XXXXXXXX` (indicatif sans `+`).
- Rate limit exposé : `X-RateLimit-Limit: 700`.

## Décision

1. `SendtextSmsProvider` implémente l'interface `SmsProvider` (inchangée dans son principe,
   enrichie : `sendOtp` retourne désormais `SmsSendResult { messageId? }`).
2. Sélection via `SMS_PROVIDER=sendtext` ; `mock` reste disponible pour dev/test.
3. `AfricasTalkingSmsProvider` est **supprimé** (abandon définitif du fournisseur).
4. Le `messageId` retourné est persisté sur `otp_codes.sms_message_id` (migration
   `20260803145002_add_otp_sms_message_id`) pour traçabilité et support.
5. En cas d'échec fournisseur (réseau, timeout 10 s, HTTP non-2xx, refus métier) :
   l'enregistrement OTP est supprimé (**aucune pénalité** : ni cooldown, ni compteur de
   tentatives) et l'API retourne **HTTP 503**.
6. Le code OTP n'est **jamais journalisé** par ce provider (seuls numéro, apiCode/apiMsg
   et messageId le sont).
7. Variables d'environnement : `SENDTEXT_API_KEY`, `SENDTEXT_API_SECRET`,
   `SENDTEXT_SENDER_NAME` (défaut `Telima`), `SENDTEXT_API_URL` (défaut endpoint v1).
   Clés dans `.env` uniquement — jamais dans le code, les docs ou les commits.

## Alternatives écartées

- **Africa's Talking** : credentials jamais obtenus ; décision d'exploitation en faveur
  de sendtext.sn.
- **Terminer l'implémentation quand même "au cas où"** : du code mort non testé violerait
  la règle "zéro stub silencieux".
- **Auth Bearer/Basic supposée d'après des conventions** : contredite par les sondes live ;
  ne pas deviner l'auth d'un tiers.

## Conséquences

- Le flux OTP est réellement opérationnel de bout en bout (sendtext.sn configuré et testé).
- L'interface `SmsProvider` reste le seul point d'extension : un changement futur de
  fournisseur ne touche que `src/modules/sms/`.
- Les tests existants (`auth.service.spec.ts`, e2e auth) continuent de passer avec
  `MockSmsProvider` sans modification de la logique métier.
