# PROJECT: oneul-swim-backend 현황판

> 갱신일: 2026-07-11 (테스트 레코드 삭제로 Pool 604→603곳. 자유수영 시간표 54곳·홈페이지77·전화43 실서버 반영 완료. dataStatus full 32→82곳)
> 히스토리·의사결정 정본: obsidian vault `projects/oneul-swim.md` (private)
> 운영 런북: [OPERATIONS.md](./OPERATIONS.md)

## 현재 상태

- NestJS 11 + Prisma 6 + PostgreSQL 16. Oracle Cloud A1(오사카) Docker Compose 3컨테이너(caddy+api+db) 운영 중.
- 도메인 **`https://oneul-swim.duckdns.org`** (DuckDNS + Caddy 자동 HTTPS). 이전 sslip.io에서 전환. 월 0원(Always Free 한도 내 PAYG).
- **Prisma migrate 정식 운영**: `0_init`(채택됨) → `1_data_pipeline`(적용) → `2_nationwide`(적용 완료). DB 현황: **Pool 603곳**(하남 중복 정리 + KSPO 원본 테스트 레코드 삭제 완료), 요금 입력 완료, 자유수영 시간표 82곳 full(나머지는 listing, 진행중).
- CD 정상: main 푸시 → GHCR **arm64** 이미지 빌드(QEMU) → 서버 pull → `npx prisma migrate deploy` → 무중단 교체.
- 운영 자동화 가동: 일일 백업 03:30(7일 롤링 + healthchecks 핑), /health 5분 감시, DuckDNS 5분 갱신. healthchecks.io 체크 3개.
- 배포 디렉토리는 서버상 `~/app` (런북/워크플로 경로 그에 맞춤).

## 진행 중 / 남은 일

- **dataStatus 정합성 재계산 — 2026-07-11 실서버 반영 완료**: `recompute-data-status.ts apply` 실행 → freeSwim 세션 유무 단일 기준으로 재계산, 결과 full=82·listing=522로 **변경 0곳(이미 정합)**. `collect-by-group.ts`도 더는 dataStatus 안 건드림(재발 방지). 재임포트/요금 재적재 후에는 이 스크립트 재실행.
- **시간표 파이프라인 → "AI 초안·어드민 승인" 하이브리드로 재설계(백엔드 코드 완료·배포 대기)**: 기존 enrich 스크립트는 freeSwim 를 자유텍스트로 써서 앱이 읽는 `freeSwim.sessions[{start,end,tier,dayCodes}]` 계약과 불일치 → 성공해도 화면에 안 뜨는 게 실패의 진짜 원인이었음(429는 표면). 재설계:
  - 신규 `ScheduleDraft` 검수 큐 모델 + 마이그레이션 `3_schedule_drafts`(증분 CREATE, 안전).
  - `scripts/enrich-swim-schedules.ts` 재작성: 정규 sessions 스키마만 생성 + 방어 검증(요일·시각 없으면 폐기) → **Pool 에 직접 쓰지 않고 ScheduleDraft(PENDING) 적재**. `limit` 인자로 배치 제어.
  - 어드민 엔드포인트: `GET /admin/schedule-drafts`, `POST .../:id/approve`(교정값 우선, 승인 시 Pool.freeSwim 반영+dataStatus full+updatedAt 갱신), `POST .../:id/reject`.
  - **카카오 로그인 게이트**: 공개 `POST /admin/auth/kakao`(인가코드 검증 → 본인 `ADMIN_KAKAO_ID`일 때만 `ADMIN_TOKEN` 발급). 기존 AdminGuard 그대로 재사용. 프론트 `/admin` 카카오 로그인 + 시간표 초안 검수 UI 완료.
  - **필요 env(서버 .env)**: `ADMIN_KAKAO_ID`(본인 카카오 id), `KAKAO_CLIENT_SECRET`(콘솔에서 켠 경우만). 프론트: `NEXT_PUBLIC_KAKAO_REST_KEY`. 카카오 개발자콘솔: 카카오 로그인 활성화 + Redirect URI(`<도메인>/admin`, `localhost:3000/admin`) 등록.
  - **남은 일**: ① 커밋·push → CD 가 마이그레이션 배포 ② env 세팅 + 카카오 콘솔 설정 ③ 컨테이너에서 enrich 실행해 초안 적재 ④ 카카오 로그인 후 승인 운영. 자동 발행 없음(잘못된 "지금 열림" 방지).
  - **직접 웹수집 경로도 병행 가능(파일럿 완료)**: 하이브리드 배포 전에도, 출처 검수한 회차표를 `data/schedule-pilot.json` + `scripts/apply-schedules.ts apply`로 바로 반영 가능(아래 최근 완료 참조). 공식 홈페이지 있는 시설은 서브에이전트 병렬 웹수집으로 회차 추출 성공. 홈페이지 없는 시설은 원천부재라 제보 크라우드소싱 필요.
