/**
 * 프론트 data/pools.json 과 동일한 계약(shape) 타입.
 * GET /pools 는 이 shape 를 무변환으로 프론트에 돌려준다.
 */

/** 요금표: 전액(full)/반액(half) 각각 대상 라벨 → 금액 */
export interface FeeTiers {
  full: Record<string, number>;
  half: Record<string, number>;
}

/** pools.json 의 pool 한 건 (계약 필드). freeSwim/lessons/fees 는 원본 JSON 그대로 */
export interface PoolRecord {
  id: string;
  name: string;
  /** 광역(시도)/기초(시군구) — 전국 필터 기준 */
  sido?: string | null;
  sigungu?: string | null;
  /** 표시용 세부 지역 라벨. 필수 아님 */
  region?: string | null;
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
  /** 시설별 요금표. 데이터 없으면 null */
  fees?: FeeTiers | null;
  /** "listing" | "full" */
  dataStatus?: string;
}

/** 파일/응답 최상위 shape */
export interface PoolsPayload {
  _meta?: Record<string, unknown>;
  /**
   * @deprecated 전국 확장으로 요금은 pool.fees 로 이동. 프론트 무중단 이행을 위해
   * 당분간 top-level 에도 대표 요금표를 함께 실어 준다(Phase 3 이후 제거 예정).
   */
  freeSwimPriceTiers: FeeTiers;
  pools: PoolRecord[];
}
