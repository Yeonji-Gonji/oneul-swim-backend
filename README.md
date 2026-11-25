# oneul-swim-api

[오늘수영](https://oneul-swim.vercel.app) 백엔드 API. 정적 JSON MVP로 검증을 마친 뒤,
백엔드가 있어야만 가능한 기능(제보 수집)부터 단계적으로 도입한다.

## v1 범위

- `POST /reports` — 시설 정보 오류 제보 등록 (IP당 분당 5회 제한)
- `GET /reports?deviceId=` — 내 제보 내역 (익명 localStorage UUID 기준, 최근 20건)
- `GET /health` — DB 연결 포함 헬스체크

회원가입 없이 익명 `deviceId`로 제보를 묶는다. 이 앱에 로그인은 과설계라고 판단했다.

## v2 범위 — 데이터 파이프라인 + 미니 어드민

- `GET /pools` — 수영장 전체 데이터 (프론트 `data/pools.json` 과 동일 shape, `_meta.source: db|file`)

미니 어드민(아래 전부 `Authorization: Bearer <ADMIN_TOKEN>` 필요, 미설정 시 503):

- `GET /admin/reports?status=PENDING` — 제보 목록 (최근순, 최대 100건)
- `PATCH /admin/reports/:id` `{status}` — 제보 상태 변경 (PENDING|APPLIED|REJECTED)
- `PATCH /admin/pools/:id` `{notice?,freeSwim?,lessons?,phone?,laneInfo?,updatedAt?}` — 수영장 무배포 갱신
- `PUT /admin/fees` `{tiers:{full,half}}` — 요금표 전체 교체
- `GET /admin/freshness?resolved=false` — 원본 변경 알림 목록
- `PATCH /admin/freshness/:id` `{resolved}` — 알림 처리
- `POST /admin/push-target` `{endpoint,p256dh,auth}` — 관리자 알림 수신 기기 등록
- `POST /admin/announce` `{title,body}` — 강습 접수 소식 구독자 전체에게 푸시 (`{sent,failed}` 반환)

Web Push 구독(인증 없음):

- `POST /subscriptions` `{endpoint,keys:{p256dh,auth}}` — 아침 요약 구독 (분당 5회)
- `DELETE /subscriptions` `{endpoint}` — 아침 요약 구독 해제
- `POST /subscriptions/lessons` `{endpoint,p256dh,auth}` — 강습 접수 소식 구독 (분당 5회)
- `DELETE /subscriptions/lessons` `{endpoint}` — 강습 접수 소식 구독 해제

신선도 감시: 매주 월 09:00(KST) 크론이 각 `sourceUrl` 을 해시 비교해 변경을 감지한다.
자동 반영은 하지 않고(원본 표가 불안정) 알림 레코드 + (등록 시)관리자 푸시만 남긴다.

## 스택

NestJS 11 · Prisma 6 · PostgreSQL 16 · Docker Compose(Caddy + API + DB) · GitHub Actions

## 로컬 개발

```bash
pnpm install
pnpm prisma:generate
cp .env.example .env   # DATABASE_URL 수정
pnpm dev               # http://localhost:3000 (PORT env)
```

컨테이너로 띄울 때는 `.env` 에 `API_IMAGE_TAG=local` 을 두고 `docker compose build api && docker compose up -d`(`docker-compose.yml` 머리 주석).

## 명령

- `pnpm check`: PR 을 올리기 전에 돌리는 일괄 검사. `prisma generate` → `lint` → `typecheck` → `test` → `build` 순서이고 CI 가 같은 명령을 돌린다
- `pnpm format` / `pnpm format:check`: Prettier 로 고치기 / 검사만 하기. 설정은 `prettier.config.mjs`, 제외 목록은 `.prettierignore`(`docs/`·`data/`·잠금 파일)
- `pnpm lint`: ESLint(`eslint.config.mjs`). 생성자 주입용 클래스는 `import type` 이 아니라 일반 import 로 가져온다(데코레이터 메타데이터가 클래스를 값으로 참조한다). 설정이 같은 전제로 검사한다
- `pnpm typecheck` · `pnpm test` · `pnpm build`: 각각 `tsc --noEmit`(`src`·`test`), Jest 단위 테스트(`test/*.spec.ts`, DB 불필요), `dist/` 컴파일
- `pnpm dev` · `pnpm start`: tsx 감시 실행 / 빌드해 둔 `dist/main.js` 실행
- `pnpm prisma:generate` · `pnpm prisma:migrate` · `pnpm seed`: Prisma 클라이언트 생성 / 마이그레이션 적용(`migrate deploy`) / `data/pools.json` 시드

PR 게이트는 `.github/workflows/ci.yml` 의 잡 `verify`(main 룰셋 `main-pr-ci` 의 필수 체크)다. 포맷 검사는 늘 돌고, `docs/` 와 `*.md` 만 바꾼 변경은 `pnpm check` 를 건너뛴다.

- **테스트와 로컬 `.env`**: `@prisma/client` 는 import 될 때 루트 `.env` 를 읽는다. `test/setup.ts` 가 VAPID 키를 먼저 비워 두므로 로컬 `.env` 값과 무관하게 CI 와 같은 조건으로 돈다. 서비스 생성자가 읽는 환경변수를 새로 만들면 같은 파일에 더한다
- **의존성 구분**: 운영 이미지에는 `dependencies` 만 들어간다. 컨테이너 안에서 쓰는 도구(`prisma` CLI·`tsx`)는 `dependencies` 에, 테스트·린트·컴파일 도구는 `devDependencies` 에 둔다. 데이터 스크립트가 새 패키지를 쓰면 `dependencies` 에 넣는다

## 모듈 구조

| 영역          | 경로 / 모듈                                                               | 역할 및 고정 규칙                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 부트스트랩    | `src/main.ts`, `src/app.module.ts`                                        | CORS = `CORS_ORIGINS`(콤마 구분), 전역 ValidationPipe(whitelist·transform), shutdown hooks                                                             |
| 수영장 조회   | `src/pools/` (`GET /pools`)                                               | DB 우선 + `data/pools.json` 폴백(`pools-file.ts`), 응답 조립 `pools.assembler.ts`, 메모리 캐시(TTL 5분, 어드민 갱신 시 무효화)                         |
| 제보          | `src/reports/` (`POST /reports`)                                          | 사용자 제보 접수. 처리 상태는 어드민이 PATCH                                                                                                           |
| 푸시          | `src/push/` (`/subscriptions`, `/subscriptions/lessons`, `/push/preview`) | VAPID Web Push, 아침 요약 `@Cron('0 8 * * *')`(`morning-summary.ts`), 강습 접수 소식                                                                   |
| 어드민        | `src/admin/` (`/admin/*`, `AdminGuard` Bearer)                            | 제보 처리·시설/요금 PATCH·신선도 알림·공지 발송. 인증 테스트 = `test/admin-auth.spec.ts`                                                               |
| 어드민 인증   | `src/admin/admin-auth.controller.ts` (`POST /admin/auth/kakao`)           | 카카오 인가코드 검증 → `ADMIN_KAKAO_ID` 본인만 `ADMIN_TOKEN` 발급                                                                                      |
| 신선도        | `src/freshness/`                                                          | 크롤 스냅샷 diff → `FreshnessAlert`                                                                                                                    |
| 헬스          | `src/health/` (`GET /health`)                                             | DB `SELECT 1` 포함 readiness. 200 이면 DB 연결까지 정상                                                                                                |
| 데이터 모델   | `prisma/schema.prisma`                                                    | Report · PushSubscription · LessonSubscription · Pool(fees·freeSwim JSON, sido/sigungu, dataStatus) · CrawlSnapshot · FreshnessAlert · AdminPushTarget |
| 마이그레이션  | `prisma/migrations/`                                                      | 번호순 적용(`0_init` 부터). 되돌릴 수 없으므로 롤백 시 호환성은 [OPERATIONS.md §1](docs/OPERATIONS.md)                                                 |
| 운영 스크립트 | `scripts/deploy.sh`, `scripts/backup.sh`, `scripts/duckdns.sh`            | 배포·서버 크론. 절차는 [OPERATIONS.md](docs/OPERATIONS.md)                                                                                             |

## 데이터 적재

- 시드: `pnpm seed`(또는 `prisma db seed`) 로 `data/pools.json` → Pool/FeeTier 테이블.
- 적재 스크립트는 `scripts/*.ts`, 입력물은 `data/*.json`. 각 스크립트의 실행법·입력은 파일 머리 주석.
  - `import-kspo.ts`: 국민체육진흥공단 전국체육시설 API 벌크 임포트
  - `import-open-facility.ts`: 전국공공시설개방정보 표준데이터로 홈페이지·전화·좌표 보강
  - `collect-by-group.ts`: 지역 그룹 단위 요금 일괄 적용(`data/group-fees.json`)
  - `apply-schedules.ts`: 검수한 자유수영 시간표 벌크 적재(`data/schedule-pilot.json`)
  - `recompute-data-status.ts`: `dataStatus` 재계산(`full` = 자유수영 세션이 있는 시설). 데이터 재임포트·요금 재적재 뒤에 돌린다
- 운영 컨테이너 안에서는 `pnpm` 대신 `npx tsx scripts/<이름>.ts` 로 실행한다(`Dockerfile` 주석). 컨테이너 안에서 쓸 수 있는 폴더는 `data/` 뿐이다(코드와 의존성은 root 소유).
- 스크립트는 Prisma 로 DB 에 직접 쓰므로 `GET /pools` 메모리 캐시가 비워지지 않는다. TTL(5분)이 지나면 반영되고, 바로 반영하려면 `docker compose restart api`(재시작 직후 10~30초는 부팅 중).

## 배포

`main` 머지가 곧 운영 배포다. 운영 이미지나 서버 배포 파일에 들어가는 경로(`src/`·`prisma/`·`data/`·`scripts/`·의존성·`Dockerfile`·`docker-compose.yml`·`Caddyfile`)가
바뀐 커밋에서 `.github/workflows/deploy.yml` 이 arm64 이미지를 GHCR 에 불변 태그로 올리고 서버에서 `scripts/deploy.sh` 를 실행한 뒤
운영 URL 을 확인한다(Caddyfile 검사 → 마이그레이션 → 기동 → 헬스체크 → 실패 시 직전 태그로 자동 롤백). 테스트·문서·린트 설정만 바꾼 커밋은 배포하지 않는다.
그래서 main 에 직접 push 하지 않고 브랜치 → PR → CI 통과 → 머지로 올린다.
수동 배포·롤백·마이그레이션 채택·Secrets·백업·healthchecks.io·DuckDNS 절차와 운영 함정은 [docs/OPERATIONS.md](docs/OPERATIONS.md).
