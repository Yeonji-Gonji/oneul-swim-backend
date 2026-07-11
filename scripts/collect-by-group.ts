import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function showList() {
  const pools = await prisma.pool.findMany({
    select: {
      id: true,
      name: true,
      sido: true,
      sigungu: true,
      dataStatus: true
    }
  });

  const groups: Record<string, { sido: string, sigungu: string, total: number, full: number, listing: number, sample: string[] }> = {};

  for (const p of pools) {
    const sido = p.sido || '미분류';
    const sigungu = p.sigungu || '미분류';
    const key = `${sido} ${sigungu}`;

    if (!groups[key]) {
      groups[key] = {
        sido,
        sigungu,
        total: 0,
        full: 0,
        listing: 0,
        sample: []
      };
    }

    groups[key].total++;
    if (p.dataStatus === 'full') {
      groups[key].full++;
    } else {
      groups[key].listing++;
    }

    if (groups[key].sample.length < 3) {
      groups[key].sample.push(p.name);
    }
  }

  console.log(`\n=== 지자체(도시공사)별 수영장 분포 통계 ===`);
  const sorted = Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  
  for (const [key, info] of sorted) {
    console.log(`[${key}] - 총 ${info.total}개 (완비: ${info.full}, 준비중: ${info.listing})`);
    console.log(`   - 예시: ${info.sample.join(', ')}`);
    console.log(`   - 검색 키워드 예시: "${info.sido} ${info.sigungu} 도시공사 수영장 요금"`);
  }
}

async function applyGroupFees() {
  const jsonPath = path.join(__dirname, '../data/group-fees.json');
  console.log(`[INFO] Reading group fees mapping from: ${jsonPath}`);
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`[ERROR] JSON file not found at: ${jsonPath}. Please create it first.`);
    return;
  }

  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const config = JSON.parse(rawData);
  const groups = config.groups || [];

  let totalUpdated = 0;

  for (const g of groups) {
    const { sido, sigungu, fees, notice, applyFull } = g;
    if (!sido || !fees) {
      console.warn(`[WARN] Invalid group config: ${JSON.stringify(g)}. Skipping.`);
      continue;
    }

    // Find all matching pools in the group (if sigungu is null/undefined, match whole sido)
    const whereClause: any = { sido };
    if (sigungu !== null && sigungu !== undefined) {
      whereClause.sigungu = sigungu;
    }

    const targetPools = await prisma.pool.findMany({
      where: whereClause
    });

    console.log(`[INFO] Group [${sido} ${sigungu}]: Found ${targetPools.length} pools in database.`);
    
    let groupUpdated = 0;
    for (const pool of targetPools) {
      const updateData: any = {
        fees
      };
      
      if (notice) {
        updateData.notice = notice;
      }
      
      // If applyFull is true, upgrade dataStatus to full
      if (applyFull) {
        updateData.dataStatus = 'full';
      }

      await prisma.pool.update({
        where: { id: pool.id },
        data: updateData
      });
      groupUpdated++;
    }
    
    console.log(`[APPLIED] Group [${sido} ${sigungu}]: Successfully updated ${groupUpdated} pools with common fees.`);
    totalUpdated += groupUpdated;
  }

  console.log(`\n=== Bulk Mapping Result ===`);
  console.log(`Successfully updated ${totalUpdated} pools in total.`);
}

async function main() {
  const mode = process.argv[2] || 'list';

  if (mode === 'list') {
    await showList();
  } else if (mode === 'apply') {
    await applyGroupFees();
  } else {
    console.error(`[ERROR] Unknown mode: ${mode}. Available modes: 'list', 'apply'`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
