# ADR-0002: 미가동 AI 시간표 수집 경로(enrich 스크립트·Gemini·ScheduleDraft 검수 큐)를 제거한다

- 날짜: 2026-10-26
- 상태: 채택
- 관련: `prisma/migrations/4_drop_schedule_drafts`, 프론트 `oneul-swim-frontend` 어드민 "시간표 초안" 탭 제거

## 배경

2026-07 에 카카오 검색 + Gemini 추출로 자유수영 시간표 초안을 만들어 `ScheduleDraft` 큐에 쌓고 어드민이 승인하는 경로를 만들었다.
2026-07-30 수집 전략을 "사용자 제보 + 출처 검수된 웹수집 벌크 적재(`scripts/apply-schedules.ts`)"로 바꾸면서 이 경로는 한 번도 가동하지 않았다.
2026-10-26 실측: 운영 `ScheduleDraft` 0행, 서버 `.env` 에 `GEMINI_API_KEY` 없음. 쓰지 않는 코드가 스키마·어드민 API·프론트 탭·문서에 걸쳐 남아 있었다.

## 검토한 대안

1. 유지하고 문서에 "미가동"만 표기 — 변경은 없지만 읽는 사람마다 쓰이는 경로인지 다시 확인해야 한다.
2. 스크립트·키만 제거하고 검수 큐는 남겨 다른 입력원에 재사용 — 재사용 계획이 없는 상태로 테이블·엔드포인트가 남는다.
3. 경로 전체 제거(스크립트, `ScheduleDraft`·`DraftStatus`, 어드민 엔드포인트 3개와 DTO, 프론트 탭). (채택)

## 결정

대안 3. 마이그레이션 `4_drop_schedule_drafts` 가 테이블과 enum 을 지운다(0행이라 데이터 손실 없음).

## 결과

- 검증: 운영 덤프를 로컬 Postgres 에 복원 → 새 이미지 `migrate deploy` → 테이블·enum 삭제 확인 → 기동, `/health` 200, `/pools` 603곳, `/admin/schedule-drafts` 404.
- 되살리려면 git 이력의 `3_schedule_drafts` DDL 과 `scripts/enrich-swim-schedules.ts` 를 새 커밋으로 복원한다.
