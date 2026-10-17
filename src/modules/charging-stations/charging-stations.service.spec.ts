import { ChargingStationsService } from './charging-stations.service';

describe('ChargingStationsService.findAll', () => {
  it('borne la longitude avec le meme rayon de part et d autre', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ChargingStationsService({
      swapStation: { findMany },
    } as never);

    await service.findAll(12.6392, -8.0029, 5);

    const where = findMany.mock.calls[0][0].where;
    const lngDelta = 5 / (111 * Math.cos((12.6392 * Math.PI) / 180));
    expect(where.isActive).toBe(true);
    expect(where.lng.gte).toBeCloseTo(-8.0029 - lngDelta, 6);
    expect(where.lng.lte).toBeCloseTo(-8.0029 + lngDelta, 6);
    expect(where.lat.lte).toBeCloseTo(12.6392 + 5 / 111, 6);
  });

  it('sans position, liste toutes les stations actives', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ChargingStationsService({
      swapStation: { findMany },
    } as never);

    await service.findAll();

    expect(findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });
});
