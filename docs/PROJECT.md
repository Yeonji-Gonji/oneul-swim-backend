# PROJECT: oneul-swim-backend 현황판

> 갱신일: 2026-07-09
> 히스토리·의사결정 정본: obsidian vault `projects/oneul-swim.md` (private)
> 로드맵: 프론트 리포 `docs/plan-2026-07-enhancement.md` (P0~P4)

## 현재 상태

- NestJS 11 + Prisma 6 + PostgreSQL 16. Oracle Cloud A1(오사카)에서 Docker Compose 3컨테이너(caddy+api+db) 운영 중.
- API: `POST/GET /reports`(익명 제보), `POST/DELETE /subscriptions` + `GET /push/preview`(Web Push), `GET /health`. 매일 08:00 KST 아침 요약 푸시 크론.
- 도메인 `https://161-33-15-188.sslip.io` (sslip.io + Caddy 자동 HTTPS). 월 0원(Always Free 한도 내 PAYG).

## 진행 중

- 없음 (프론트 P0 완료 후 P2 착수 예정)

## 최근 완료

- 2026-07-05 Web Push 아침 요약(구독 API + 크론 + 만료 구독 자동 정리)
- 2026-07-05 서버 배포: compose up, prisma db push, 헬스체크·제보 검증

## 알려진 이슈 / 남은 일

- 스키마가 `prisma db push` 운영 (P2에서 migrate 정식 도입)
- CD 없음: 배포는 수동 SSH (P2에서 GHCR+SSH 자동화)
- DB 백업·모니터링 없음 (P2)
- Pool 테이블 없음: pools.json 사본을 파일로 읽음 (P3에서 DB 이관 + GET /pools + 미니 어드민)
- 제보가 쌓이기만 함: 상태 처리(PENDING→APPLIED) 루프는 P3 어드민에서 완성

## 링크

- 프론트: `../oneul-swim-frontend`
- GitHub: Yeonji-Gonji/oneul-swim-backend
- 서버·키 경로: vault `projects/oneul-swim.md`의 "인프라·계정" 참조 (공개 리포에 미기재)
