import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
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
  @ApiResponse({ status: 201, description: 'Paiement initié (confirmation synchrone ou webhook)' })
  @ApiResponse({ status: 404, description: 'Profil chauffeur introuvable' })
  @ApiResponse({ status: 503, description: 'Provider de paiement non configuré' })
  payCommission(@CurrentUser() user: AuthenticatedUser, @Body() dto: PayCommissionDto) {
    return this.paymentsService.payCommission(user.id, dto);
  }

  // Endpoint public appele par Orange Money. Pas de JWT ; la signature HMAC du
  // header x-om-signature est verifiee par le provider (TODO production).
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
