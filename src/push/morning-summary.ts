/**
 * 아침 요약 메시지 생성. pools.json(프론트와 동일 사본)에서 "오늘" 세션이 있는
 * 시설을 골라 한 줄 요약을 만든다. 2단계에서 수영장 데이터가 DB로 이관되면
 * 이 파일의 데이터 소스만 교체하면 된다.
 */

interface FreeSwimSession {
  dayCodes: number[];
  weeksOfMonth?: number[];
  start: string;
  end: string;
}

export interface SummaryPool {
  id: string;
  name: string;
  freeSwim: { sessions: FreeSwimSession[] };
}

/** 짧은 표기용 시설명 (예: "하남종합운동장 국민체육센터" → "미사") */
const SHORT_NAMES: Record<string, string> = {
  'hanam-misa': '미사',
  'hanam-pungsan': '풍산',
  'hanam-deokpung': '덕풍',
  'hanam-gamil': '감일',
};

export function buildMorningSummary(
  pools: SummaryPool[],
  kstNow: Date,
): { title: string; body: string } {
  const dayCode = kstNow.getUTCDay(); // KST 보정된 Date를 UTC 게터로 읽는다
  const weekOfMonth = Math.ceil(kstNow.getUTCDate() / 7);

  const openToday = pools
    .map((pool) => {
      const todays = pool.freeSwim.sessions.filter(
        (s) =>
          s.dayCodes.includes(dayCode) &&
          (!s.weeksOfMonth || s.weeksOfMonth.includes(weekOfMonth)),
      );
      if (todays.length === 0) return null;
      const first = todays.map((s) => s.start).sort()[0];
      return { name: SHORT_NAMES[pool.id] ?? pool.name, first };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.first.localeCompare(b.first));

  if (openToday.length === 0) {
    return {
      title: '오늘의 자유수영',
      body: '오늘은 하남 공공 자유수영이 없는 날이에요.',
    };
  }

  const list = openToday.map((p) => `${p.name} ${p.first}~`).join(' · ');
  return {
    title: `오늘 자유수영 가능한 곳 ${openToday.length}곳`,
    body: list,
  };
}
