# PROJECT: oneul-swim-backend 현황판

> 갱신일: 2026-07-11 (서버 배포·전국 실데이터 적재 완료 + dataStatus 정합성 재계산 코드 완료·서버 apply 대기)
> 히스토리·의사결정 정본: obsidian vault `projects/oneul-swim.md` (private)
> 운영 런북: [OPERATIONS.md](./OPERATIONS.md)

## 현재 상태

- NestJS 11 + Prisma 6 + PostgreSQL 16. Oracle Cloud A1(오사카) Docker Compose 3컨테이너(caddy+api+db) 운영 중.
- 도메인 **`https://oneul-swim.duckdns.org`** (DuckDNS + Caddy 자동 HTTPS). 이전 sslip.io에서 전환. 월 0원(Always Free 한도 내 PAYG).
- **Prisma migrate 정식 운영**: `0_init`(채택됨) → `1_data_pipeline`(적용) → `2_nationwide`(적용 완료). DB 현황: Pool 604곳(하남 중복 정리 완료), 요금 입력 완료, 자유수영 시간표 32곳 입력(나머지는 listing, 진행중).
- CD 정상: main 푸시 → GHCR **arm64** 이미지 빌드(QEMU) → 서버 pull → `npx prisma migrate deploy` → 무중단 교체.
- 운영 자동화 가동: 일일 백업 03:30(7일 롤링 + healthchecks 핑), /health 5분 감시, DuckDNS 5분 갱신. healthchecks.io 체크 3개.
- 배포 디렉토리는 서버상 `~/app` (런북/워크플로 경로 그에 맞춤).

## 진행 중 / 남은 일

- **dataStatus 정합성 재계산 — 서버 apply 대기(코드 완료)**: 요금 일괄적재(collect-by-group `applyFull=true`)가 시간표 유무와 무관하게 604곳 전부를 `full`로 승격시켜, 실제 시간표는 32곳뿐인데 572곳이 `full`로 잘못 표기됨. 화면은 프론트가 freeSwim 실데이터로 판정해 정상이나, "채울 대상" 추적 신호가 사라짐. 해결: ① `scripts/recompute-data-status.ts` 신규(freeSwim 세션 유무 단일 기준으로 재계산, 기본 dry-run·`apply` 인자로 반영) ② `collect-by-group.ts`가 더는 dataStatus를 건드리지 않도록 수정(재발 방지). **서버에서 `npx tsx scripts/recompute-data-status.ts apply` 실행 필요**(백업 후).
- **시간표 파이프라인 실패 진행중**: `scripts/enrich-swim-schedules.ts`(카카오 검색 → Gemini 추출 → DB 저장) 재시도 중. 실패 원인 두 가지: ① Gemini API 429(분당 제한) ② 웹에 시간표 자체가 없는 수영장 다수(건너뜀 비율 높음). 자동화로는 한계 도달 → 어드민+제보 크라우드소싱으로 전환 검토.
- **이행 후 정리**: 프론트 라이브 이후 `/pools` top-level `freeSwimPriceTiers` 호환 shim 제거.
- **자유수영 시간표 점진 채우기**: 리스팅 602곳 중 시간표 미입력 수영장을 지역별로 어드민/제보로 `full` 승격.
- (선택) 정기 재임포트로 신선도 갱신 — `import-kspo.ts` 재실행(upsert). 재임포트/요금 재적재 후에는 `recompute-data-status.ts`로 dataStatus 재계산할 것.

## 최근 완료

- **2026-07-11 요금 데이터 일괄 적재 완료**: 공공 수영장 요금은 지자체 도시공사 단위로 동일 적용된다는 점에 착안. 카카오 검색으로 도시공사별 요금을 조사해 `data/group-fees.json`에 정리 후, `scripts/collect-by-group.ts apply`로 시군구 기준 DB 수영장 전체에 일괄 적용. 개별 시설 홈페이지를 뒤지는 대신 도시공사 단위로 조사해 커버리지를 높임. 요금 미확인 시설은 `pilot_results.json`(개별 조사결과)을 `scripts/apply-pilot-results.ts`로 적용해 보완. 결과: `dataStatus=full` 승격 처리 완료.
- **2026-07-11 전국 확장 실데이터 임포트**: KSPO 전국체육시설 API(data.go.kr, `SRVC_API_SFMS_FACI/TODZ_API_SFMS_FACI`)에서 `ftype_nm=수영장`·`faci_gb_nm=공공`·`faci_stat_nm=정상운영`·좌표유효 필터 → **공공 수영장 602곳** upsert(`dataStatus=listing`). `/pools` 606곳(기존 4 + 602). 좌표가 API에 내장돼 지오코딩 불필요. 임포터 `scripts/import-kspo.ts`(재실행=신선도 갱신). (엑셀+지오코딩 경로는 폐기)
- **2026-07-11 서버 정식 배포**: 최초 마이그레이션 채택(0_init resolve → 1_data_pipeline deploy) + 시드로 Pool/요금 DB 이관. `ADMIN_TOKEN` 배선(compose 누락 버그 수정), 기존 VAPID 유지. sslip.io→DuckDNS 도메인 전환(인증서 재발급). 백업/헬스/DuckDNS 크론 등록.
  - 잡은 버그: compose에 `ADMIN_TOKEN` 미전달(어드민 503) / CD 배포경로 `~/oneul-swim-backend`→실제 `~/app` / CD amd64 빌드가 arm64 서버 부적합(QEMU arm64로 수정) / 런타임 `pnpm`(corepack) deps-check 실패→`npx` 전환 / seed `laneInfo` 누락 크래시→`?? ''`.
- **2026-07-11 전국 확장 Phase 1-2 (코드 + 마이그레이션 적용)**:
  - 요금을 전역 `FeeTier` 테이블 → **시설별 `Pool.fees`(JSON)** 이관. `2_nationwide` 마이그레이션이 기존 요금·지역 스스로 백필 후 FeeTier DROP(트랜잭션, 롤백 안전).
  - `Pool`에 `sido`/`sigungu` + `dataStatus`('listing'|'full') 추가. `freeSwim`/`lessons`/`fees` nullable화(리스팅 전용 시설 대비).
  - `/pools`가 `pool.fees` + top-level 호환 요금표 **동시 제공**(무중단 이행). `/admin/pools/:id` PATCH에 fees/sido/sigungu/dataStatus 추가.
- 2026-07-09 P2 운영 자동화 / P3 데이터 파이프라인(Pool·FeeTier·신선도) / P4 강습 알림 / 2026-07-05 Web Push·서버 배포 - 상세는 vault.

## 링크

- 프론트: `../oneul-swim-frontend`
- GitHub: Yeonji-Gonji/oneul-swim-backend
- 서버·키 경로: vault `projects/oneul-swim.md`의 "인프라·계정" 참조 (공개 리포에 미기재)
