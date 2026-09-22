import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';

// Pages publiques CGU/Confidentialite, hors prefixe /v1 (VERSION_NEUTRAL) pour
// servir d'URL stable a fournir aux stores (Google Play "Politique de
// confidentialite") et aux partenaires. Contenu identique a celui affiche
// dans l'app (cf. telima/lib/features/profile/presentation/screens/tersm_screen.dart)
// pour eviter toute divergence entre la version in-app et la version web.
@ApiExcludeController()
@Controller({ path: 'legal', version: VERSION_NEUTRAL })
export class LegalPagesController {
  @Public()
  @Get('privacy')
  privacy(@Res() res: Response): void {
    res.type('html').send(renderLegalPage('Politique de confidentialite', privacySections));
  }

  @Public()
  @Get('terms')
  terms(@Res() res: Response): void {
    res.type('html').send(renderLegalPage('Conditions generales d\'utilisation', cguSections));
  }
}

interface Section {
  title: string;
  body: string;
}

const cguSections: Section[] = [
  {
    title: '1. Objet',
    body: "Les presentes Conditions Generales d'Utilisation (CGU) regissent l'utilisation de l'application Telima, une plateforme de mise en relation entre des clients et des chauffeurs pour le transport de personnes et la livraison de colis a Bamako et au Mali.",
  },
  {
    title: '2. Inscription',
    body: "Pour utiliser Telima, vous devez etre age(e) de 18 ans minimum et disposer d'un numero de telephone valide. L'inscription se fait par verification SMS (code OTP). Vous vous engagez a fournir des informations exactes et a les maintenir a jour.",
  },
  {
    title: '3. Services proposes',
    body: 'Telima propose deux types de services : (a) le transport de personnes (courses) et (b) la livraison de colis. Les tarifs sont calcules en fonction de la distance, du type de vehicule et des regles de tarification dynamique en vigueur.',
  },
  {
    title: '4. Paiement',
    body: "Le paiement des courses et livraisons s'effectue en especes (cash) directement aupres du chauffeur a la fin de la prestation, ou via Orange Money directement dans l'application. Le montant exact est affiche sur l'application avant confirmation et sur l'ecran de fin de course.",
  },
  {
    title: '5. Annulation',
    body: "Vous pouvez annuler une course gratuitement avant l'arrivee du chauffeur. Une fois le chauffeur arrive sur le lieu de prise en charge, des frais d'annulation peuvent etre factures.",
  },
  {
    title: '6. Responsabilite',
    body: "Telima agit en tant que plateforme de mise en relation. Telima n'est pas responsable du comportement des chauffeurs ou des clients. Les courses sont assurees par des chauffeurs independants verifies par Telima.",
  },
  {
    title: '7. Evaluation',
    body: "A la fin de chaque course, vous pouvez attribuer une note et des badges au chauffeur. Les evaluations contribuent a la qualite du service et peuvent influencer l'attribution des futures courses.",
  },
  {
    title: '8. Modifications',
    body: "Telima se reserve le droit de modifier les presentes CGU a tout moment. Les modifications entrent en vigueur des leur publication dans l'application.",
  },
];

const privacySections: Section[] = [
  {
    title: '1. Donnees collectees',
    body: "Telima collecte les donnees suivantes : votre numero de telephone, votre nom, votre adresse email (facultatif), vos adresses de course, votre position GPS pendant l'utilisation de l'application, et les donnees d'utilisation de l'application. Pour les chauffeurs, Telima collecte egalement les documents du vehicule et les pieces d'identite necessaires a la verification.",
  },
  {
    title: '2. Utilisation des donnees',
    body: "Vos donnees sont utilisees pour : (a) vous authentifier et gerer votre compte, (b) traiter vos demandes de course et de livraison, (c) afficher votre position sur la carte, (d) vous envoyer des notifications, (e) traiter vos paiements Orange Money, (f) ameliorer nos services.",
  },
  {
    title: '3. Partage des donnees',
    body: "Vos donnees sont partagees avec le chauffeur assigne uniquement dans le cadre de la prestation (nom, numero de telephone, position). Vos informations de paiement sont partagees avec Orange Money uniquement pour traiter la transaction. Telima ne vend ni ne loue vos donnees a des tiers.",
  },
  {
    title: '4. Securite',
    body: "Vos donnees sont stockees de maniere securisee. Les mots de passe et codes OTP sont hashes. Les communications sont chiffrees (HTTPS/WSS). Vos tokens d'authentification sont stockes de maniere securisee sur votre appareil.",
  },
  {
    title: '5. Conservation',
    body: "Vos donnees sont conservees pendant la duree d'utilisation du service et conservees apres la suppression de votre compte pour les obligations legales (facturation, litiges) pendant une duree maximale de 3 ans.",
  },
  {
    title: '6. Vos droits',
    body: "Vous disposez d'un droit d'acces, de rectification, de suppression et d'opposition au traitement de vos donnees. Pour exercer ces droits, contactez-nous a support@telima.ml.",
  },
  {
    title: '7. Cookies et traceurs',
    body: "L'application Telima n'utilise pas de cookies. Des identifiants techniques sont utilises pour le fonctionnement de l'application (session, notifications push).",
  },
];

function renderLegalPage(title: string, sections: Section[]): string {
  const sectionsHtml = sections
    .map((s) => `<section><h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.body)}</p></section>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Telima — ${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; background: #f5f5f5; color: #1a1a1a; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 40px 24px 80px; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  .updated { color: #888; font-size: 13px; margin-bottom: 32px; }
  section { margin-bottom: 28px; }
  h2 { font-size: 17px; margin-bottom: 8px; }
  p { color: #444; font-size: 15px; line-height: 1.6; margin: 0; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(title)}</h1>
    <p class="updated">Telima — Derniere mise a jour : 22 septembre 2026</p>
    ${sectionsHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
