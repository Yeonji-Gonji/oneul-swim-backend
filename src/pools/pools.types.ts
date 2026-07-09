/**
 * 프론트 data/pools.json 과 동일한 계약(shape) 타입.
 * GET /pools 는 이 shape 를 무변환으로 프론트에 돌려준다.
 */

/** 요금표: 전액(full)/반액(half) 각각 대상 라벨 → 금액 */
export interface FeeTiers {
  full: Record<string, number>;
  half: Record<string, number>;
}

/** pools.json 의 pool 한 건 (계약 필드). freeSwim/lessons 는 원본 JSON 그대로 */
export interface PoolRecord {
  id: string;
  name: string;
  region: string;
  operator: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  laneInfo: string;
  notice: string;
  websiteUrl: string;
  sourceUrl: string;
  updatedAt: string;
  freeSwim: unknown;
  lessons: unknown;
}

/** 파일/응답 최상위 shape */
export interface PoolsPayload {
  _meta?: Record<string, unknown>;
  freeSwimPriceTiers: FeeTiers;
  pools: PoolRecord[];
}

/** DB FeeTier 행 (계약과 무관한 부분 집합) */
export interface FeeTierRow {
  tier: string;
  target: string;
  price: number;
}
