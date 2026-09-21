import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';

// Pages de redirection Orange Money WebPay (OM_RETURN_URL / OM_CANCEL_URL).
// Hors prefixe /v1 (VERSION_NEUTRAL) car Orange redirige vers ces URLs
// exactes, configurees telles quelles cote .env. La webview de l'app
// intercepte normalement cette navigation avant qu'elle n'arrive ici (cf.
// OrangePaymentWebviewScreen), mais ces pages evitent un 404 dans les cas ou
// l'interception cote client n'a pas le temps de jouer (audit 2026-09-19).
@ApiExcludeController()
@Controller({ path: 'payment', version: VERSION_NEUTRAL })
export class PaymentPagesController {
  @Public()
  @Get('success')
  success(@Res() res: Response): void {
    res.type('html').send(renderPage('Paiement reussi', 'Votre paiement a ete confirme. Vous pouvez revenir a l\'application Telima.'));
  }

  @Public()
  @Get('cancel')
  cancel(@Res() res: Response): void {
    res.type('html').send(renderPage('Paiement annule', 'Ce paiement a ete annule. Vous pouvez revenir a l\'application Telima.'));
  }
}

function renderPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Telima — ${title}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; color: #1a1a1a; }
  .card { text-align: center; padding: 32px; max-width: 400px; }
  h1 { font-size: 20px; margin-bottom: 8px; }
  p { color: #666; font-size: 15px; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
