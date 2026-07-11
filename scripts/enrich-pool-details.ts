import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchKakaoPlace(query: string, key: string): Promise<{ phone: string; websiteUrl: string } | null> {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${key}`
      }
    });

    if (!res.ok) {
      console.warn(`[WARN] Kakao API HTTP error ${res.status} for query: ${query}`);
      return null;
    }

    const body = (await res.json()) as {
      documents?: { phone?: string; place_url?: string; road_address_name?: string }[];
    };

    const doc = body.documents?.[0];
    if (!doc) return null;

    return {
      phone: doc.phone || '',
      websiteUrl: doc.place_url || ''
    };
  } catch (error) {
    console.error(`[ERROR] Kakao API call failed for query: ${query}`, error);
    return null;
  }
}

async function main() {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) {
    console.error('[ERROR] KAKAO_REST_KEY 환경변수가 필요합니다. (.env 확인)');
    process.exit(1);
  }

  // 전화번호나 웹사이트가 비어 있는 수영장 가져오기
  const targetPools = await prisma.pool.findMany({
    where: {
      OR: [
        { phone: '' },
        { websiteUrl: '' },
        { websiteUrl: { startsWith: '국민체육' } }
      ]
    }
  });

  console.log(`[INFO] Found ${targetPools.length} pools needing enrichment.`);

  let successCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < targetPools.length; i++) {
    const pool = targetPools[i];
    const query = `${pool.sido || ''} ${pool.sigungu || ''} ${pool.name}`.trim();
    
    console.log(`[${i + 1}/${targetPools.length}] Searching Kakao for: "${query}"...`);
    
    // 카카오 API Rate Limit (초당 호출 제한)을 고려해 150ms 딜레이 부여
    await delay(150);

    const result = await searchKakaoPlace(query, key);

    if (result) {
      const updateData: any = {};
      
      if ((!pool.phone || pool.phone === '') && result.phone) {
        updateData.phone = result.phone;
      }
      
      if ((!pool.websiteUrl || pool.websiteUrl === '' || pool.websiteUrl.startsWith('국민체육')) && result.websiteUrl) {
        updateData.websiteUrl = result.websiteUrl;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.pool.update({
          where: { id: pool.id },
          data: updateData
        });
        console.log(`   -> [ENRICHED] Phone: "${updateData.phone || 'N/A'}", Website: "${updateData.websiteUrl || 'N/A'}"`);
        successCount++;
      } else {
        skippedCount++;
      }
    } else {
      console.log(`   -> [NOT FOUND] No Kakao place matched.`);
      skippedCount++;
    }
  }

  console.log(`\n=== Enrichment Result ===`);
  console.log(`Successfully enriched ${successCount} pools.`);
  console.log(`Skipped/Not found: ${skippedCount} pools.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
