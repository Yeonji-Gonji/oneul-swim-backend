---
project: oneul-swim-backend
type: project-overview
---

# PROJECT: oneul-swim-backend

> 이 문서는 프로젝트 목표와 기술 스택만 담음. 진행 상황(진행 중·완료·다음 할 일·결정 대기)은 적지 않음.
> - **진행 상황·남은 일**: [GitHub Issues](https://github.com/Yeonji-Gonji/oneul-swim-backend/issues)
> - **변경 이력**: `git log`·PR
> - **지금 떠 있는 버전**: 서버 `.env` 의 `API_IMAGE_TAG`(확인 방법은 [OPERATIONS.md §1](OPERATIONS.md))
> - **명령·모듈 구조·데이터 적재**: [README.md](../README.md)
> - **운영 절차와 함정(배포·롤백·백업·도메인·모니터링)**: [OPERATIONS.md](OPERATIONS.md)

## 목표

전국 공공 수영장의 자유수영 시간표·요금·위치를 제공하는 REST API. 프론트([oneul-swim-frontend](https://github.com/Yeonji-Gonji/oneul-swim-frontend))의 데이터 원천이고, 사용자 제보 접수·어드민 검수·Web Push(아침 요약·강습 접수 소식)·데이터 신선도 감시를 맡음.

## 기술 스택

| 영역 | 스택 | 안내 |
| --- | --- | --- |
| 앱 | NestJS 11 · Prisma 6 · PostgreSQL 16 · Node 22 · pnpm · Jest | [README.md](../README.md) |
| 이미지 | `ghcr.io/yeonji-gonji/oneul-swim-backend:sha-<short>`(불변 태그, `latest` 없음), 운영 의존성만 담은 비루트 `node` + dumb-init | `Dockerfile` |
| 운영 서버 | Oracle Cloud A1(`linux/arm64`, Always Free) 1대, Docker Compose 3컨테이너(caddy·api·db, api·db 메모리 상한 각 512m), `https://oneul-swim.duckdns.org`(DuckDNS + Caddy 자동 HTTPS). 같은 서버의 aether-takt API 가 이 caddy 를 입구로 같이 씀 | [OPERATIONS.md](OPERATIONS.md), `docker-compose.yml` |
| CI·CD | `ci.yml`(PR·main, 포맷 검사 + `pnpm check` = lint → typecheck → test → build, 문서 전용 변경은 포맷 검사만), `deploy.yml`(main push 가운데 이미지·배포 파일 경로 → arm64 빌드 → GHCR → `scripts/deploy.sh` → 운영 URL 스모크) | [README.md](../README.md) "명령", [OPERATIONS.md §1](OPERATIONS.md) |
| 백업·감시 | 서버 일일 `pg_dump` + 외부 암호화 사본(`backup-offsite.yml`), healthchecks.io, DuckDNS 갱신 크론 | [OPERATIONS.md §3~5](OPERATIONS.md) |

- **dev 포트**: `pnpm dev` → `http://localhost:3000`(`PORT` env)
- **환경변수 키 목록**: [`.env.example`](../.env.example)(값은 적지 않음)

## 참고 문서

- **프론트**: [oneul-swim-frontend](https://github.com/Yeonji-Gonji/oneul-swim-frontend)
- **의사결정 기록**: [`docs/adr/`](adr/)(동결 참고본)
- **2026-07-31 이전 현황판(데이터 적재 경위 포함)**: [archive/status-2026-07-31.md](archive/status-2026-07-31.md)(작성 시점 값으로 고정)
