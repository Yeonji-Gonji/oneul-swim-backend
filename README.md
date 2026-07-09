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

데이터 적재: `pnpm seed`(또는 `prisma db seed`) 로 `data/pools.json` → Pool/FeeTier 테이블.

신선도 감시: 매주 월 09:00(KST) 크론이 각 `sourceUrl` 을 해시 비교해 변경을 감지한다.
자동 반영은 하지 않고(원본 표가 불안정) 알림 레코드 + (등록 시)관리자 푸시만 남긴다.

## 스택

NestJS 11 · Prisma 6 · PostgreSQL 16 · Docker Compose(Caddy + API + DB) · GitHub Actions

## 로컬 개발

```bash
pnpm install
pnpm prisma:generate
cp .env.example .env   # DATABASE_URL 수정
pnpm dev
```

테스트/검증: `pnpm test` · `pnpm typecheck` · `pnpm build`

## 배포 (VPS 1대)

```bash
# 서버에서
cp .env.example .env   # POSTGRES_PASSWORD, API_DOMAIN, CORS_ORIGINS 설정
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
```

HTTPS 인증서는 Caddy가 자동 발급/갱신한다.

`main` 푸시 시 GitHub Actions(`.github/workflows/deploy.yml`)가 GHCR 이미지 빌드·푸시 후
서버에 SSH 로 `pull → migrate deploy → up` 을 자동 수행한다. 마이그레이션 채택 절차,
필요한 Secrets, 백업 크론, healthchecks.io·DuckDNS 설정은 [docs/OPERATIONS.md](docs/OPERATIONS.md) 참고.

## 로드맵

- v1.5: 강습 접수 소식 알림(구독 + 어드민 발송) + Web Push(VAPID) + 스케줄러 ✅
- v2: 수영장 데이터 DB 이관 + 어드민 CRUD (배포 없이 요금/시간표 갱신) ✅
- 운영: Prisma 마이그레이션 + GHCR + SSH 자동 배포 + 일일 pg_dump 백업 + healthchecks.io 모니터링 ✅
