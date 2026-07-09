import {
  isGoneError,
  summarizeSends,
  SendOutcome,
} from '../src/push/web-push.helper';

describe('isGoneError', () => {
  it('410(Gone)·404 는 만료로 판정한다', () => {
    expect(isGoneError({ statusCode: 410 })).toBe(true);
    expect(isGoneError({ statusCode: 404 })).toBe(true);
  });

  it('그 외 상태·형태는 만료가 아니다', () => {
    expect(isGoneError({ statusCode: 500 })).toBe(false);
    expect(isGoneError(new Error('network'))).toBe(false);
    expect(isGoneError(undefined)).toBe(false);
  });
});

describe('summarizeSends', () => {
  it('성공/실패 수와 정리 대상(만료) endpoint 를 집계한다', () => {
    const results: SendOutcome[] = [
      { endpoint: 'a', ok: true, gone: false },
      { endpoint: 'b', ok: false, gone: true }, // 만료 → 정리 대상
      { endpoint: 'c', ok: false, gone: false }, // 일시 실패 → 유지
    ];
    const r = summarizeSends(results);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(2);
    expect(r.goneEndpoints).toEqual(['b']);
  });

  it('빈 목록은 모두 0', () => {
    const r = summarizeSends([]);
    expect(r).toEqual({ sent: 0, failed: 0, goneEndpoints: [] });
  });
});
