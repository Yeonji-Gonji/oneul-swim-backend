/**
 * 신선도 감시 diff 판정 — 순수 함수(테스트 대상).
 * 원본 페이지를 가져와 해시를 비교하고, 스냅샷 갱신/알림 여부를 결정한다.
 */
import { createHash } from 'node:crypto';

/** 콘텐츠 문자열의 sha256 해시(hex) */
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export interface SnapshotDiffInput {
  /** 기존 스냅샷 해시(없으면 null) */
  existingHash: string | null;
  /** 이번에 가져온 콘텐츠의 해시 */
  newHash: string;
}

export interface SnapshotDiffResult {
  /** 스냅샷이 처음 관측됨(기존 없음) — 저장만, 알림 없음 */
  isFirstSeen: boolean;
  /** 기존과 해시가 다름 */
  changed: boolean;
  /** 스냅샷을 upsert 해야 하는가(최초 관측 또는 변경) */
  shouldUpsert: boolean;
  /** 변경 알림을 남겨야 하는가(최초 관측 제외한 실제 변경) */
  shouldAlert: boolean;
}

/** 기존 해시와 새 해시로 후속 동작을 결정 */
export function diffSnapshot(input: SnapshotDiffInput): SnapshotDiffResult {
  const { existingHash, newHash } = input;

  if (existingHash === null) {
    // 최초 관측: 기준선만 저장하고 알림은 내지 않는다(오탐 방지)
    return {
      isFirstSeen: true,
      changed: false,
      shouldUpsert: true,
      shouldAlert: false,
    };
  }

  const changed = existingHash !== newHash;
  return {
    isFirstSeen: false,
    changed,
    shouldUpsert: changed,
    shouldAlert: changed,
  };
}
