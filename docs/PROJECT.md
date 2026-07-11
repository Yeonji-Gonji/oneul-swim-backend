# PROJECT: oneul-swim-backend 현황판

> 갱신일: 2026-07-11 (서버 정식 배포 완료 + 전국 확장 Phase 1-2 코드 완료)
> 히스토리·의사결정 정본: obsidian vault `projects/oneul-swim.md` (private)
> 운영 런북: [OPERATIONS.md](./OPERATIONS.md)

## 현재 상태

- NestJS 11 + Prisma 6 + PostgreSQL 16. Oracle Cloud A1(오사카) Docker Compose 3컨테이너(caddy+api+db) 운영 중.
- 도메인 **`https://oneul-swim.duckdns.org`** (DuckDNS + Caddy 자동 HTTPS). 이전 sslip.io에서 전환. 월 0원(Always Free 한도 내 PAYG).
- **Prisma migrate 정식 운영**: `0_init`(채택됨) → `1_data_pipeline`(적용) → `2_nationwide`(적용 대기, 아래). DB에 수영장 데이터 이관 완료(Pool 4 + 요금).
- CD 정상: main 푸시 → GHCR **arm64** 이미지 빌드(QEMU) → 서버 pull → `npx prisma migrate deploy` → 무중단 교체.
- 운영 자동화 가동: 일일 백업 03:30(7일 롤링 + healthchecks 핑), /health 5분 감시, DuckDNS 5분 갱신. healthchecks.io 체크 3개.
- 배포 디렉토리는 서버상 `~/app` (런북/워크플로 경로 그에 맞춤).

## 진행 중 / 남은 일

- **이행 후 정리**: 프론트가 라이브로 `pool.fees`를 읽으면 `/pools`의 top-level `freeSwimPriceTiers` 호환 shim 제거.
- **자유수영 데이터 채우기**: 리스팅(602곳)은 기본정보만 → 지역별 자유수영 시간표·요금을 어드민/제보로 `full` 승격(점진).
- (선택) 정기 재임포트로 신선도 갱신 — `import-kspo.ts` 재실행(upsert).

## 최근 완료

- **2026-07-11 전국 확장 실데이터 임포트**: KSPO 전국체육시설 API(data.go.kr, `SRVC_API_SFMS_FACI/TODZ_API_SFMS_FACI`)에서 `ftype_nm=수영장`·`faci_gb_nm=공공`·`faci_stat_nm=정상운영`·좌표유효 필터 → **공공 수영장 602곳** upsert(`dataStatus=listing`). `/pools` 606곳(기존 4 + 602). 좌표가 API에 내장돼 지오코딩 불필요. 임포터 `scripts/import-kspo.ts`(재실행=신선도 갱신). (엑셀+지오코딩 경로는 폐기; `csv-to-json.ts`/`import-public.ts`는 범용 잔존)
- **2026-07-11 서버 정식 배포**: 최초 마이그레이션 채택(0_init resolve → 1_data_pipeline deploy) + 시드로 Pool/요금 DB 이관. `ADMIN_TOKEN` 배선(compose 누락 버그 수정), 기존 VAPID 유지. sslip.io→DuckDNS 도메인 전환(인증서 재발급). 백업/헬스/DuckDNS 크론 등록.
  - 잡은 버그: compose에 `ADMIN_TOKEN` 미전달(어드민 503) / CD 배포경로 `~/oneul-swim-backend`→실제 `~/app` / CD amd64 빌드가 arm64 서버 부적합(QEMU arm64로 수정) / 런타임 `pnpm`(corepack) deps-check 실패→`npx` 전환 / seed `laneInfo` 누락 크래시→`?? ''`.
- **2026-07-11 전국 확장 Phase 1-2 (코드)**:
  - 요금을 전역 `FeeTier` 테이블 → **시설별 `Pool.fees`(JSON)** 이관. `2_nationwide` 마이그레이션이 기존 요금·지역 스스로 백필 후 FeeTier DROP(트랜잭션, 롤백 안전).
  - `Pool`에 `sido`/`sigungu` + `dataStatus`('listing'|'full') 추가. `freeSwim`/`lessons`/`fees` nullable화(리스팅 전용 시설 대비).
  - `/pools`가 `pool.fees` + top-level 호환 요금표 **동시 제공**(무중단 이행). `/admin/pools/:id` PATCH에 fees/sido/sigungu/dataStatus 추가.
  - 벌크 임포트 도구: `scripts/csv-to-json.ts`(공공데이터 CSV→정규화 JSON), `scripts/import-public.ts`(수영장 필터→지역 파싱→카카오 지오코딩→`listing` upsert).
- 2026-07-09 P2 운영 자동화 / P3 데이터 파이프라인(Pool·FeeTier·신선도) / P4 강습 알림 / 2026-07-05 Web Push·서버 배포 — 상세는 vault.

## 링크

- 프론트: `../oneul-swim-frontend`
- GitHub: Yeonji-Gonji/oneul-swim-backend
- 서버·키 경로: vault `projects/oneul-swim.md`의 "인프라·계정" 참조 (공개 리포에 미기재)
