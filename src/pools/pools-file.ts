/**
 * data/pools.json(프론트와 동일 사본) 읽기 헬퍼.
 * DB 폴백, 아침 요약 폴백, 신선도 감시 대상 URL 추출에 공용으로 쓴다.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PoolsPayload } from './pools.types';

/** data/pools.json 전체를 파싱해 반환 */
export function readPoolsFile(): PoolsPayload {
  const raw = readFileSync(join(process.cwd(), 'data', 'pools.json'), 'utf-8');
  return JSON.parse(raw) as PoolsPayload;
}

/** 신선도 감시 대상 URL(각 pool.sourceUrl 의 유니크 집합) */
export function sourceUrlsFromFile(): string[] {
  const { pools } = readPoolsFile();
  const set = new Set<string>();
  for (const pool of pools) {
    if (pool.sourceUrl) set.add(pool.sourceUrl);
  }
  return [...set];
}
