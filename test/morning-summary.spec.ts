import {
  buildMorningSummary,
  SummaryPool,
} from '../src/push/morning-summary';

/** UTC 게터로 읽는 KST 보정 Date 생성 (2026-07-06 = 월요일) */
const kst = (iso: string) => new Date(`${iso}T00:00:00Z`);

const pools: SummaryPool[] = [
  {
    id: 'hanam-misa',
    name: '하남종합운동장 국민체육센터',
    freeSwim: {
      sessions: [
        { dayCodes: [1, 2, 3, 4, 5], start: '06:00', end: '07:50' },
        // 둘째·넷째 주 일요일만
        { dayCodes: [0], weeksOfMonth: [2, 4], start: '09:00', end: '10:50' },
      ],
    },
  },
  {
    id: 'hanam-pungsan',
    name: '풍산멀티스포츠센터',
    freeSwim: { sessions: [{ dayCodes: [1], start: '09:00', end: '10:00' }] },
  },
];

describe('buildMorningSummary', () => {
  it('평일: 세션 있는 시설을 이른 시작순으로 나열한다', () => {
    const r = buildMorningSummary(pools, kst('2026-07-06')); // 월요일
    expect(r.title).toBe('오늘 자유수영 가능한 곳 2곳');
    expect(r.body).toBe('미사 06:00~ · 풍산 09:00~');
  });

  it('주차 조건: 첫째 주 일요일엔 둘째·넷째 주 세션이 빠진다', () => {
    const r = buildMorningSummary(pools, kst('2026-07-05')); // 첫째 주 일요일
    expect(r.body).toBe('오늘은 하남 공공 자유수영이 없는 날이에요.');
  });

  it('주차 조건: 둘째 주 일요일엔 미사가 포함된다', () => {
    const r = buildMorningSummary(pools, kst('2026-07-12')); // 둘째 주 일요일
    expect(r.title).toBe('오늘 자유수영 가능한 곳 1곳');
    expect(r.body).toBe('미사 09:00~');
  });
});
