import {
  assemblePoolsPayload,
  deriveCompatFeeTiers,
  projectPool,
} from '../src/pools/pools.assembler';
import { PoolRecord } from '../src/pools/pools.types';

const dbPoolRow = {
  id: 'hanam-misa',
  name: '하남종합운동장 국민체육센터',
  sido: '경기도',
  sigungu: '하남시',
  region: '미사',
  operator: '하남도시공사',
  phone: '031-790-2000',
  address: '경기도 하남시 아리수로 600',
  lat: 37.5670245,
  lng: 127.1953314,
  laneInfo: '25m / 50m 풀 보유',
  notice: '관외 200% 할증',
  websiteUrl: 'https://hanamsport.or.kr/wwwroot/ms/program/',
  sourceUrl: 'https://hanamsport.or.kr/wwwroot/ms/program/',
  updatedAt: '2026-06-01',
  freeSwim: { sessions: [] },
  lessons: { programs: [] },
  fees: { full: { 성인: 3300, 청소년: 2750 }, half: { 성인: 1650 } },
  dataStatus: 'full',
  // 운영 전용 컬럼 — 응답에서 제외되어야 한다
  createdAt: new Date('2026-06-01'),
  dbUpdatedAt: new Date('2026-06-02'),
};

describe('projectPool', () => {
  it('계약 필드만 남기고 운영 컬럼(createdAt/dbUpdatedAt)은 제거한다', () => {
    const projected = projectPool(dbPoolRow);
    expect(Object.keys(projected).sort()).toEqual(
      [
        'address',
        'dataStatus',
        'fees',
        'freeSwim',
        'id',
        'laneInfo',
        'lat',
        'lessons',
        'lng',
        'name',
        'notice',
        'operator',
        'phone',
        'region',
        'sido',
        'sigungu',
        'sourceUrl',
        'updatedAt',
        'websiteUrl',
      ].sort(),
    );
    expect(projected).not.toHaveProperty('createdAt');
    expect(projected).not.toHaveProperty('dbUpdatedAt');
    expect(projected.updatedAt).toBe('2026-06-01'); // 문자열 날짜 그대로
    expect(projected.fees?.full.성인).toBe(3300);
  });
});

describe('deriveCompatFeeTiers', () => {
  it('요금이 있는 첫 pool 의 fees 를 대표 요금표로 뽑는다', () => {
    const pools = [projectPool(dbPoolRow)];
    expect(deriveCompatFeeTiers(pools)).toEqual({
      full: { 성인: 3300, 청소년: 2750 },
      half: { 성인: 1650 },
    });
  });

  it('요금 있는 pool 이 없으면 빈 요금표를 만든다', () => {
    const listing = [
      { ...projectPool(dbPoolRow), fees: null } as PoolRecord,
    ];
    expect(deriveCompatFeeTiers(listing)).toEqual({ full: {}, half: {} });
  });
});

describe('assemblePoolsPayload', () => {
  it('프론트 계약 shape 로 조립하고 _meta.source 를 표기한다', () => {
    const payload = assemblePoolsPayload([dbPoolRow], 'db');
    expect(payload._meta).toEqual({ source: 'db' });
    // 무중단 이행용 top-level 호환 요금표
    expect(payload.freeSwimPriceTiers.full.성인).toBe(3300);
    expect(payload.pools).toHaveLength(1);
    expect(payload.pools[0].id).toBe('hanam-misa');
    expect(payload.pools[0].fees?.half.성인).toBe(1650);
    expect(payload.pools[0]).not.toHaveProperty('dbUpdatedAt');
  });

  it('빈 목록이면 빈 요금표와 빈 pools 를 돌려준다', () => {
    const payload = assemblePoolsPayload([], 'file');
    expect(payload._meta).toEqual({ source: 'file' });
    expect(payload.freeSwimPriceTiers).toEqual({ full: {}, half: {} });
    expect(payload.pools).toEqual([]);
  });
});
