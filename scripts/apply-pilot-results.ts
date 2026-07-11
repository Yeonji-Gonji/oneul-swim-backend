import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const jsonPath = path.join(__dirname, '../data/pilot_results.json');
  console.log(`[INFO] Reading pilot results from: ${jsonPath}`);
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`[ERROR] JSON file not found at: ${jsonPath}`);
    process.exit(1);
  }
  
  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const results = JSON.parse(rawData);
  
  let successCount = 0;
  let skipCount = 0;
  
  for (const item of results) {
    if (!item.found) {
      console.log(`[SKIP] Pool ${item.name} (${item.id}) - Info not found. Reason: ${item.notice || 'N/A'}`);
      skipCount++;
      continue;
    }
    
    // Check if pool exists in database
    const pool = await prisma.pool.findUnique({
      where: { id: item.id }
    });
    
    if (!pool) {
      console.warn(`[WARN] Pool ${item.name} (${item.id}) not found in database. Skipping.`);
      skipCount++;
      continue;
    }
    
    const updateData: any = {
      dataStatus: 'full',
      fees: item.fees,
      freeSwim: { sessions: item.sessions },
      updatedAt: item.asOf || '2026-07-11'
    };
    
    if (item.operator) {
      updateData.operator = item.operator;
    }
    if (item.notice) {
      updateData.notice = item.notice;
    }
    if (item.sourceUrl) {
      updateData.sourceUrl = item.sourceUrl;
    }
    
    await prisma.pool.update({
      where: { id: item.id },
      data: updateData
    });
    
    console.log(`[APPLIED] Successfully updated Pool ${item.name} (${item.id}) to full`);
    successCount++;
  }
  
  console.log(`\n=== Reflection Result ===`);
  console.log(`Total processed: ${results.length}`);
  console.log(`Successfully applied: ${successCount}`);
  console.log(`Skipped/Not found: ${skipCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
