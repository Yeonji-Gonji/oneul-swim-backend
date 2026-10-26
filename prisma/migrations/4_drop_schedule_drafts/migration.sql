-- 자유수영 시간표 AI 초안 검수 큐(ScheduleDraft) 제거.
-- 2026-07-30 수집 전략 피벗 뒤 한 번도 가동하지 않았고(운영 행 0건, 2026-10-26 실측) 2026-10-26 결정으로 경로 전체를 제거한다.
-- 되살리려면 git 이력의 3_schedule_drafts 와 같은 DDL 을 새 마이그레이션으로 다시 만든다.

-- DropTable
DROP TABLE IF EXISTS "ScheduleDraft";

-- DropEnum
DROP TYPE IF EXISTS "DraftStatus";
