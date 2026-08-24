import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { PayCommissionDto } from './dto/pay-commission.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('commission')
  @ApiBearerAuth()
  @Roles('driver')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Payer une commission (chauffeur, via Orange Money)' })
  @ApiResponse({ status: 201, description: 'Paiement initié (payment_url retournée pour webview)' })
  @ApiResponse({ status: 404, description: 'Profil chauffeur introuvable' })
  @ApiResponse({ status: 503, description: 'Provider de paiement non configuré' })
  payCommission(@CurrentUser() user: AuthenticatedUser, @Body() dto: PayCommissionDto) {
    return this.paymentsService.payCommission(user.id, dto);
  }

  // Polling de statut de secours : interroge l'API Transaction Status d'Orange
  // si le webhook n'est pas arrive. Le chauffeur appelle cet endpoint pendant
  // qu'il est sur la page de paiement.
  @Get('commission/:id/status')
  @ApiBearerAuth()
  @Roles('driver')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Vérifier le statut d\'un paiement de commission (polling de secours)' })
  @ApiResponse({ status: 200, description: 'Statut du paiement (pending/succeeded/failed/expired)' })
  @ApiResponse({ status: 404, description: 'Paiement introuvable' })
  checkPaymentStatus(
    @Param('id') paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.checkPaymentStatus(paymentId, user.id);
  }

  // Endpoint public appele par Orange Money. Pas de JWT ; le notif_token est
  // verifie par le provider (compare avec celui stocke a l'initiation).
  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook Orange Money (confirmation paiement, idempotent)' })
  @ApiResponse({ status: 200, description: 'Webhook reçu et traité (idempotent)' })
  handleWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-om-signature') signature?: string,
  ) {
    return this.paymentsService.handleWebhook(payload, signature);
  }
}
