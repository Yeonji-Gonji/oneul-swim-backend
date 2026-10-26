---
project: oneul-swim-backend
type: project-status
status: 운영
updated: 2026-10-26
---

# PROJECT: oneul-swim-backend 온보딩 시트

> **이 문서는 리포 온보딩·아키텍처·고정 함정 시트다.**
> - **현재 라이브 배포 버전 기준**: 서버 `~/app/.env` 의 `API_IMAGE_TAG` · `https://oneul-swim.duckdns.org/health` · `git log`
> - **남은 일·결정 필요**: GitHub Issues ("허브 기준 점검 2026-10-26" 이슈가 보강 체크리스트)
> - **변경 이력·왜 그렇게 정했는지**: `git log`·PR 및 [`docs/adr/`](adr/)
> - **운영 절차(배포·롤백·백업·도메인·모니터링)**: [OPERATIONS.md](OPERATIONS.md)
> - 2026-07-31 이전 현황판(데이터 적재 경위 포함)은 [archive/status-2026-07-31.md](archive/status-2026-07-31.md)(작성 시점 값으로 고정). 이 문서에는 날짜별 진행 상태를 적지 않는다.

## 요약

전국 공공 수영장(약 600곳)의 자유수영 시간표·요금·위치를 제공하는 REST API. 프론트([oneul-swim-frontend](https://github.com/Yeonji-Gonji/oneul-swim-frontend))의
데이터 원천이고, 사용자 제보 접수·어드민 검수·Web Push(아침 요약·강습 접수 소식)·데이터 신선도 감시를 담당한다.

## 핵심 사양

- **스택**: NestJS 11 · Prisma 6 · PostgreSQL 16 · Node 22 · pnpm · Jest
- **dev 포트**: `pnpm dev` → http://localhost:3000 (`PORT` env), 로컬 DB 는 `DATABASE_URL`
- **도메인 / 배포 타겟**: `https://oneul-swim.duckdns.org` (DuckDNS + Caddy 자동 HTTPS). Oracle Cloud A1(arm64, Always Free) 1대에 Docker Compose 3컨테이너(caddy·api·db)
- **이미지**: `ghcr.io/yeonji-gonji/oneul-swim-backend:sha-<short>` (GHCR public, 불변 태그, `latest` 없음). 비루트(`node`) + dumb-init(PID 1)
- **CI**: `.github/workflows/ci.yml` = typecheck → test → build (PR·main, 문서 전용 변경 제외) · **CD**: `deploy.yml` = main push 시 arm64 빌드 → GHCR → `scripts/deploy.sh`
- **데이터 적재 스크립트**: `scripts/*.ts` (KSPO 임포트·공공개방데이터 보강·요금 일괄 적용·시간표 벌크 적재·dataStatus 재계산). 입력물은 `data/*.json`

## 배포 · 환경 구조 (고정 규칙 및 함정)

- **배포 방식**: main push(문서 제외) → 이미지 빌드 → 서버 `~/app` 에 compose·Caddyfile·`scripts/deploy.sh` 동기화 → `deploy.sh <태그>`.
  스크립트가 pull → `.env` 태그 기록 → `prisma migrate deploy` → up → `/health` 폴링(60초) → 실패 시 직전 태그로 자동 롤백. 수동 배포·롤백도 같은 스크립트([OPERATIONS.md §1](OPERATIONS.md)).
  main 머지가 곧 운영 배포이므로 main 에 직접 push 하지 않고 브랜치 → PR → CI 통과 → 머지.
- **런타임 환경변수(서버 `~/app/.env`, 키 목록 = [`.env.example`](../.env.example))**: `API_IMAGE_TAG`(배포 스크립트가 관리) · `POSTGRES_PASSWORD` · `API_DOMAIN` · `CORS_ORIGINS` ·
  `ADMIN_TOKEN` · `ADMIN_KAKAO_ID`/`KAKAO_REST_KEY`/`KAKAO_CLIENT_SECRET`(어드민 카카오 로그인) · `VAPID_*`(Web Push).
  `ADMIN_TOKEN` 이 비면 `/admin/*` 는 503, VAPID 가 비면 푸시 발송은 `{sent:0, failed:0}` 로 조용히 건너뛴다.
- **네트워크**: caddy 만 80/443 publish. api 는 publish 하지 않는다(caddy 가 `api:3000`). db 는 `127.0.0.1:5432` 루프백만(GUI 툴은 SSH 터널).
- **로그**: 세 서비스 모두 json-file `max-size 10m × max-file 3`. 컨테이너 교체 시 이전 로그는 사라진다.
- **운영·검증 함정**
  - 배포 서버는 arm64 다. 이미지는 QEMU 로 `linux/arm64` 크로스 빌드한다. amd64 이미지는 뜨지 않는다.
  - 컨테이너 안에서는 `pnpm` 대신 `npx`(prisma)·`npx tsx`(seed)를 쓴다. 런타임 pnpm 은 deps 재검사로 실패한다.
  - `/health` 는 `SELECT 1` 로 DB 까지 본다(readiness). 200 이면 DB 연결까지 정상.
  - `GET /pools` 는 메모리 캐시다. 스크립트로 Prisma 에 직접 쓰면 캐시가 안 바뀐다. `docker compose restart api` 로 비운다(재시작 직후 10~30초는 부팅 중).
  - Prisma 마이그레이션은 되돌릴 수 없다. 스키마 변경 배포를 롤백할 때는 구 코드와 새 스키마의 호환을 먼저 본다.
  - 마이그레이션 `0_init` 은 기존 DB 에 "적용됨"으로 표시만 한 것이다(`migrate resolve --applied`). 새 서버에 처음 띄울 때는 그대로 deploy 하면 된다.
  - 데이터 재임포트·요금 재적재 후에는 `scripts/recompute-data-status.ts` 로 `dataStatus` 를 재계산한다.
- **백업·감시**: 서버 일일 `pg_dump` 7일 롤링(`scripts/backup.sh`, 크론 03:30 UTC) + 외부 암호화 사본 30일(`backup-offsite.yml`, age, 04:00 UTC) · healthchecks.io 체크(health 핑·백업) · DuckDNS 갱신 크론. 절차는 [OPERATIONS.md §3~5](OPERATIONS.md).
- **문서 구성**: 1인 운영이라 운영 절차는 `OPERATIONS.md` 하나에 둔다(upfall 의 `docs/deploy/` 4종 대신). env 사전 = 이 문서의 환경변수 절 + `.env.example`. 2026-10-26 결정.

## 아키텍처 · 기능 모듈 지도

| 영역 | 경로 / 모듈 | 역할 및 고정 규칙 |
| --- | --- | --- |
| 부트스트랩 | `src/main.ts`, `src/app.module.ts` | CORS = `CORS_ORIGINS`(콤마 구분), 전역 ValidationPipe(whitelist·transform), shutdown hooks |
| 수영장 조회 | `src/pools/` (`GET /pools`) | DB 우선 + `data/pools.json` 폴백(`pools-file.ts`), 응답 조립 `pools.assembler.ts`, 메모리 캐시 |
| 제보 | `src/reports/` (`POST /reports`) | 사용자 제보 접수. 처리 상태는 어드민이 PATCH |
| 푸시 | `src/push/` (`/subscriptions`, `/subscriptions/lessons`, `/push/preview`) | VAPID Web Push, 아침 요약 `@Cron('0 8 * * *')`(`morning-summary.ts`), 강습 접수 소식 |
| 어드민 | `src/admin/` (`/admin/*`, `AdminGuard` Bearer) | 제보 처리·시설/요금 PATCH·신선도 알림·공지 발송. 인증 테스트 = `test/admin-auth.spec.ts` |
| 어드민 인증 | `src/admin/admin-auth.controller.ts` (`POST /admin/auth/kakao`) | 카카오 인가코드 검증 → `ADMIN_KAKAO_ID` 본인만 `ADMIN_TOKEN` 발급 |
| 신선도 | `src/freshness/` | 크롤 스냅샷 diff → `FreshnessAlert` |
| 헬스 | `src/health/` (`GET /health`) | DB `SELECT 1` 포함 readiness |
| 데이터 모델 | `prisma/schema.prisma` | Report · PushSubscription · LessonSubscription · Pool(fees·freeSwim JSON, sido/sigungu, dataStatus) · CrawlSnapshot · FreshnessAlert · AdminPushTarget |
| 마이그레이션 | `prisma/migrations/` | `0_init` → `1_data_pipeline` → `2_nationwide` → `3_schedule_drafts` → `4_drop_schedule_drafts`(AI 초안 큐 제거, 2026-10-26) |
| 운영 스크립트 | `scripts/backup.sh`, `scripts/duckdns.sh`, `scripts/deploy.sh` | 크론·배포. 서버 `~/app/scripts/` 에 동기화 |

## 참고 / 외부 링크

- 프론트: [oneul-swim-frontend](https://github.com/Yeonji-Gonji/oneul-swim-frontend)
- 이슈 추적: GitHub Issues
- 의사결정 기록: [`docs/adr/`](adr/)
