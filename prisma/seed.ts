/**
 * 시드 스크립트 — data/pools.json(하남 큐레이션 데이터)을 Pool 테이블로 적재한다.
 * 실행: `pnpm seed`(또는 컨테이너 안에서는 `npx tsx prisma/seed.ts`).
 * upsert 이므로 반복 실행해도 안전(원본 재크롤링 후 재적재용).
 * 요금(fees)은 시설별 JSON 으로 저장하고, 이 데이터는 자유수영 완비라 dataStatus='full'.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSidoSigungu } from './region';

const prisma = new PrismaClient();

interface FeeTiers {
  full: Record<string, number>;
  half: Record<string, number>;
}

interface PoolRecord {
  id: string;
  name: string;
  region: string;
  operator: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  laneInfo: string;
  notice: string;
  websiteUrl: string;
  sourceUrl: string;
  updatedAt: string;
  freeSwim: unknown;
  lessons: unknown;
}

interface PoolsFile {
  freeSwimPriceTiers: FeeTiers;
  pools: PoolRecord[];
}

async function main() {
  const raw = readFileSync(
    join(process.cwd(), 'data', 'pools.json'),
    'utf-8',
  );
  const data = JSON.parse(raw) as PoolsFile;

  // Pool upsert (id 기준). 요금은 시설별 fees JSON, 자유수영 완비라 dataStatus='full'.
  for (const pool of data.pools) {
    const { sido, sigungu } = parseSidoSigungu(pool.address);
    const record = {
      name: pool.name,
      sido,
      sigungu,
      region: pool.region,
      operator: pool.operator,
      phone: pool.phone,
      address: pool.address,
      lat: pool.lat,
      lng: pool.lng,
      laneInfo: pool.laneInfo ?? '',
      notice: pool.notice,
      websiteUrl: pool.websiteUrl,
      sourceUrl: pool.sourceUrl,
      updatedAt: pool.updatedAt,
      freeSwim: pool.freeSwim as object,
      lessons: pool.lessons as object,
      fees: data.freeSwimPriceTiers as object,
      dataStatus: 'full',
    };
    await prisma.pool.upsert({
      where: { id: pool.id },
      create: { id: pool.id, ...record },
      update: record,
    });
  }
  console.log(`Pool ${data.pools.length}건 upsert 완료 (fees 포함, dataStatus=full)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
