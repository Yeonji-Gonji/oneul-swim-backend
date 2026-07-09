# PROJECT: oneul-swim-backend 현황판

> 갱신일: 2026-07-09 (P2·P3·P4 코드 구현 완료, 서버 반영 대기)
> 히스토리·의사결정 정본: obsidian vault `projects/oneul-swim.md` (private)
> 로드맵: 프론트 리포 `docs/plan-2026-07-enhancement.md` (P0~P4)
> 운영 런북: [OPERATIONS.md](./OPERATIONS.md)

## 현재 상태

- NestJS 11 + Prisma 6 + PostgreSQL 16. Oracle Cloud A1(오사카)에서 Docker Compose 3컨테이너(caddy+api+db) 운영 중.
- API: `GET /pools`, `POST/GET /reports`, `POST/DELETE /subscriptions`(아침요약) + `POST/DELETE /subscriptions/lessons`(강습 접수소식) + `GET /push/preview`, `GET /health`, `/admin/*`(Bearer). 크론: 매일 08:00 아침요약, 매주 월 09:00 신선도 감시(둘 다 KST).
- 도메인 `https://161-33-15-188.sslip.io` (sslip.io + Caddy 자동 HTTPS). 월 0원(Always Free 한도 내 PAYG).

## 진행 중

- 없음 (코드 완료. 서버 반영은 사용자 액션, OPERATIONS.md 참조)

## 사용자 액션 대기 (코드 완료, 서버/계정 설정만 남음)

- GitHub Secrets 등록(`SSH_HOST`/`SSH_USER`/`SSH_KEY`) → main 푸시 시 CD 자동 배포
- 서버 마이그레이션 채택: `migrate resolve --applied 0_init` → `migrate deploy` → `pnpm seed` (Pool/FeeTier DB 이관)
- `ADMIN_TOKEN`·VAPID 키 서버 `.env` 설정 (VAPID 없으면 강습/신선도 푸시 스킵)
- healthchecks.io(체크 3개)·DuckDNS 서브도메인·백업 크론(매일 03:30) 등록

## 최근 완료

- 2026-07-09 P2 운영 자동화: CD(GHCR+SSH) `deploy.yml`, Prisma migrate 정식 도입(0_init 베이스라인 + 1_data_pipeline), `scripts/backup.sh`·`duckdns.sh`, `docs/OPERATIONS.md`
- 2026-07-09 P3 데이터 파이프라인: Pool/FeeTier/CrawlSnapshot/FreshnessAlert/AdminPushTarget 모델 + `seed.ts` + `GET /pools`(DB→파일 폴백) + `/admin/*` 8종 + 신선도 감시 크론
- 2026-07-09 P4: 강습 "접수 소식 알림"(LessonSubscription + `/subscriptions/lessons` + `/admin/announce`)
- 2026-07-05 Web Push 아침 요약 / 서버 배포

## 알려진 이슈 / 남은 일

- 서버는 아직 `db push` 상태. 위 마이그레이션 채택 절차 실행 전까지 신규 테이블 미생성
- Dockerfile의 `pnpm prune --prod` 제거됨(컨테이너 내 migrate/seed 실행 위해). 이미지 용량 소폭 증가(A1이라 무관)

## 링크

- 프론트: `../oneul-swim-frontend`
- GitHub: Yeonji-Gonji/oneul-swim-backend
- 서버·키 경로: vault `projects/oneul-swim.md`의 "인프라·계정" 참조 (공개 리포에 미기재)
