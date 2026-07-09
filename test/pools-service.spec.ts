import { PoolsService } from '../src/pools/pools.service';

/** mock PrismaService 로 GET /pools 조립·폴백 경로를 검증 */
function makeService(pool: { findMany: jest.Mock }, feeTier: { findMany: jest.Mock }) {
  const prisma = { pool, feeTier } as unknown as ConstructorParameters<
    typeof PoolsService
  >[0];
  return new PoolsService(prisma);
}

describe('PoolsService.getPools', () => {
  it('DB 에 Pool 이 있으면 source=db 로 조립한다', async () => {
    const service = makeService(
      {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'hanam-misa',
            name: '미사',
            region: '미사',
            operator: '하남도시공사',
            phone: '031',
            address: '주소',
            lat: 1,
            lng: 2,
            laneInfo: '',
            notice: '',
            websiteUrl: '',
            sourceUrl: 'https://x',
            updatedAt: '2026-06-01',
            freeSwim: { sessions: [] },
            lessons: {},
            createdAt: new Date(),
            dbUpdatedAt: new Date(),
          },
        ]),
      },
      {
        findMany: jest
          .fn()
          .mockResolvedValue([{ tier: 'full', target: '성인', price: 3300 }]),
      },
    );
    const payload = await service.getPools();
    expect(payload._meta).toEqual({ source: 'db' });
    expect(payload.pools).toHaveLength(1);
    expect(payload.freeSwimPriceTiers.full.성인).toBe(3300);
    expect(payload.pools[0]).not.toHaveProperty('dbUpdatedAt');
  });

  it('DB 가 비어 있으면 파일 폴백(source=file)으로 돌려준다', async () => {
    const service = makeService(
      { findMany: jest.fn().mockResolvedValue([]) },
      { findMany: jest.fn().mockResolvedValue([]) },
    );
    const payload = await service.getPools();
    expect(payload._meta?.source).toBe('file');
    // 실제 data/pools.json 이 로드되므로 최소 1곳 이상
    expect(payload.pools.length).toBeGreaterThan(0);
    expect(payload.freeSwimPriceTiers).toHaveProperty('full');
  });

  it('DB 조회가 throw 하면 파일 폴백으로 견딘다', async () => {
    const service = makeService(
      { findMany: jest.fn().mockRejectedValue(new Error('db down')) },
      { findMany: jest.fn().mockRejectedValue(new Error('db down')) },
    );
    const payload = await service.getPools();
    expect(payload._meta?.source).toBe('file');
    expect(payload.pools.length).toBeGreaterThan(0);
  });
});
