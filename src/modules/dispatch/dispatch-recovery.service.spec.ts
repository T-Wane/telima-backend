import { DispatchRecoveryService } from './dispatch-recovery.service';

describe('DispatchRecoveryService — reprise des courses orphelines au boot', () => {
  let service: DispatchRecoveryService;
  let prisma: {
    trip: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let dispatch: {
    failTrip: jest.Mock;
    releaseLocksForTrip: jest.Mock;
    attemptDispatch: jest.Mock;
  };

  const recentDate = () => new Date(Date.now() - 30 * 1000); // 30 s
  const staleDate = () => new Date(Date.now() - 10 * 60 * 1000); // 10 min

  beforeEach(() => {
    prisma = {
      trip: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ lat: 14.7, lng: -17.4 }]),
    };
    dispatch = {
      failTrip: jest.fn(),
      releaseLocksForTrip: jest.fn().mockResolvedValue(undefined),
      attemptDispatch: jest.fn().mockResolvedValue(undefined),
    };
    const broadcast = { emitToTrip: jest.fn() };
    service = new DispatchRecoveryService(
      prisma as unknown as never,
      dispatch as unknown as never,
      broadcast as unknown as never,
    );
  });

  it('ne fait rien quand aucune course pending', async () => {
    await service.run();
    expect(dispatch.failTrip).not.toHaveBeenCalled();
    expect(dispatch.attemptDispatch).not.toHaveBeenCalled();
  });

  it('relance le dispatch pour une course pending recente', async () => {
    prisma.trip.findMany.mockResolvedValue([
      { id: 't1', serviceType: 'ride', vehicleTypeId: 'vt1', createdAt: recentDate() },
    ]);

    await service.run();

    expect(dispatch.releaseLocksForTrip).toHaveBeenCalledWith('t1');
    expect(dispatch.attemptDispatch).toHaveBeenCalledWith(
      't1',
      { lat: 14.7, lng: -17.4 },
      'ride',
      'vt1',
    );
    expect(dispatch.failTrip).not.toHaveBeenCalled();
  });

  it('annule automatiquement une course pending trop ancienne', async () => {
    prisma.trip.findMany.mockResolvedValue([
      { id: 't2', serviceType: 'delivery', vehicleTypeId: 'vt2', createdAt: staleDate() },
    ]);

    await service.run();

    expect(dispatch.failTrip).toHaveBeenCalledWith('t2', 'server_restarted');
    expect(dispatch.attemptDispatch).not.toHaveBeenCalled();
  });

  it('annule une course recente sans coordonnees pickup exploitables', async () => {
    prisma.trip.findMany.mockResolvedValue([
      { id: 't3', serviceType: 'ride', vehicleTypeId: 'vt3', createdAt: recentDate() },
    ]);
    prisma.$queryRaw.mockResolvedValue([]);

    await service.run();

    expect(dispatch.failTrip).toHaveBeenCalledWith('t3', 'server_restarted');
    expect(dispatch.attemptDispatch).not.toHaveBeenCalled();
  });

  it('ne leve pas si le scan DB echoue', async () => {
    prisma.trip.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.run()).resolves.toBeUndefined();
    expect(dispatch.failTrip).not.toHaveBeenCalled();
  });

  it("poursuit le balayage si la reprise d'une course echoue", async () => {
    prisma.trip.findMany.mockResolvedValue([
      { id: 'bad', serviceType: 'ride', vehicleTypeId: 'vt1', createdAt: recentDate() },
      { id: 'good', serviceType: 'ride', vehicleTypeId: 'vt1', createdAt: staleDate() },
    ]);
    dispatch.releaseLocksForTrip.mockRejectedValueOnce(new Error('redis blip'));

    await service.run();

    // 'bad' a echoue mais 'good' (ancienne) est quand meme traitee
    expect(dispatch.failTrip).toHaveBeenCalledWith('good', 'server_restarted');
  });
});
