import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';

describe('PaymentsService - Sprint 5 (commission)', () => {
  let service: PaymentsService;
  let prisma: {
    driver: { findUnique: jest.Mock; update: jest.Mock };
    commissionPayment: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let commissions: { markCommissionPaid: jest.Mock };
  let broadcast: { emitToDriver: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const userId = 'user-1';
  const driverId = 'driver-1';

  beforeEach(() => {
    prisma = {
      driver: {
        findUnique: jest.fn().mockResolvedValue({ id: driverId, userId }),
        update: jest.fn(),
      },
      commissionPayment: {
        create: jest.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
          id: 'payment-1',
          ...args.data,
        })),
        update: jest.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
          id: 'payment-1',
          driverId,
          amount: 5000,
          ...args.data,
        })),
        findUnique: jest.fn(),
      },
    };
    commissions = { markCommissionPaid: jest.fn() };
    broadcast = { emitToDriver: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    service = new PaymentsService(
      prisma as unknown as never,
      new MockPaymentProvider(),
      commissions as unknown as never,
      broadcast as unknown as never,
      eventEmitter as unknown as never,
    );
  });

  describe('payCommission (mock provider = succes synchrone)', () => {
    it('rejette si le profil chauffeur est introuvable', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);
      await expect(
        service.payCommission(userId, { amount: 5000, phoneNumber: '+221770000000' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('cree le paiement, le confirme immediatement et decremente commissionDue', async () => {
      const result = await service.payCommission(userId, {
        amount: 5000,
        phoneNumber: '+221770000000',
      });
      expect(result.status).toBe('succeeded');
      expect(result.transactionRef).toMatch(/^MOCK-/);
      expect(commissions.markCommissionPaid).toHaveBeenCalledWith(driverId, 5000);
      expect(broadcast.emitToDriver).toHaveBeenCalledWith(
        driverId,
        'payment:confirmed',
        expect.objectContaining({ amount: 5000 }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'commission.paid',
        expect.objectContaining({ driverId, amount: 5000 }),
      );
    });
  });

  describe('handleWebhook (idempotence)', () => {
    it('ignore un webhook replay (deja succeeded) sans re-decrementer', async () => {
      prisma.commissionPayment.findUnique.mockResolvedValue({
        id: 'payment-1',
        driverId,
        amount: 5000,
        status: 'succeeded',
      });
      // Le mock provider ne valide pas les webhooks -> on teste via un faux provider
      const fakeProvider = {
        initiate: jest.fn(),
        verifyWebhook: jest.fn().mockReturnValue({
          valid: true,
          transactionRef: 'TX-1',
          status: 'succeeded',
        }),
      };
      const svc = new PaymentsService(
        prisma as unknown as never,
        fakeProvider as never,
        commissions as unknown as never,
        broadcast as unknown as never,
        eventEmitter as unknown as never,
      );
      const result = await svc.handleWebhook({}, 'sig');
      expect(result.processed).toBe(false);
      expect(result.reason).toBe('already_processed');
      expect(commissions.markCommissionPaid).not.toHaveBeenCalled();
    });

    it('rejette un webhook a signature invalide', async () => {
      const result = await service.handleWebhook({}, 'bad-sig');
      expect(result.processed).toBe(false);
      expect(prisma.commissionPayment.update).not.toHaveBeenCalled();
    });
  });
});
