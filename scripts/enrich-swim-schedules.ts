import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 카카오 웹/블로그 검색 API 연동
async function getSearchContext(query: string, key: string): Promise<string> {
  const webUrl = `https://dapi.kakao.com/v2/search/web?query=${encodeURIComponent(query)}&size=8`;
  const blogUrl = `https://dapi.kakao.com/v2/search/blog?query=${encodeURIComponent(query)}&size=8`;
  
  let contextText = '';
  
  try {
    const headers = { Authorization: `KakaoAK ${key}` };
    
    // Web 검색 페치
    const webRes = await fetch(webUrl, { headers });
    if (webRes.ok) {
      const body = (await webRes.json()) as { documents?: { title: string; contents: string }[] };
      body.documents?.forEach((doc) => {
        contextText += `[웹] ${doc.title}: ${doc.contents}\n`;
      });
    }

    // Blog 검색 페치
    const blogRes = await fetch(blogUrl, { headers });
    if (blogRes.ok) {
      const body = (await blogRes.json()) as { documents?: { title: string; contents: string }[] };
      body.documents?.forEach((doc) => {
        contextText += `[블로그] ${doc.title}: ${doc.contents}\n`;
      });
    }
  } catch (err) {
    console.error(`[WARN] Kakao search failed for: ${query}`, err);
  }
  
  return contextText.trim();
}

// Gemini API를 이용해 비정형 텍스트에서 스케줄 및 스펙 추출
async function extractScheduleWithAI(
  poolName: string,
  context: string,
  geminiKey: string
): Promise<{
  laneInfo: string;
  notice: string;
  freeSwim: any | null;
  applyFull: boolean;
} | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
  
  const systemPrompt = `
You are an expert data assistant. Your job is to extract public swimming pool schedule and lane specification from search context.
Analyze the search snippets about the pool "${poolName}".
Respond ONLY with a valid JSON object matching the schema below. Do not include markdown code block syntax (like \`\`\`json) or any extra conversational text. Return raw JSON.

JSON Schema:
{
  "laneInfo": "string describing lanes e.g. '25m x 6레인' or '50m x 10레인, 수심 1.2m~1.4m' or '' if not found",
  "notice": "holidays or important notices e.g. '매주 첫째 셋째 일요일 휴관' or '' if not found",
  "freeSwim": [
    {
      "weekday": "weekday session description e.g. '1부 06:00~08:00, 2부 09:00~11:00' or ''",
      "sat": "saturday sessions or ''",
      "sun": "sunday/holiday sessions or ''"
    }
  ],
  "applyFull": true
}

Rules:
1. "applyFull" must be true ONLY if you successfully extracted at least one valid freeSwim session time OR a reliable laneInfo from the context. Otherwise, set it to false.
2. If the context has no clear schedule, set freeSwim to null and applyFull to false.
3. Clean all HTML tags and simplify the text to be clean Korean.
`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${systemPrompt}\n\nContext:\n${context}`
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      console.error(`[ERROR] Gemini API status: ${res.status}, body: ${await res.text()}`);
      return null;
    }

    const resBody = await res.json();
    const rawText = resBody?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    return JSON.parse(rawText.trim());
  } catch (error) {
    console.error(`[ERROR] Gemini API extraction failed for: ${poolName}`, error);
    return null;
  }
}

async function main() {
  const kakaoKey = process.env.KAKAO_REST_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  
  if (!kakaoKey || !geminiKey) {
    console.error('[ERROR] KAKAO_REST_KEY와 GEMINI_API_KEY 환경변수가 모두 필요합니다. (.env 확인)');
    process.exit(1);
  }

  // 전체 수영장을 가져와서 메모리에서 필터링 (Prisma JSON null 조회 오류 방지)
  const allPools = await prisma.pool.findMany();
  const pools = allPools.filter((pool) => {
    return !pool.freeSwim || pool.laneInfo === '';
  });

  console.log(`[INFO] Found ${pools.length} pools awaiting AI schedule enrichment.`);

  let enrichedCount = 0;

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const searchQuery = `${pool.sido || ''} ${pool.sigungu || ''} ${pool.name} 자유수영 시간표 레인`.trim();
    
    console.log(`[${i + 1}/${pools.length}] Enriching schedule for: "${pool.name}"...`);
    
    // 1. 카카오 검색으로 컨텍스트 확보
    const context = await getSearchContext(searchQuery, kakaoKey);
    
    if (!context || context.length < 50) {
      console.log(`   -> [SKIP] Too little search context found.`);
      await delay(150);
      continue;
    }

    // 2. Gemini API로 구조화 데이터 추출
    // API 한도 제약을 감안해 순차적 실행 (초당 2~3회 수준 방어 위해 4500ms 딜레이)
    await delay(4500);
    const aiResult = await extractScheduleWithAI(pool.name, context, geminiKey);

    if (aiResult && aiResult.applyFull) {
      const updateData: any = {};
      
      if (aiResult.laneInfo) {
        updateData.laneInfo = aiResult.laneInfo;
      }
      if (aiResult.notice) {
        updateData.notice = aiResult.notice;
      }
      if (aiResult.freeSwim) {
        updateData.freeSwim = aiResult.freeSwim;
      }
      
      // 요금 정보(fees)가 이미 차 있다면 status를 full로 정식 승격
      if (pool.fees && (pool.fees as any).full) {
        updateData.dataStatus = 'full';
      }

      await prisma.pool.update({
        where: { id: pool.id },
        data: updateData
      });

      console.log(`   -> [ENRICHED] Lanes: "${aiResult.laneInfo || 'N/A'}", Status: "${updateData.dataStatus || pool.dataStatus}"`);
      enrichedCount++;
    } else {
      console.log(`   -> [SKIP] AI could not reliably extract schedule details.`);
    }
  }

  console.log(`\n=== AI Schedule Enrichment Completed ===`);
  console.log(`Successfully enriched ${enrichedCount} pools.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
