import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripStatus, SenderRole } from '@prisma/client';

describe('TripsService - Sprint 3 (rating & payment-received)', () => {
  let service: TripsService;
  let tripRepo: {
    getTrip: jest.Mock;
    findById: jest.Mock;
    findDriverByUserId: jest.Mock;
    markPaymentReceived: jest.Mock;
    findRating: jest.Mock;
    createRating: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let dispatchService: {
    handleDriverAccept: jest.Mock;
    handleDriverDeclineAndRetry: jest.Mock;
  };

  const tripId = 'trip-1';
  const clientId = 'client-1';
  const driverUserId = 'driver-user-1';
  const driverId = 'driver-1';

  beforeEach(() => {
    tripRepo = {
      getTrip: jest.fn(),
      findById: jest.fn(),
      findDriverByUserId: jest.fn(),
      markPaymentReceived: jest.fn(async (id: string, amount: number) => ({
        id,
        paymentReceivedAmount: amount,
      })),
      findRating: jest.fn(),
      createRating: jest.fn(async (data: Record<string, unknown>) => ({ id: 'rating-1', ...data })),
    };
    eventEmitter = { emit: jest.fn() };
    dispatchService = {
      handleDriverAccept: jest.fn(),
      handleDriverDeclineAndRetry: jest.fn(),
    };

    // findById est utilisé par getTrip() en interne.
    tripRepo.findById.mockImplementation(async () => ({
      id: tripId,
      clientId,
      driverId,
      status: TripStatus.in_progress,
    }));

    service = new TripsService(
      tripRepo as unknown as never,
      {} as never, // PricingService non utilisé par ces méthodes
      dispatchService as unknown as never,
      {} as never, // BroadcastService non utilisé par ces méthodes
      eventEmitter as unknown as never,
    );
  });

  describe('declineTrip (REST)', () => {
    it('rejette si le profil chauffeur est introuvable', async () => {
      tripRepo.findDriverByUserId.mockResolvedValue(null);
      await expect(service.declineTrip(tripId, driverUserId)).rejects.toThrow(ForbiddenException);
    });

    it("rejette si la course n'est pas assignée à ce chauffeur (pas de tentative active)", async () => {
      tripRepo.findDriverByUserId.mockResolvedValue({ id: driverId });
      (tripRepo as Record<string, jest.Mock>).hasActiveDispatchAttempt = jest
        .fn()
        .mockResolvedValue(false);
      await expect(service.declineTrip(tripId, driverUserId)).rejects.toThrow(ForbiddenException);
      expect(dispatchService.handleDriverDeclineAndRetry).not.toHaveBeenCalled();
    });

    it('libère le verrou et relance le dispatch pour un chauffeur notifié', async () => {
      tripRepo.findDriverByUserId.mockResolvedValue({ id: driverId });
      (tripRepo as Record<string, jest.Mock>).hasActiveDispatchAttempt = jest
        .fn()
        .mockResolvedValue(true);
      const result = await service.declineTrip(tripId, driverUserId, 'trop loin');
      expect(dispatchService.handleDriverDeclineAndRetry).toHaveBeenCalledWith(tripId, driverId);
      expect(result).toEqual({ tripId, declined: true });
    });
  });

  describe('confirmPaymentReceived', () => {
    it("rejette si le rôle n'est pas driver", async () => {
      await expect(
        service.confirmPaymentReceived(tripId, clientId, 'client', { amount: 1000 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejette si ce n'est pas le chauffeur assigné à la course", async () => {
      tripRepo.findDriverByUserId.mockResolvedValue({ id: 'other-driver' });
      await expect(
        service.confirmPaymentReceived(tripId, driverUserId, 'driver', { amount: 1000 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejette si le statut de la course n'est pas in_progress", async () => {
      tripRepo.findDriverByUserId.mockResolvedValue({ id: driverId });
      tripRepo.findById.mockResolvedValueOnce({
        id: tripId,
        clientId,
        driverId,
        status: TripStatus.completed,
      });
      await expect(
        service.confirmPaymentReceived(tripId, driverUserId, 'driver', { amount: 1000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('confirme le paiement pour le chauffeur assigné en in_progress', async () => {
      tripRepo.findDriverByUserId.mockResolvedValue({ id: driverId });
      const result = await service.confirmPaymentReceived(tripId, driverUserId, 'driver', {
        amount: 1500,
      });
      expect(tripRepo.markPaymentReceived).toHaveBeenCalledWith(tripId, 1500);
      expect(result.paymentReceivedAmount).toBe(1500);
    });
  });

  describe('rateTrip', () => {
    beforeEach(() => {
      tripRepo.findById.mockImplementation(async () => ({
        id: tripId,
        clientId,
        driverId,
        status: TripStatus.completed,
      }));
      tripRepo.findRating.mockResolvedValue(null);
    });

    it("rejette si la course n'est pas terminée", async () => {
      tripRepo.findById.mockResolvedValueOnce({
        id: tripId,
        clientId,
        driverId,
        status: TripStatus.in_progress,
      });
      tripRepo.findDriverByUserId.mockResolvedValue({ id: driverId });
      await expect(service.rateTrip(tripId, driverUserId, 'driver', { rating: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejette si le chauffeur n'est pas celui assigné", async () => {
      tripRepo.findDriverByUserId.mockResolvedValue({ id: 'other-driver' });
      await expect(service.rateTrip(tripId, driverUserId, 'driver', { rating: 5 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejette une double notation (contrainte unique tripId+raterId)', async () => {
      tripRepo.findDriverByUserId.mockResolvedValue({ id: driverId });
      tripRepo.findRating.mockResolvedValue({ id: 'existing-rating' });
      await expect(service.rateTrip(tripId, driverUserId, 'driver', { rating: 4 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('crée la notation et émet le domain event trip.rated', async () => {
      tripRepo.findDriverByUserId.mockResolvedValue({ id: driverId });
      const result = await service.rateTrip(tripId, driverUserId, 'driver', {
        rating: 5,
        tags: ['Courtois', 'Ponctuel'],
      });
      expect(tripRepo.createRating).toHaveBeenCalledWith({
        tripId,
        raterId: driverUserId,
        raterRole: SenderRole.driver,
        rating: 5,
        tags: ['Courtois', 'Ponctuel'],
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'trip.rated',
        expect.objectContaining({ tripId, raterId: driverUserId, rating: 5 }),
      );
      expect(result.id).toBe('rating-1');
    });
  });
});
