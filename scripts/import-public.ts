/**
 * 전국 공공 수영장 벌크 임포트 (Phase 2 스켈레톤).
 *
 * 입력: 공공데이터포털 "전국공공체육시설표준데이터"를 정규화한 JSON 배열 파일.
 *   실행: `npx tsx scripts/import-public.ts <normalized.json>`
 *   (CSV 원본은 이 스크립트 밖에서 JSON 배열로 변환해 넘긴다. 변환 단계는 TODO.)
 *
 * 하는 일:
 *   - 시설유형에 "수영장" 포함 레코드만 필터
 *   - 주소 → 시도/시군구 파싱(parseSidoSigungu 재사용)
 *   - 좌표 없으면 카카오 로컬 API 로 지오코딩(KAKAO_REST_KEY 있을 때만)
 *   - dataStatus='listing' 으로 upsert (자유수영/요금 없음 = null)
 *
 * 자유수영 시간표·요금(dataStatus='full')은 여기서 채우지 않는다.
 * 시설별 수작업 큐레이션 또는 제보(크라우드소싱)로 별도 승격한다.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { parseSidoSigungu } from '../prisma/region';

const prisma = new PrismaClient();

/** 정규화 입력 레코드 (CSV→JSON 변환 결과의 기대 shape) */
interface RawFacility {
  /** 공공데이터 시설 고유코드가 있으면 사용(없으면 name+주소로 slug 생성) */
  code?: string;
  name: string;
  /** 시설유형(예: "수영장", "생활체육관") — 수영장만 임포트 */
  facilityType?: string;
  roadAddress?: string;
  jibunAddress?: string;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  operator?: string | null;
  websiteUrl?: string | null;
}

/** 안정적 pool id 생성: 공공 코드 우선, 없으면 시군구+이름 slug */
function makePoolId(f: RawFacility, sigungu: string | null): string {
  if (f.code) return `pub-${f.code}`;
  const base = `${sigungu ?? ''}-${f.name}`
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `pub-${base}`;
}

/** 카카오 로컬 지오코딩(주소→좌표). KAKAO_REST_KEY 없으면 null 반환(스킵). */
async function geocode(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.KAKAO_REST_KEY;
  if (!key || !address) return null;
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    documents?: { x: string; y: string }[];
  };
  const doc = body.documents?.[0];
  if (!doc) return null;
  return { lat: Number(doc.y), lng: Number(doc.x) };
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('사용법: npx tsx scripts/import-public.ts <normalized.json>');
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(file, 'utf-8')) as RawFacility[];

  const pools = rows.filter((r) => (r.facilityType ?? '').includes('수영장'));
  console.log(`수영장 필터: ${rows.length} → ${pools.length}건`);

  let created = 0;
  let geocoded = 0;
  for (const f of pools) {
    const address = f.roadAddress || f.jibunAddress || '';
    const { sido, sigungu } = parseSidoSigungu(address);

    let lat = f.lat ?? null;
    let lng = f.lng ?? null;
    if ((lat == null || lng == null) && address) {
      const geo = await geocode(address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        geocoded++;
      }
    }
    if (lat == null || lng == null) {
      console.warn(`좌표 없음, 스킵: ${f.name} (${address})`);
      continue;
    }

    const id = makePoolId(f, sigungu);
    const record = {
      name: f.name,
      sido,
      sigungu,
      region: null,
      operator: f.operator ?? '',
      phone: f.phone ?? '',
      address,
      lat,
      lng,
      laneInfo: '',
      notice: '',
      websiteUrl: f.websiteUrl ?? '',
      sourceUrl: f.websiteUrl ?? '',
      updatedAt: '',
      // 리스팅 전용: 자유수영/요금 데이터 없음
      freeSwim: undefined,
      lessons: undefined,
      fees: undefined,
      dataStatus: 'listing',
    };
    await prisma.pool.upsert({
      where: { id },
      create: { id, ...record },
      update: record,
    });
    created++;
  }
  console.log(`Pool upsert 완료: ${created}건 (지오코딩 ${geocoded}건)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
