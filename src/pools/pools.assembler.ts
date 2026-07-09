/**
 * GET /pools 응답 조립 — 순수 함수(테스트 대상).
 * DB Pool 행 + FeeTier 행을 프론트 계약 shape 로 재조립한다.
 */
import { FeeTierRow, FeeTiers, PoolRecord, PoolsPayload } from './pools.types';

/** 계약에 포함되는 Pool 필드(운영용 createdAt/dbUpdatedAt 등은 제외) */
const POOL_KEYS: (keyof PoolRecord)[] = [
  'id',
  'name',
  'region',
  'operator',
  'phone',
  'address',
  'lat',
  'lng',
  'laneInfo',
  'notice',
  'websiteUrl',
  'sourceUrl',
  'updatedAt',
  'freeSwim',
  'lessons',
];

/** DB 행에서 계약 필드만 뽑아낸다(운영 전용 컬럼 누출 방지) */
export function projectPool(row: Record<string, unknown>): PoolRecord {
  const out = {} as Record<string, unknown>;
  for (const key of POOL_KEYS) {
    out[key] = row[key];
  }
  return out as unknown as PoolRecord;
}

/** FeeTier 행들을 {full:{...}, half:{...}} 요금표로 재조립 */
export function buildFeeTiers(rows: FeeTierRow[]): FeeTiers {
  const tiers: FeeTiers = { full: {}, half: {} };
  for (const row of rows) {
    if (row.tier === 'full' || row.tier === 'half') {
      tiers[row.tier][row.target] = row.price;
    }
  }
  return tiers;
}

/**
 * Pool/FeeTier 행을 프론트 계약 shape 로 조립.
 * @param source 'db' | 'file' — 응답 _meta.source 로 표기
 */
export function assemblePoolsPayload(
  poolRows: Record<string, unknown>[],
  feeRows: FeeTierRow[],
  source: 'db' | 'file',
): PoolsPayload {
  return {
    _meta: { source },
    freeSwimPriceTiers: buildFeeTiers(feeRows),
    pools: poolRows.map(projectPool),
  };
}

/** FeeTiers 요금표를 DB 저장용 FeeTier 행 배열로 평탄화 */
export function flattenFeeTiers(tiers: FeeTiers): FeeTierRow[] {
  const rows: FeeTierRow[] = [];
  (['full', 'half'] as const).forEach((tier) => {
    const group = tiers[tier] ?? {};
    for (const [target, price] of Object.entries(group)) {
      rows.push({ tier, target, price });
    }
  });
  return rows;
}
