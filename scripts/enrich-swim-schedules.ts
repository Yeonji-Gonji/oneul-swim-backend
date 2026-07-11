import { PrismaClient } from '@prisma/client';

/**
 * 자유수영 시간표 AI 초안 수집기.
 *
 * 카카오 웹/블로그 검색으로 근거 스니펫을 모으고 → Gemini 로 **정규 sessions 스키마**를 추출해
 * → ScheduleDraft(PENDING) 로 적재한다. **Pool 에 바로 쓰지 않는다.**
 * 어드민이 검수·승인해야 Pool.freeSwim 에 반영된다(잘못된 시간 자동발행 방지).
 *
 * 이전 버전은 자유텍스트({weekday,sat,sun})를 freeSwim 에 직접 써서, 앱이 읽는
 * freeSwim.sessions[{start,end,tier,dayCodes,...}] 와 형태가 달라 화면에 전혀 뜨지 않았다.
 * 이번 재작성으로 앱 계약과 100% 일치하는 shape 만 생성한다.
 *
 * 필요 env(컨테이너에 배선됨): KAKAO_REST_KEY, GEMINI_API_KEY
 * 사용:
 *   npx tsx scripts/enrich-swim-schedules.ts        # 기본 30곳까지 초안 생성
 *   npx tsx scripts/enrich-swim-schedules.ts 100     # 100곳까지
 */

const prisma = new PrismaClient();

const DEFAULT_LIMIT = 30;
const GEMINI_DELAY_MS = 4500; // 분당 할당량 방어(순차 실행)

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 정규 세션 shape — 프론트 FreeSwimSession 과 동일. AI 출력 검증에 사용. */
interface DraftSession {
  daysLabel: string;
  dayCodes: number[]; // 0=일 … 6=토 (JS getDay)
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  tier: 'full' | 'half';
  weeksOfMonth?: number[];
  capacity?: number;
  pool?: string;
}

interface AiResult {
  confidence: 'low' | 'medium' | 'high';
  laneInfo: string;
  notice: string;
  sessions: DraftSession[];
}

// 카카오 웹/블로그 검색으로 근거 텍스트 확보
async function getSearchContext(query: string, key: string): Promise<string> {
  const webUrl = `https://dapi.kakao.com/v2/search/web?query=${encodeURIComponent(query)}&size=8`;
  const blogUrl = `https://dapi.kakao.com/v2/search/blog?query=${encodeURIComponent(query)}&size=8`;
  let contextText = '';
  try {
    const headers = { Authorization: `KakaoAK ${key}` };
    const webRes = await fetch(webUrl, { headers });
    if (webRes.ok) {
      const body = (await webRes.json()) as {
        documents?: { title: string; contents: string }[];
      };
      body.documents?.forEach((d) => {
        contextText += `[웹] ${d.title}: ${d.contents}\n`;
      });
    }
    const blogRes = await fetch(blogUrl, { headers });
    if (blogRes.ok) {
      const body = (await blogRes.json()) as {
        documents?: { title: string; contents: string }[];
      };
      body.documents?.forEach((d) => {
        contextText += `[블로그] ${d.title}: ${d.contents}\n`;
      });
    }
  } catch (err) {
    console.error(`[WARN] Kakao search failed for: ${query}`, err);
  }
  return contextText.trim();
}

const SYSTEM_PROMPT = (poolName: string) => `
너는 공공 수영장 "자유수영" 시간표를 검색 스니펫에서 뽑아내는 데이터 추출기다.
아래 스키마의 **순수 JSON** 만 응답해라. 마크다운 코드블록(\`\`\`)이나 설명 문장 금지.

대상 시설: "${poolName}"

JSON 스키마:
{
  "confidence": "low" | "medium" | "high",   // 시작·종료 시각이 명시된 세션을 뽑았으면 medium 이상, 애매하면 low
  "laneInfo": "레인/수심 정보 문자열 또는 ''",   // 예: "25m x 6레인"
  "notice": "휴관/유의사항 또는 ''",
  "sessions": [
    {
      "daysLabel": "표시용 요일 라벨",          // 예: "월~금", "토", "일", "매일"
      "dayCodes": [1,2,3,4,5],                 // 0=일,1=월,2=화,3=수,4=목,5=금,6=토
      "start": "HH:mm",                        // 24시간, 두 자리 (예: "06:00")
      "end": "HH:mm",
      "tier": "full",                          // 요금 등급. 확실치 않으면 항상 "full"
      "weeksOfMonth": [1,2,3,4,5],             // (선택) 특정 주차만 운영 시. 매주면 이 키를 생략
      "capacity": 45                           // (선택) 정원 숫자. 없으면 생략
    }
  ]
}

규칙:
1. **start 와 end 시각이 스니펫에 명시된 세션만** 넣어라. 시각이 불명확하면 그 세션은 넣지 말 것.
2. 뽑을 수 있는 세션이 하나도 없으면 sessions=[] 로 두고 confidence="low".
3. dayCodes 는 daysLabel 과 반드시 일치시켜라(예: "평일"→[1,2,3,4,5], "주말"→[0,6], "토"→[6]).
4. 시각은 반드시 "HH:mm" 24시간 형식(예: 오후 2시 → "14:00").
5. 추측/창작 금지. 스니펫에 없는 시간은 만들지 마라. 오류보다 빈 배열이 낫다.
`;