- **공공개방데이터 홈페이지·전화 보강 — 계획 완료·서버 apply 대기**: data.go.kr 전국공공시설개방정보 표준데이터(15013117)에서 수영장 142건 중 **좌표매칭(<250m) 112건** 확보. 그중 우리 빈 칸을 채울 수 있는 **공식 websiteUrl 77곳 + 전화 43곳**을 `scripts/import-open-facility.ts` 로 계획화(`data/open-facility-plan.json`, 커밋 대상). 값이 카카오맵 링크가 아니라 실제 공식 홈페이지(도시공사 사이트 등)라 시간표 큐레이션 가속에도 직접 도움. **이 데이터에 자유수영 세션은 없음**(시설 개방시각뿐)이라 freeSwim 은 못 채움. **2026-07-11 실서버 반영 완료**(`import-open-facility.ts apply` → 86곳 보강). 계획파일만 읽으므로 7.7MB 원본은 서버 이관 불필요(gitignore). 재실행 안전(이미 채워진 값 미덮어씀, 재실행 시 0곳).
- **전화번호·웹사이트 enrich(`scripts/enrich-pool-details.ts`)도 사용 가능**: 카카오 로컬 검색 기반. 위 공공개방데이터로 못 채운 나머지의 보완용(카카오 place_url 이 들어가므로 공공개방데이터 apply 를 먼저 돌린 뒤 잔여분에만).
- **이행 후 정리**: 프론트 라이브 이후 `/pools` top-level `freeSwimPriceTiers` 호환 shim 제거.
- **자유수영 시간표 점진 채우기**: 리스팅 602곳 중 시간표 미입력 수영장을 지역별로 어드민/제보로 `full` 승격.
- (선택) 정기 재임포트로 신선도 갱신 — `import-kspo.ts` 재실행(upsert). 재임포트/요금 재적재 후에는 `recompute-data-status.ts`로 dataStatus 재계산할 것.

## 최근 완료

- **2026-07-11 테스트 레코드 삭제(604→603곳)**: KSPO 원본 데이터에 섞여 있던 더미 시설 `테스트공단20171111`(id `kspo-9AFC8D2A713549B8FE1751FC9A899886`, operator·전화 빈값·지역/주소 불일치·listing)이 임포트 필터를 통과해 들어와 있던 것을 확인. api 컨테이너 Prisma `pool.deleteMany({where:{id}})`로 실서버 1건 삭제(멱등). `/pools` `source:db` 603곳·테스트 0건 검증. (재임포트 시 원본에 남아 재유입 가능하나 재임포트 예정 없어 필터 미추가.)
- **2026-07-11 자유수영 시간표 웹수집(38곳 적용대기·233세션)**: 공식 홈페이지 확보 72곳 전체를 운영주체별 서브에이전트 병렬로 회차표 수집(출처 URL 필수·불확실 스킵·시설운영시간과 회차 구분·요금 없으면 비움). 결과 = **적용 대기 54곳(283세션)** `data/schedule-pilot.json` + `scripts/apply-schedules.ts`(fees 불변, dayCodes/HH:mm/tier 계약 검증, dry-run 54곳 스킵0 통과). 1차 수집 39곳 + 보류분 재검토(B)로 15곳 salvage(12~13시 브레이크 분리·강습분리 불가한 평일 제외 등 정제). **보류 14곳** `data/schedule-review.json`(출처 비공식(뉴스·블로그·3자DB) / 데이터 충돌 / 복잡 그리드 / DB중복 → 전화확인·수동검토 필요). 원천부재 skip ~9곳(홈페이지 있어도 시간표 미게시). 정제 원칙: 월정기 등록전용 회차는 제외하고 "지금 가면 되는" 일일 자유수영만, 격주 휴관은 weeksOfMonth로. **핵심 한계**: 이 수율은 "공식 홈페이지 있는 72곳" 한정 — 홈페이지 없는 나머지(~530곳)는 원천부재라 웹수집 불가, 제보 크라우드소싱이 본체. **2026-07-11 실서버 반영 완료**(`apply-schedules.ts apply` → 54곳 283세션, full 32→82). ⚠️ Prisma 직접 write라 `GET /pools` 캐시 미갱신 → **`docker restart app-api-1`로 캐시 비워야 반영됨**(재시작 직후 curl은 부팅 전이라 0, 10~30초 후 정상).
- **2026-07-11 공공개방데이터 보강 임포터 완성(계획 생성 완료)**: data.go.kr 15013117 표준데이터를 좌표(haversine)로만 매칭하는 `scripts/import-open-facility.ts` 작성(이름매칭은 오매칭 심해 폐기). 2단계 워크플로우: dry-run 이 `data/open-facility-plan.json`(소형·커밋) 생성 → 서버 `apply` 가 그 계획만 읽어 반영(원본 7.7MB 는 gitignore). 규칙: 빈 websiteUrl/전화만 채우고 카카오맵 링크·플레이스홀더는 공식 홈페이지로 교체, 요금·시간표·dataStatus 불변. 결과 계획 = website 77 + phone 43(112곳 매칭). 타입체크 그린.
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
