/**
 * 「전국공공시설개방정보 표준데이터」(data.go.kr 15013117) → 우리 Pool 보강 임포터.
 *
 * 이 표준데이터는 공식 홈페이지주소·사용안내전화번호·좌표를 담고 있다.
 * 우리 604곳은 KSPO 임포트분이라 websiteUrl 이 거의 비어 있고 전화도 절반뿐이라
 * 이 소스로 그 빈 칸을 채운다. **매칭은 이름이 아니라 좌표(haversine)로만** 한다
 * (이름은 "합천체육관 실내수영장" vs "합천실내수영장"처럼 흔들려 오매칭이 잦음).
 *
 * ⚠️ 이 데이터의 '평일운영시작/종료시각'은 **시설 개방시각**일 뿐 자유수영 세션이 아니다.
 *    freeSwim.sessions 계약(요일·회차·tier)과 무관하므로 시간표로 쓰지 않는다.
 *    자유수영 시간표는 별도(어드민 승인 초안 + 제보) 경로로만 채운다.
 *
 * 보강 규칙(기존 값 훼손 금지):
 *  - websiteUrl: 비어있거나 카카오맵 place_url·'국민체육' 플레이스홀더일 때만 공식 홈페이지로 교체
 *  - phone:      비어있을 때만 채움
 *  - 요금·시간표·dataStatus 는 건드리지 않는다.
 *
 * 2단계 워크플로우 (group-fees 방식과 동일: 작은 계획파일을 커밋 자산으로):
 *   1) 계획 생성(dry-run, 로컬):  npx tsx scripts/import-open-facility.ts <표준데이터.json> [임계거리m]
 *      → 좌표매칭으로 보강 계획을 data/open-facility-plan.json 에 기록(커밋 대상). DB 안 씀.
 *        7.7MB 원본 json 은 재다운로드 가능한 원천이라 커밋/서버이관 불필요.
 *   2) 반영(apply, 서버 컨테이너):  npx tsx scripts/import-open-facility.ts apply
 *      → data/open-facility-plan.json 만 읽어 DB 반영(PrismaClient → DATABASE_URL). 원본 json 불필요.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_THRESHOLD_M = 250;
const PLAN_PATH = path.join(__dirname, '../data/open-facility-plan.json');

/** 레코드에서 키 이름이 조금씩 달라도 부분일치로 값 추출 */
function pick(row: Record<string, unknown>, ...needles: string[]): string {
  for (const key of Object.keys(row)) {
    if (needles.some((n) => key.includes(n))) {
      const v = row[key];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return '';
}

/** 두 좌표 사이 거리(m) */
function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 공식 홈페이지로 볼 수 있는 URL 인지 (http(s) 시작). 카카오맵 링크는 공식으로 안 봄 */
function normalizeHomepage(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  const url = /^https?:\/\//i.test(v) ? v : `http://${v}`;
  if (/place\.map\.kakao\.com|map\.kakao\.com|place\.kakao\.com/i.test(url)) return '';
  return url;
}

/** 현재 websiteUrl 을 교체해도 되는가 (빈값·카카오맵·플레이스홀더) */
function websiteReplaceable(current: string | null | undefined): boolean {
  const v = (current || '').trim();
  if (v === '') return true;
  if (/place\.map\.kakao\.com|map\.kakao\.com|place\.kakao\.com/i.test(v)) return true;
  if (v.startsWith('국민체육')) return true;
  return false;
}

type StdPool = {
  name: string;
  lat: number;
  lng: number;
  homepage: string;
  phone: string;
};

/** 표준데이터 JSON 로드 → 수영장 레코드만 정규화 */
function loadStdPools(jsonPath: string): StdPool[] {
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const rows: Record<string, unknown>[] = Array.isArray(parsed)
    ? parsed
    : parsed.data || parsed.records || parsed.DATA || [];

  const result: StdPool[] = [];
  for (const r of rows) {
    const type = pick(r, '유형', '구분');
    const name = pick(r, '개방시설명', '개방장소명', '시설명', '장소명');
    if (!(type.includes('수영') || name.includes('수영'))) continue;

    const lat = parseFloat(pick(r, '위도'));
    const lng = parseFloat(pick(r, '경도'));
    if (!isFinite(lat) || !isFinite(lng)) continue;

    result.push({
      name,
      lat,
      lng,
      homepage: normalizeHomepage(pick(r, '홈페이지')),
      phone: pick(r, '사용안내전화번호', '전화'),
    });
  }
  return result;
}

type OurPool = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  websiteUrl: string | null;
};

/** dry-run: /pools API 로 우리 데이터 로드(DB 불필요) */
async function loadOursFromApi(): Promise<OurPool[]> {
  const url = process.env.POOLS_API || 'https://oneul-swim.duckdns.org/pools';
  const res = await fetch(url);
  const body = (await res.json()) as OurPool[] | { pools?: OurPool[] };
  return Array.isArray(body) ? body : body.pools || [];
}

type Plan = {
  poolId: string;
  poolName: string;
  distance: number;
  stdName: string;
  setWebsite?: string;
  setPhone?: string;
};

/**
 * 표준 수영장 각각을 최근접 우리 pool 에 좌표매칭(<threshold)하고,
 * 보강 규칙에 맞는 변경만 계획으로 만든다. 한 pool 에 여러 표준레코드가 겹치면
 * 가장 가까운 것만 남긴다(거리순 정렬 후 pool 당 1회).
 */
function buildPlans(std: StdPool[], ours: OurPool[], thresholdM: number): {
  plans: Plan[];
  matched: number;
  unmatched: StdPool[];
} {
  const candidates: (Plan & { _dist: number })[] = [];
  const unmatched: StdPool[] = [];
  let matched = 0;

  for (const s of std) {
    let best: OurPool | null = null;
    let bestDist = Infinity;
    for (const o of ours) {
      if (o.lat == null || o.lng == null) continue;
      const d = haversine(s.lat, s.lng, o.lat, o.lng);
      if (d < bestDist) {
        bestDist = d;
        best = o;
      }
    }
    if (!best || bestDist > thresholdM) {
      unmatched.push(s);
      continue;
    }
    matched++;

    const plan: Plan & { _dist: number } = {
      poolId: best.id,
      poolName: best.name,
      distance: Math.round(bestDist),
      stdName: s.name,
      _dist: bestDist,
    };
    if (s.homepage && websiteReplaceable(best.websiteUrl)) plan.setWebsite = s.homepage;
    if (s.phone && (!best.phone || best.phone.trim() === '')) plan.setPhone = s.phone;

    if (plan.setWebsite || plan.setPhone) candidates.push(plan);
  }

  // pool 당 가장 가까운 계획만 유지
  candidates.sort((a, b) => a._dist - b._dist);
  const seen = new Set<string>();
  const plans: Plan[] = [];
  for (const c of candidates) {
    if (seen.has(c.poolId)) continue;
    seen.add(c.poolId);
    const { _dist, ...rest } = c;
    plans.push(rest);
  }
  return { plans, matched, unmatched };
}

/** 1단계: 원본 JSON → 좌표매칭 → 계획파일 생성(dry-run, DB 안 씀) */
async function planFromRaw(jsonPath: string, thresholdM: number) {
  const std = loadStdPools(jsonPath);
  console.log(`[표준데이터] 좌표 있는 수영장 ${std.length}건 로드`);

  const ours = await loadOursFromApi();
  console.log(`[우리 DB] ${ours.length}곳 로드 (API, dry-run)`);

  const { plans, matched, unmatched } = buildPlans(std, ours, thresholdM);
  const webCount = plans.filter((p) => p.setWebsite).length;
  const phoneCount = plans.filter((p) => p.setPhone).length;

  console.log(`\n=== 매칭 (좌표 <${thresholdM}m) ===`);
  console.log(`표준 ${std.length}건 중 매칭 ${matched}건 · 미매칭 ${unmatched.length}건`);
  console.log(`보강 대상 pool ${plans.length}곳 → websiteUrl ${webCount} · phone ${phoneCount}`);
  console.log(`\n보강 예시:`);
  for (const p of plans.slice(0, 12)) {
    const bits = [
      p.setWebsite ? `web=${p.setWebsite}` : '',
      p.setPhone ? `tel=${p.setPhone}` : '',
    ].filter(Boolean);
    console.log(`  ${p.stdName} → ${p.poolName} (${p.distance}m) : ${bits.join(', ')}`);
  }

  fs.writeFileSync(
    PLAN_PATH,
    JSON.stringify({ thresholdM, matched, plans }, null, 2),
    'utf8',
  );
  console.log(`\n[dry-run] DB 미반영. 계획 ${plans.length}곳을 ${PLAN_PATH} 에 저장(커밋 대상).`);
  console.log(`서버 컨테이너에서 반영: npx tsx scripts/import-open-facility.ts apply`);
}

/** 2단계: 계획파일 → DB 반영(원본 JSON 불필요) */
async function applyFromPlan() {
  if (!fs.existsSync(PLAN_PATH)) {
    console.error(`[ERROR] 계획파일이 없습니다: ${PLAN_PATH}. 먼저 dry-run 으로 생성하세요.`);
    process.exit(1);
  }
  const { plans } = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')) as { plans: Plan[] };
  const webCount = plans.filter((p) => p.setWebsite).length;
  const phoneCount = plans.filter((p) => p.setPhone).length;
  console.log(`[계획] ${plans.length}곳 (website ${webCount}, phone ${phoneCount})`);

  const prisma = new PrismaClient();
  try {
    let updated = 0;
    for (const p of plans) {
      // 재적재 안전: 계획 생성 후 값이 이미 채워졌으면 덮어쓰지 않는다.
      const cur = await prisma.pool.findUnique({
        where: { id: p.poolId },
        select: { phone: true, websiteUrl: true },
      });
      if (!cur) {
        console.warn(`  [SKIP] pool 없음: ${p.poolId} (${p.poolName})`);
        continue;
      }
      const data: { websiteUrl?: string; phone?: string } = {};
      if (p.setWebsite && websiteReplaceable(cur.websiteUrl)) data.websiteUrl = p.setWebsite;
      if (p.setPhone && (!cur.phone || cur.phone.trim() === '')) data.phone = p.setPhone;
      if (Object.keys(data).length === 0) continue;
      await prisma.pool.update({ where: { id: p.poolId }, data });
      updated++;
    }
    console.log(`\n[APPLIED] ${updated}곳 보강 완료. 요금·시간표·dataStatus 는 건드리지 않음.`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const arg = process.argv[2];
  if (arg === 'apply') {
    await applyFromPlan();
    return;
  }
  if (!arg || !fs.existsSync(arg)) {
    console.error(
      '사용법:\n  계획 생성: npx tsx scripts/import-open-facility.ts <표준데이터.json> [임계거리m]\n  DB 반영:  npx tsx scripts/import-open-facility.ts apply',
    );
    process.exit(1);
  }
  const thresholdM = Number(process.argv[3]) || DEFAULT_THRESHOLD_M;
  await planFromRaw(arg, thresholdM);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
