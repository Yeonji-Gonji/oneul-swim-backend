import {
  assemblePoolsPayload,
  buildFeeTiers,
  flattenFeeTiers,
  projectPool,
} from '../src/pools/pools.assembler';
import { FeeTierRow } from '../src/pools/pools.types';

const feeRows: FeeTierRow[] = [
  { tier: 'full', target: '성인', price: 3300 },
  { tier: 'full', target: '청소년', price: 2750 },
  { tier: 'half', target: '성인', price: 1650 },
];

const dbPoolRow = {
  id: 'hanam-misa',
  name: '하남종합운동장 국민체육센터',
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
  // 운영 전용 컬럼 — 응답에서 제외되어야 한다
  createdAt: new Date('2026-06-01'),
  dbUpdatedAt: new Date('2026-06-02'),
};

describe('buildFeeTiers', () => {
  it('행들을 full/half 요금표로 재조립한다', () => {
    expect(buildFeeTiers(feeRows)).toEqual({
      full: { 성인: 3300, 청소년: 2750 },
      half: { 성인: 1650 },
    });
  });

  it('알 수 없는 tier 는 무시한다', () => {
    const tiers = buildFeeTiers([
      ...feeRows,
      { tier: 'quarter', target: '성인', price: 100 },
    ]);
    expect(tiers).not.toHaveProperty(['quarter' as keyof typeof tiers]);
    expect(Object.keys(tiers)).toEqual(['full', 'half']);
  });

  it('빈 배열이면 빈 full/half 를 만든다', () => {
    expect(buildFeeTiers([])).toEqual({ full: {}, half: {} });
  });
});

describe('projectPool', () => {
  it('계약 필드 15개만 남기고 운영 컬럼은 제거한다', () => {
    const projected = projectPool(dbPoolRow);
    expect(Object.keys(projected).sort()).toEqual(
      [
        'address',
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
        'sourceUrl',
        'updatedAt',
        'websiteUrl',
      ].sort(),
    );
    expect(projected).not.toHaveProperty('createdAt');
    expect(projected).not.toHaveProperty('dbUpdatedAt');
    expect(projected.updatedAt).toBe('2026-06-01'); // 문자열 날짜 그대로
  });
});

describe('assemblePoolsPayload', () => {
  it('프론트 계약 shape 로 조립하고 _meta.source 를 표기한다', () => {
    const payload = assemblePoolsPayload([dbPoolRow], feeRows, 'db');
    expect(payload._meta).toEqual({ source: 'db' });
    expect(payload.freeSwimPriceTiers.full.성인).toBe(3300);
    expect(payload.pools).toHaveLength(1);
    expect(payload.pools[0].id).toBe('hanam-misa');
    expect(payload.pools[0]).not.toHaveProperty('dbUpdatedAt');
  });

  it('source 파라미터가 그대로 _meta 에 실린다', () => {
    const payload = assemblePoolsPayload([], [], 'file');
    expect(payload._meta).toEqual({ source: 'file' });
    expect(payload.pools).toEqual([]);
  });
});

describe('flattenFeeTiers', () => {
  it('요금표를 DB 행 배열로 평탄화한다(왕복 일관성)', () => {
    const tiers = { full: { 성인: 3300 }, half: { 성인: 1650 } };
    const rows = flattenFeeTiers(tiers);
    expect(rows).toEqual([
      { tier: 'full', target: '성인', price: 3300 },
      { tier: 'half', target: '성인', price: 1650 },
    ]);
    // flatten → build 왕복 시 원본과 동일
    expect(buildFeeTiers(rows)).toEqual(tiers);
  });
});
