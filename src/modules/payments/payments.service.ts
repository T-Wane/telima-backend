import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from './providers/payment-provider.interface';
import { PayCommissionDto } from './dto/pay-commission.dto';
import { CommissionsService } from '../commissions/commissions.service';
import { BroadcastService } from '../events/services/broadcast.service';
import { WsEvents } from '../events/events.constants';
import { DomainEvents } from '../domain-events/domain-events.constants';

// Orchestration des paiements de commission (Sprint 5).
// Flux : POST /payments/commission -> initiation provider -> CommissionPayment cree
// (statut pending ou succeeded selon provider) -> confirmation (synchrone mock ou
// webhook Orange Money) -> commission.paid + decrementation commissionDue.
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly commissions: CommissionsService,
    private readonly broadcast: BroadcastService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Initiation d'un paiement de commission par le chauffeur.
  async payCommission(userId: string, dto: PayCommissionDto) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });
    if (!driver) {
      throw new NotFoundException('Profil chauffeur introuvable');
    }

    const payment = await this.prisma.commissionPayment.create({
      data: { driverId: driver.id, amount: dto.amount, status: 'pending' },
    });

    const result = await this.paymentProvider.initiate({
      amount: dto.amount,
      phoneNumber: dto.phoneNumber,
      internalRef: payment.id,
      description: 'Paiement commission Telima',
    });

    const updated = await this.prisma.commissionPayment.update({
      where: { id: payment.id },
      data: {
        transactionRef: result.transactionRef,
        status: result.status === 'succeeded' ? 'succeeded' : result.status === 'failed' ? 'failed' : 'pending',
        paidAt: result.status === 'succeeded' ? new Date() : null,
      },
    });

    // Confirmation synchrone (mock) : appliquer immediatement la reconciliation.
    if (result.status === 'succeeded') {
      await this.applyPaymentSuccess(updated.id, driver.id, dto.amount, result.transactionRef);
    }

    return {
      paymentId: updated.id,
      transactionRef: result.transactionRef,
      status: updated.status,
      amount: Number(updated.amount),
    };
  }

  // Webhook Orange Money (public, signature verifiee). Idempotent : si la
  // transactionRef est deja en statut succeeded, on ignore (replay webhook).
  async handleWebhook(payload: Record<string, unknown>, signature?: string) {
    const verification = this.paymentProvider.verifyWebhook(payload, signature);
    if (!verification.valid || !verification.transactionRef) {
      this.logger.warn('Webhook Orange Money rejete (signature invalide ou payload incomplet)');
      return { received: true, processed: false };
    }

    const payment = await this.prisma.commissionPayment.findUnique({
      where: { transactionRef: verification.transactionRef },
    });
    if (!payment) {
      this.logger.warn(`Webhook: transactionRef inconnue ${verification.transactionRef}`);
      return { received: true, processed: false };
    }
    // Idempotence : un webhook rejoue ne doit pas re-decrementer la commission.
    if (payment.status === 'succeeded') {
      this.logger.log(`Webhook replay ignore (deja succeeded) : ${verification.transactionRef}`);
      return { received: true, processed: false, reason: 'already_processed' };
    }

    const newStatus = verification.status === 'succeeded' ? 'succeeded' : 'failed';
    await this.prisma.commissionPayment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paidAt: newStatus === 'succeeded' ? new Date() : null,
      },
    });

    if (newStatus === 'succeeded') {
      await this.applyPaymentSuccess(
        payment.id,
        payment.driverId,
        Number(payment.amount),
        verification.transactionRef,
      );
    }
    return { received: true, processed: true, status: newStatus };
  }

  // Post-confirmation : decremente commissionDue, emet commission.paid + payment.succeeded.
  private async applyPaymentSuccess(
    paymentId: string,
    driverId: string,
    amount: number,
    transactionRef: string,
  ) {
    await this.commissions.markCommissionPaid(driverId, amount);
    this.broadcast.emitToDriver(driverId, WsEvents.PaymentConfirmed, {
      transactionId: transactionRef,
      amount,
      driverId,
    });
    this.eventEmitter.emit(DomainEvents.CommissionPaid, { paymentId, driverId, amount });
    this.eventEmitter.emit(DomainEvents.PaymentSucceeded, {
      transactionRef,
      amount,
      driverId,
    });
    this.logger.log(`Paiement ${transactionRef} confirme : ${amount} FCFA (driver ${driverId})`);
  }
}
