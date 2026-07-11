-- 자유수영 시간표 AI 초안 검수 큐(ScheduleDraft).
-- enrich-swim-schedules 스크립트가 PENDING 초안을 적재하고, 어드민 승인 시 Pool.freeSwim 에 반영.
-- 증분 CREATE 전용(기존 데이터 무변경, DROP TABLE 로 완전 롤백 가능).

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ScheduleDraft" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "poolName" TEXT NOT NULL,
    "sessions" JSONB NOT NULL,
    "laneInfo" TEXT NOT NULL DEFAULT '',
    "notice" TEXT NOT NULL DEFAULT '',
    "sourceContext" TEXT NOT NULL DEFAULT '',
    "sourceQuery" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleDraft_status_createdAt_idx" ON "ScheduleDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleDraft_poolId_idx" ON "ScheduleDraft"("poolId");
