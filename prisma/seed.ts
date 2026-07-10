/**
 * 시드 스크립트 — data/pools.json 을 Pool + FeeTier 테이블로 적재한다.
 * 실행: `pnpm seed` 또는 `prisma db seed`.
 * upsert 이므로 반복 실행해도 안전(원본 재크롤링 후 재적재용).
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  // 1) Pool upsert (id 기준)
  for (const pool of data.pools) {
    const record = {
      name: pool.name,
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
    };
    await prisma.pool.upsert({
      where: { id: pool.id },
      create: { id: pool.id, ...record },
      update: record,
    });
  }
  console.log(`Pool ${data.pools.length}건 upsert 완료`);

  // 2) FeeTier upsert (tier,target 기준)
  const feeRows: { tier: string; target: string; price: number }[] = [];
  (['full', 'half'] as const).forEach((tier) => {
    for (const [target, price] of Object.entries(
      data.freeSwimPriceTiers[tier] ?? {},
    )) {
      feeRows.push({ tier, target, price });
    }
  });
  for (const row of feeRows) {
    await prisma.feeTier.upsert({
      where: { tier_target: { tier: row.tier, target: row.target } },
      create: row,
      update: { price: row.price },
    });
  }
  console.log(`FeeTier ${feeRows.length}건 upsert 완료`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
