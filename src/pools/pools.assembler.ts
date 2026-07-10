/**
 * GET /pools 응답 조립 — 순수 함수(테스트 대상).
 * DB Pool 행을 프론트 계약 shape 로 재조립한다.
 */
import { FeeTiers, PoolRecord, PoolsPayload } from './pools.types';

/** 계약에 포함되는 Pool 필드(운영용 createdAt/dbUpdatedAt 등은 제외) */
const POOL_KEYS: (keyof PoolRecord)[] = [
  'id',
  'name',
  'sido',
  'sigungu',
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
  'fees',
  'dataStatus',
];

/** DB 행에서 계약 필드만 뽑아낸다(운영 전용 컬럼 누출 방지) */
export function projectPool(row: Record<string, unknown>): PoolRecord {
  const out = {} as Record<string, unknown>;
  for (const key of POOL_KEYS) {
    out[key] = row[key];
  }
  return out as unknown as PoolRecord;
}

/** 빈 요금표 */
function emptyFeeTiers(): FeeTiers {
  return { full: {}, half: {} };
}

/**
 * 프론트 무중단 이행용 top-level 요금표(호환).
 * 요금이 있는 첫 pool 의 fees 를 대표값으로 싣는다. Phase 3 이후 제거 예정.
 */
export function deriveCompatFeeTiers(pools: PoolRecord[]): FeeTiers {
  for (const p of pools) {
    const f = p.fees;
    if (f && (Object.keys(f.full ?? {}).length || Object.keys(f.half ?? {}).length)) {
      return { full: f.full ?? {}, half: f.half ?? {} };
    }
  }
  return emptyFeeTiers();
}

/**
 * Pool 행을 프론트 계약 shape 로 조립.
 * @param source 'db' | 'file' — 응답 _meta.source 로 표기
 */
export function assemblePoolsPayload(
  poolRows: Record<string, unknown>[],
  source: 'db' | 'file',
): PoolsPayload {
  const pools = poolRows.map(projectPool);
  return {
    _meta: { source },
    freeSwimPriceTiers: deriveCompatFeeTiers(pools),
    pools,
  };
}
