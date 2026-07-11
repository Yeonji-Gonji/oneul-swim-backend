/**
 * 자유수영 시간표(회차) 반영 스크립트.
 *
 * 웹에서 출처와 함께 수집·검수한 회차 시간표를 `data/schedule-pilot.json` 에서 읽어
 * Pool.freeSwim = { sessions } 로 반영한다(dataStatus='full' 승격 + sourceUrl·updatedAt).
 *
 * apply-pilot-results.ts 와 달리 **fees 는 건드리지 않는다**(604곳 이미 요금 적재됨).
 * 시간표만 채운다. 자동 발행이 아니라 "출처 있는 수집분을 사람이 검수한 파일"을 반영하는 것.
 *
 * 판정 정합성(프론트 lib/pools.ts·백엔드 morning-summary.ts 계약):
 *  - dayCodes: 0=일 … 6=토 (JS Date.getDay()). 정수만.
 *  - start/end: "HH:mm" 24시간제.
 *  - tier: 'full'|'half'(요금표시용, 판정무관). 불확실하면 'full'.
 *  - weeksOfMonth: 격주 등만. Math.ceil(날짜/7) 기준. **매주면 키 생략**(빈 배열 금지 — isSessionToday 가 영원히 false).
 *  - daysLabel 은 표시용이지만 dayCodes 와 일치시킨다.
 * 위 규칙 위반 세션은 폐기하고, 유효 세션 0개면 그 pool 은 스킵한다.
 *
 * 사용법:
 *   npx tsx scripts/apply-schedules.ts            # dry-run(기본): 검증·요약만. DB 안 씀
 *   npx tsx scripts/apply-schedules.ts apply       # DB 반영(PrismaClient → DATABASE_URL)
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const DATA_PATH = path.join(__dirname, '../data/schedule-pilot.json');
const TIME_RE = /^\d{1,2}:\d{2}$/;

type RawSession = {
  daysLabel?: string;
  dayCodes?: unknown;
  start?: string;
  end?: string;
  tier?: string;
  weeksOfMonth?: unknown;
  capacity?: unknown;
};
type Item = {
  id: string;
  name: string;
  found?: boolean;
  sourceUrl?: string;
  asOf?: string;
  notice?: string;
  sessions?: RawSession[];
};

type CleanSession = {
  daysLabel: string;
  dayCodes: number[];
  start: string;
  end: string;
  tier: 'full' | 'half';
  weeksOfMonth?: number[];
  capacity?: number;
};

/** 계약 규칙대로 세션 정제. 위반 시 null 반환(폐기) */
function cleanSession(s: RawSession): CleanSession | null {
  const dayCodes = Array.isArray(s.dayCodes)
    ? s.dayCodes.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  if (dayCodes.length === 0) return null;
  if (!s.start || !TIME_RE.test(s.start)) return null;
  if (!s.end || !TIME_RE.test(s.end)) return null;

  const out: CleanSession = {
    daysLabel: (s.daysLabel || '').trim() || labelFromCodes(dayCodes),
    dayCodes,
    start: s.start,
    end: s.end,
    tier: s.tier === 'half' ? 'half' : 'full',
  };
  if (Array.isArray(s.weeksOfMonth)) {
    const w = s.weeksOfMonth.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 6);
    if (w.length > 0) out.weeksOfMonth = w; // 매주면 키 생략(빈 배열 금지)
  }
  if (typeof s.capacity === 'number' && s.capacity > 0) out.capacity = s.capacity;
  return out;
}

function labelFromCodes(codes: number[]): string {
  const kr = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = [1, 2, 3, 4, 5];
  if (weekday.every((d) => codes.includes(d)) && codes.length === 5) return '평일';
  return codes
    .slice()
    .sort((a, b) => a - b)
    .map((c) => kr[c])
    .join('·');
}

async function main() {
  const apply = process.argv[2] === 'apply';
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`[ERROR] 데이터 파일 없음: ${DATA_PATH}`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as Item[];

  const prisma = apply ? new PrismaClient() : null;
  try {
    let applied = 0;
    let skipped = 0;
    let totalSessions = 0;

    for (const item of items) {
      if (item.found === false) {
        console.log(`[SKIP] ${item.name} — found=false`);
        skipped++;
        continue;
      }
      if (!item.sourceUrl) {
        console.log(`[SKIP] ${item.name} — sourceUrl 없음(출처 필수)`);
        skipped++;
        continue;
      }
      const clean = (item.sessions || []).map(cleanSession).filter((x): x is CleanSession => x != null);
      if (clean.length === 0) {
        console.log(`[SKIP] ${item.name} — 유효 세션 0개`);
        skipped++;
        continue;
      }

      totalSessions += clean.length;
      console.log(`[OK]  ${item.name} (${item.id}) — 세션 ${clean.length}개 · ${item.sourceUrl}`);

      if (prisma) {
        const pool = await prisma.pool.findUnique({ where: { id: item.id } });
        if (!pool) {
          console.warn(`  [WARN] DB에 pool 없음: ${item.id} — 스킵`);
          skipped++;
          continue;
        }
        const data: {
          freeSwim: { sessions: CleanSession[] };
          dataStatus: string;
          updatedAt: string;
          sourceUrl: string;
          notice?: string;
        } = {
          freeSwim: { sessions: clean },
          dataStatus: 'full',
          updatedAt: item.asOf || '2026-07-11',
          sourceUrl: item.sourceUrl,
        };
        if (item.notice) data.notice = item.notice;
        await prisma.pool.update({ where: { id: item.id }, data });
      }
      applied++;
    }

    console.log(`\n=== ${apply ? 'APPLIED' : 'DRY-RUN'} ===`);
    console.log(`반영 대상 ${applied}곳 · 세션 총 ${totalSessions}개 · 스킵 ${skipped}곳`);
    if (!apply) console.log(`실제 반영: npx tsx scripts/apply-schedules.ts apply (fees 는 안 건드림)`);
  } finally {
    await prisma?.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
