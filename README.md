# oneul-swim-api

[오늘수영](https://oneul-swim.vercel.app) 백엔드 API. 정적 JSON MVP로 검증을 마친 뒤,
백엔드가 있어야만 가능한 기능(제보 수집)부터 단계적으로 도입한다.

## v1 범위

- `POST /reports` — 시설 정보 오류 제보 등록 (IP당 분당 5회 제한)
- `GET /reports?deviceId=` — 내 제보 내역 (익명 localStorage UUID 기준, 최근 20건)
- `GET /health` — DB 연결 포함 헬스체크

회원가입 없이 익명 `deviceId`로 제보를 묶는다. 이 앱에 로그인은 과설계라고 판단했다.

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

## 로드맵

- v1.5: 강습 등록일 알림 구독 + Web Push(VAPID) + 스케줄러
- v2: 수영장 데이터 DB 이관 + 어드민 CRUD (배포 없이 요금/시간표 갱신)
- 운영: 일일 pg_dump 백업, Uptime Kuma 모니터링, GHCR + SSH 자동 배포
