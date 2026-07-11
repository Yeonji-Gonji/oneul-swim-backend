import { PrismaClient } from '@prisma/client';

/**
 * dataStatus 를 "실데이터 기준"으로 재계산한다.
 *
 * 규칙(스키마 정의와 일치): full = 자유수영 세션이 실제로 있는 시설.
 *   - freeSwim.sessions 가 1개 이상 → 'full'
 *   - 그 외(freeSwim null / sessions 없음/빈배열) → 'listing'
 *
 * 배경: 요금 일괄적재(collect-by-group.ts 의 applyFull)가 시간표 유무와 무관하게
 *   dataStatus 를 'full' 로 올려, 시간표 없는 시설까지 full 로 표기되는 정합성 문제가 생겼다.
 *   요금만으로는 full 이 아니다("full" = 자유수영·요금까지). 이 스크립트가 신뢰 가능한
 *   단일 기준(freeSwim 세션 유무)으로 되돌린다. 재실행 안전(idempotent).
 *
 * 사용:
 *   npx tsx scripts/recompute-data-status.ts        # dry-run: 바뀔 내역만 출력, 미반영
 *   npx tsx scripts/recompute-data-status.ts apply   # 실제 DB 반영
 */

const prisma = new PrismaClient();

/** freeSwim JSON 에 실제 세션이 있는지. 프론트 getPoolNowStatus 의 listing 판정과 동일 기준. */
function hasSessions(freeSwim: unknown): boolean {
  if (!freeSwim || typeof freeSwim !== 'object') return false;
  const sessions = (freeSwim as { sessions?: unknown }).sessions;
  return Array.isArray(sessions) && sessions.length > 0;
}

async function main() {
  const apply = process.argv[2] === 'apply';
  console.log(
    `[INFO] dataStatus 재계산 (${apply ? 'APPLY 모드 — DB 반영' : 'DRY-RUN — 미반영'})`,
  );

  const pools = await prisma.pool.findMany({
    select: { id: true, name: true, sido: true, sigungu: true, freeSwim: true, dataStatus: true },
  });

  const toFull: { id: string; name: string }[] = []; // listing → full 로 올릴 것
  const toListing: { id: string; name: string }[] = []; // full → listing 으로 되돌릴 것

  for (const p of pools) {
    const correct = hasSessions(p.freeSwim) ? 'full' : 'listing';
    if (p.dataStatus === correct) continue;
    if (correct === 'full') toFull.push({ id: p.id, name: p.name });
    else toListing.push({ id: p.id, name: p.name });
  }

  const fullNow = pools.filter((p) => hasSessions(p.freeSwim)).length;
  console.log(`\n총 ${pools.length}곳 | 실데이터상 full=${fullNow}, listing=${pools.length - fullNow}`);
  console.log(`변경 필요: full→listing ${toListing.length}곳, listing→full ${toFull.length}곳`);

  if (toListing.length) {
    console.log(`\n[full→listing] 시간표 없어 되돌릴 시설 (처음 10곳):`);
    for (const p of toListing.slice(0, 10)) console.log(`  - ${p.name} (${p.id})`);
    if (toListing.length > 10) console.log(`  ... 외 ${toListing.length - 10}곳`);
  }
  if (toFull.length) {
    console.log(`\n[listing→full] 시간표 있어 승격할 시설:`);
    for (const p of toFull) console.log(`  - ${p.name} (${p.id})`);
  }

  if (!apply) {
    console.log(`\n[DRY-RUN] 아무것도 반영하지 않았습니다. 실제 적용: 'npx tsx scripts/recompute-data-status.ts apply'`);
    return;
  }

  let updated = 0;
  for (const { id } of toListing) {
    await prisma.pool.update({ where: { id }, data: { dataStatus: 'listing' } });
    updated++;
  }
  for (const { id } of toFull) {
    await prisma.pool.update({ where: { id }, data: { dataStatus: 'full' } });
    updated++;
  }
  console.log(`\n[APPLIED] ${updated}곳 dataStatus 갱신 완료.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