// Gemini 로 정규 sessions 추출 (429 재시도 포함)
async function extractSessions(
  poolName: string,
  context: string,
  geminiKey: string,
): Promise<AiResult | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: `${SYSTEM_PROMPT(poolName)}\n\nContext:\n${context}` }] },
          ],
        }),
      });

      if (res.status === 429) {
        const bodyText = await res.text();
        const m = bodyText.match(/retryDelay.*?(\d+)s/);
        const waitSec = m ? parseInt(m[1]) + 5 : 60;
        console.log(`   -> [RATE LIMIT] ${waitSec}초 대기 후 재시도 (${attempt + 1}/3)`);
        await delay(waitSec * 1000);
        continue;
      }
      if (!res.ok) {
        console.error(`[ERROR] Gemini ${res.status}: ${await res.text()}`);
        return null;
      }
      const resBody = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      let raw: string | undefined =
        resBody?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) return null;
      raw = raw.replace(/```json/i, '').replace(/```/g, '').trim();
      return JSON.parse(raw) as AiResult;
    }
    console.error(`[ERROR] 3회 재시도 실패: ${poolName}`);
    return null;
  } catch (err) {
    console.error(`[ERROR] Gemini 추출 실패: ${poolName}`, err);
    return null;
  }
}

/** AI 출력 세션이 최소 계약(요일·시각)을 지키는지 방어 검증. 앱이 못 읽는 초안 유입 차단. */
function sanitizeSessions(sessions: unknown): DraftSession[] {
  if (!Array.isArray(sessions)) return [];
  const time = /^\d{1,2}:\d{2}$/;
  const out: DraftSession[] = [];
  for (const s of sessions) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const dayCodes = Array.isArray(o.dayCodes)
      ? o.dayCodes.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6)
      : [];
    if (
      dayCodes.length === 0 ||
      typeof o.start !== 'string' ||
      typeof o.end !== 'string' ||
      !time.test(o.start) ||
      !time.test(o.end)
    ) {
      continue;
    }
    const session: DraftSession = {
      daysLabel: typeof o.daysLabel === 'string' ? o.daysLabel : '',
      dayCodes,
      start: o.start,
      end: o.end,
      tier: o.tier === 'half' ? 'half' : 'full',
    };
    if (Array.isArray(o.weeksOfMonth) && o.weeksOfMonth.length) {
      session.weeksOfMonth = o.weeksOfMonth.filter(
        (n): n is number => Number.isInteger(n),
      );
    }
    if (typeof o.capacity === 'number') session.capacity = o.capacity;
    if (typeof o.pool === 'string' && o.pool) session.pool = o.pool;
    out.push(session);
  }
  return out;
}

async function main() {
  const kakaoKey = process.env.KAKAO_REST_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!kakaoKey || !geminiKey) {
    console.error('[ERROR] KAKAO_REST_KEY, GEMINI_API_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }
  const limit = Number(process.argv[2]) || DEFAULT_LIMIT;

  // 대상: 시간표(freeSwim.sessions)가 아직 없는 시설. 단, 이미 검수 대기(PENDING) 초안이 있으면 제외.
  const pendingPoolIds = new Set(
    (
      await prisma.scheduleDraft.findMany({
        where: { status: 'PENDING' },
        select: { poolId: true },
      })
    ).map((d) => d.poolId),
  );

  const allPools = await prisma.pool.findMany();
  const targets = allPools
    .filter((p) => {
      const fs = p.freeSwim as { sessions?: unknown[] } | null;
      const hasSessions = !!fs && Array.isArray(fs.sessions) && fs.sessions.length > 0;
      return !hasSessions && !pendingPoolIds.has(p.id);
    })
    .slice(0, limit);

  console.log(
    `[INFO] 초안 생성 대상 ${targets.length}곳 (limit=${limit}, PENDING 제외=${pendingPoolIds.size}).`,
  );

  let drafted = 0;
  let skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const pool = targets[i];
    const searchQuery =
      `${pool.sido || ''} ${pool.sigungu || ''} ${pool.name} 자유수영 시간표`.trim();
    console.log(`[${i + 1}/${targets.length}] "${pool.name}" 검색·추출...`);

    const context = await getSearchContext(searchQuery, kakaoKey);
    if (!context || context.length < 50) {
      console.log(`   -> [SKIP] 근거 스니펫 부족`);
      skipped++;
      await delay(150);
      continue;
    }

    await delay(GEMINI_DELAY_MS);
    const ai = await extractSessions(pool.name, context, geminiKey);
    const sessions = sanitizeSessions(ai?.sessions);

    if (!ai || sessions.length === 0) {
      console.log(`   -> [SKIP] 신뢰할 세션 추출 실패`);
      skipped++;
      continue;
    }

    await prisma.scheduleDraft.create({
      data: {
        poolId: pool.id,
        poolName: pool.name,
        sessions: sessions as unknown as object,
        laneInfo: ai.laneInfo || '',
        notice: ai.notice || '',
        sourceContext: context.slice(0, 4000),
        sourceQuery: searchQuery,
        confidence: ['low', 'medium', 'high'].includes(ai.confidence)
          ? ai.confidence
          : 'low',
      },
    });
    console.log(
      `   -> [DRAFT] ${sessions.length}개 세션 초안 적재 (confidence=${ai.confidence})`,
    );
    drafted++;
  }

  console.log(`\n=== 초안 수집 완료 ===`);
  console.log(`적재: ${drafted}곳 | 건너뜀: ${skipped}곳`);
  console.log(`검수: 어드민 → 시간표 초안 → 승인 시 화면 반영.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
