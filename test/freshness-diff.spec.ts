import {
  diffSnapshot,
  hashContent,
} from '../src/freshness/freshness.diff';

describe('hashContent', () => {
  it('같은 입력은 같은 해시, 다른 입력은 다른 해시', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
    expect(hashContent('abc')).not.toBe(hashContent('abd'));
  });

  it('sha256 hex(64자)를 반환한다', () => {
    expect(hashContent('hello')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('diffSnapshot', () => {
  it('최초 관측: 저장만 하고 알림은 내지 않는다(오탐 방지)', () => {
    const r = diffSnapshot({ existingHash: null, newHash: 'h1' });
    expect(r.isFirstSeen).toBe(true);
    expect(r.changed).toBe(false);
    expect(r.shouldUpsert).toBe(true);
    expect(r.shouldAlert).toBe(false);
  });

  it('해시 동일: 변경 없음 — 아무것도 하지 않는다', () => {
    const r = diffSnapshot({ existingHash: 'h1', newHash: 'h1' });
    expect(r.changed).toBe(false);
    expect(r.shouldUpsert).toBe(false);
    expect(r.shouldAlert).toBe(false);
  });

  it('해시 상이: 변경 감지 — 갱신 + 알림', () => {
    const r = diffSnapshot({ existingHash: 'h1', newHash: 'h2' });
    expect(r.isFirstSeen).toBe(false);
    expect(r.changed).toBe(true);
    expect(r.shouldUpsert).toBe(true);
    expect(r.shouldAlert).toBe(true);
  });
});
