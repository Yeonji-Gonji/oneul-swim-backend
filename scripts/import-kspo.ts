/**
 * 전국 공공 수영장 벌크 임포트 — 국민체육진흥공단 전국체육시설 API(data.go.kr) 직접 페치.
 *
 *   DATA_GO_KR_KEY=<serviceKey> npx tsx scripts/import-kspo.ts
 *   (DB에 쓰므로 서버 컨테이너 안에서 실행. 좌표가 API에 있어 지오코딩 불필요)
 *
 * 필터: ftype_nm=수영장 · faci_gb_nm=공공 · faci_stat_nm=정상운영 · 좌표 유효.
 * dataStatus='listing'(기본정보만). 자유수영 시간표·요금은 여기서 넣지 않는다(제보/큐레이션).
 * upsert(id=kspo-<faci_cd>) 라 재실행 안전 → 정기 재임포트로 신선도 갱신 가능.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ENDPOINT =
  'https://apis.data.go.kr/B551014/SRVC_API_SFMS_FACI/TODZ_API_SFMS_FACI';

interface KspoItem {
  faci_cd?: string;
  faci_nm?: string;
  faci_gb_nm?: string; // 공공 | 신고 | 등록 ...
  faci_stat_nm?: string; // 정상운영 | 폐업 ...
  cp_nm?: string; // 시도
  cpb_nm?: string; // 시군구
  addr_ctpv_nm?: string; // 시도(보조)
  faci_road_addr?: string;
  faci_addr?: string; // 지번
  faci_lat?: string;
  faci_lot?: string;
  updt_dt?: string;
}

async function fetchPage(key: string, pageNo: number): Promise<{
  items: KspoItem[];
  totalCount: number;
}> {
  const qs = new URLSearchParams({
    serviceKey: key,
    pageNo: String(pageNo),
    numOfRows: '100',
    resultType: 'json',
    ftype_nm: '수영장',
  });
  const res = await fetch(`${ENDPOINT}?${qs}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const body = (await res.json())?.response?.body;
  const raw = body?.items?.item ?? [];
  const items: KspoItem[] = Array.isArray(raw) ? raw : [raw];
  return { items, totalCount: Number(body?.totalCount ?? 0) };
}

function validCoord(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) > 0.001 ? n : null;
}

async function main() {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) {
    console.error('DATA_GO_KR_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }

  // 전 페이지 수집
  const all: KspoItem[] = [];
  let pageNo = 1;
  for (;;) {
    const { items, totalCount } = await fetchPage(key, pageNo);
    all.push(...items);
    if (all.length >= totalCount || items.length === 0) break;
    pageNo++;
  }
  console.log(`수영장 전체 ${all.length}건`);

  // 공공 · 정상운영 · 좌표유효
  let created = 0;
  let skipped = 0;
  for (const it of all) {
    if (it.faci_gb_nm !== '공공' || it.faci_stat_nm !== '정상운영') {
      skipped++;
      continue;
    }
    const lat = validCoord(it.faci_lat);
    const lng = validCoord(it.faci_lot);
    if (lat == null || lng == null || !it.faci_cd || !it.faci_nm) {
      skipped++;
      continue;
    }
    const address = it.faci_road_addr || it.faci_addr || '';
    const record = {
      name: it.faci_nm,
      sido: it.cp_nm || it.addr_ctpv_nm || null,
      sigungu: it.cpb_nm || null,
      region: null,
      operator: '',
      phone: '',
      address,
      lat,
      lng,
      laneInfo: '',
      notice: '',
      websiteUrl: '',
      sourceUrl: '국민체육진흥공단 전국체육시설 API(data.go.kr)',
      updatedAt: it.updt_dt || '',
      // 리스팅 전용: 자유수영/요금 데이터 없음(nullable)
      freeSwim: undefined,
      lessons: undefined,
      fees: undefined,
      dataStatus: 'listing',
    };
    const id = `kspo-${it.faci_cd}`;
    await prisma.pool.upsert({
      where: { id },
      create: { id, ...record },
      update: record,
    });
    created++;
  }
  console.log(`공공 수영장 upsert 완료: ${created}건 (스킵 ${skipped})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
