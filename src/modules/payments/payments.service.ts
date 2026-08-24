import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider.interface';
import { PayCommissionDto } from './dto/pay-commission.dto';
import { CommissionsService } from '../commissions/commissions.service';
import { BroadcastService } from '../events/services/broadcast.service';
import { WsEvents } from '../events/events.constants';
import { DomainEvents } from '../domain-events/domain-events.constants';

// Orchestration des paiements de commission (Sprint 5).
// Flux : POST /payments/commission -> initiation provider -> CommissionPayment cree
// (statut pending) -> confirmation via webhook Orange Money (notif_token verifie)
// -> commission.paid + decrementation commissionDue.
//
// Orange Money WebPay : le provider retourne payment_url + notif_token.
// Le webhook Orange contient { status, notif_token, txnid }.
// La reconciliation se fait par notif_token (compare avec celui stocke a l'initiation).
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
        orderId: result.orderId ?? null,
        notifToken: result.notifToken ?? null,
        paymentUrl: result.paymentUrl ?? null,
        status:
          result.status === 'succeeded'
            ? 'succeeded'
            : result.status === 'failed'
              ? 'failed'
              : 'pending',
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
      orderId: result.orderId ?? null,
      status: updated.status,
      amount: Number(updated.amount),
      paymentUrl: result.paymentUrl ?? null,
    };
  }

  // Webhook Orange Money (public, notif_token verifie). Idempotent : si la
  // transaction est deja en statut succeeded, on ignore (replay webhook).
  async handleWebhook(payload: Record<string, unknown>, signature?: string) {
    const verification = this.paymentProvider.verifyWebhook(payload, signature);
    if (!verification.valid) {
      this.logger.warn('Webhook Orange Money rejete (payload invalide ou incomplet)');
      return { received: true, processed: false };
    }

    // Reconciliation par notif_token (Orange Money WebPay).
    // Le webhook contient { status, notif_token, txnid } mais pas d'order_id.
    let payment = null as any;
    if (verification.notifToken) {
      payment = await this.prisma.commissionPayment.findFirst({
        where: { notifToken: verification.notifToken },
      });
    }

    // Fallback : si pas de notifToken, essayer par transactionRef (pay_token).
    if (!payment && verification.transactionRef) {
      payment = await this.prisma.commissionPayment.findUnique({
        where: { transactionRef: verification.transactionRef },
      });
    }

    // Fallback : par orderId si present dans le payload.
    if (!payment && verification.orderId) {
      payment = await this.prisma.commissionPayment.findUnique({
        where: { orderId: verification.orderId },
      });
    }

    if (!payment) {
      this.logger.warn(
        `Webhook: transaction introuvable (notifToken=${verification.notifToken?.substring(0, 8)}... ref=${verification.transactionRef})`,
      );
      return { received: true, processed: false };
    }

    // Idempotence : un webhook rejoue ne doit pas re-decrementer la commission.
    if (payment.status === 'succeeded') {
      this.logger.log(`Webhook replay ignore (deja succeeded) : ${payment.id}`);
      return { received: true, processed: false, reason: 'already_processed' };
    }

    const newStatus =
      verification.status === 'succeeded'
        ? 'succeeded'
        : verification.status === 'expired'
          ? 'expired'
          : 'failed';

    await this.prisma.commissionPayment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        txnid: verification.txnid ?? null,
        paidAt: newStatus === 'succeeded' ? new Date() : null,
      },
    });

    if (newStatus === 'succeeded') {
      await this.applyPaymentSuccess(
        payment.id,
        payment.driverId,
        Number(payment.amount),
        payment.transactionRef ?? verification.transactionRef ?? verification.notifToken ?? '',
      );
    }
    return { received: true, processed: true, status: newStatus };
  }

  // Polling de statut de secours : interroge l'API Transaction Status d'Orange
  // si le webhook n'est pas arrive. Utilise par l'endpoint GET /payments/commission/:id/status.
  async checkPaymentStatus(paymentId: string, userId: string) {
    const payment = await this.prisma.commissionPayment.findUnique({
      where: { id: paymentId },
      include: { driver: { select: { userId: true } } },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (payment.driver.userId !== userId) throw new NotFoundException('Paiement introuvable');

    // Si statut terminal, retourner sans appel API.
    if (['succeeded', 'failed', 'expired'].includes(payment.status)) {
      return { status: payment.status, payment };
    }

    // Si le provider supporte le polling de statut, l'interroger.
    if (
      this.paymentProvider.checkTransactionStatus &&
      payment.transactionRef &&
      payment.orderId
    ) {
      try {
        const result = await this.paymentProvider.checkTransactionStatus(
          payment.transactionRef,
          payment.orderId,
          Number(payment.amount),
        );

        if (result.status !== 'pending') {
          const newStatus = result.status;
          await this.prisma.commissionPayment.update({
            where: { id: payment.id },
            data: {
              status: newStatus,
              txnid: result.txnid ?? payment.txnid ?? null,
              paidAt: newStatus === 'succeeded' ? new Date() : null,
            },
          });

          if (newStatus === 'succeeded') {
            await this.applyPaymentSuccess(
              payment.id,
              payment.driverId,
              Number(payment.amount),
              payment.transactionRef ?? '',
            );
          }
          return { status: newStatus, payment: { ...payment, status: newStatus } };
        }
      } catch (err: any) {
        this.logger.warn(
          `Polling status echec pour ${paymentId}: ${err?.message ?? String(err)}`,
        );
      }
    }

    return { status: payment.status, payment };
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
