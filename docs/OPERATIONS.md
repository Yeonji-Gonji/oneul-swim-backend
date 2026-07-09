# 운영 런북 (오늘수영 백엔드)

서버: Oracle Cloud A1(오사카), `ubuntu@161.33.15.188`, Docker Compose(Caddy + API + DB).
배포 디렉토리: `~/oneul-swim-backend` (docker-compose.yml, Caddyfile, .env 위치).

---

## 0. 사용자가 직접 해야 하는 액션 (체크리스트)

아래는 코드로 자동화되지 않는, 사람이 한 번은 해줘야 하는 일이다.

- [ ] **GitHub Secrets 등록** (Settings → Secrets and variables → Actions):
  - `SSH_HOST` = `161.33.15.188`
  - `SSH_USER` = `ubuntu`
  - `SSH_KEY` = 서버 접속 개인키 전체(`-----BEGIN ... END-----` 포함)
  - (GHCR 로그인은 `GITHUB_TOKEN` 자동 사용: 등록 불필요)
- [ ] **GHCR 패키지 공개/권한**: 최초 푸시 후 패키지가 private 이면, 서버 pull 을 위해
      GHCR 로그인을 서버에도 1회 해두거나 패키지를 public 으로 전환.
      (권장: 서버에서 `echo $GHCR_PAT | docker login ghcr.io -u yeonji-gonji --password-stdin`,
       또는 패키지 Settings → Change visibility → Public)
- [ ] **서버 최초 마이그레이션 채택** (아래 2번 절차): 기존 DB에 마이그레이션 이력 심기.
- [ ] **DuckDNS 계정·서브도메인 발급**, `API_DOMAIN` 교체 (아래 5번).
- [ ] **healthchecks.io 무료 계정**에서 체크 3개 생성 후 URL 을 크론/스크립트에 주입 (아래 4번).
- [ ] **백업 크론 등록** (아래 3번).
- [ ] **VAPID 키 발급** 후 `.env` 의 `VAPID_PUBLIC_KEY/PRIVATE_KEY` 설정
      (`npx web-push generate-vapid-keys`). 프론트에는 public 키만 넣는다.

---

## 1. CD 동작 방식

`main` 브랜치 푸시(또는 Actions 수동 실행) 시 `.github/workflows/deploy.yml` 가:

1. **build-push** 잡: Docker 이미지를 빌드해 GHCR 에 푸시.
   - `ghcr.io/yeonji-gonji/oneul-swim-backend:latest`
   - `ghcr.io/yeonji-gonji/oneul-swim-backend:<git sha>`
2. **deploy** 잡(build-push 성공 후): SSH 로 서버 접속해
   ```bash
   cd ~/oneul-swim-backend
   docker compose pull api                                   # 새 이미지 받기
   docker compose run --rm api pnpm prisma migrate deploy     # 마이그레이션(실패 시 배포 중단)
   docker compose up -d --no-build api caddy                  # 새 이미지로 교체 기동
   docker image prune -f
   ```
   `set -e` 이므로 마이그레이션이 실패하면 컨테이너 교체 없이 멈춘다(구 버전 유지).

서버는 이미지를 **빌드하지 않고 pull** 만 한다. `docker-compose.yml` 의 api 서비스에
`image:` 와 `build:` 가 둘 다 있지만, 서버는 `pull` + `up --no-build` 라 image 만 쓴다.

### 필요한 GitHub Secrets
| 이름 | 값 | 비고 |
|------|-----|------|
| `SSH_HOST` | 서버 IP/호스트 | |
| `SSH_USER` | SSH 사용자(ubuntu) | |
| `SSH_KEY` | 개인키 전체 | |
| `GITHUB_TOKEN` | (자동) | GHCR 로그인용, 등록 불필요 |

---

## 2. 마이그레이션 채택 (기존 DB에 이력 심기: 최초 1회)

서버 DB에는 이미 구 스키마 테이블(`Report`, `PushSubscription`)이 `db push` 로 만들어져 있다.
마이그레이션 히스토리가 없으므로, 신규 마이그레이션을 그냥 `deploy` 하면 이미 있는 테이블을
또 만들려다 실패한다. 그래서 첫 마이그레이션(`0_init`)은 "이미 적용됨"으로 **표시만** 한다.

서버 배포 디렉토리에서 최초 1회:

```bash
cd ~/oneul-swim-backend
docker compose pull api

# (1) 0_init = Report + PushSubscription. 이미 테이블이 있으므로 "적용됨"으로 표시만.
docker compose run --rm api pnpm prisma migrate resolve --applied 0_init

# (2) 이후 migrate deploy 가 1_data_pipeline(신규 테이블 전부)만 실제 적용한다.
docker compose run --rm api pnpm prisma migrate deploy

# (3) 수영장 데이터 시드(Pool/FeeTier). data/pools.json → DB.
docker compose run --rm api pnpm seed

# (4) 정상 기동
docker compose up -d api caddy
```

이후부터는 CD 가 매 배포마다 `migrate deploy` 를 자동 수행하므로 수동 개입 불필요.

> 마이그레이션 파일: `prisma/migrations/0_init/`(구 스키마), `prisma/migrations/1_data_pipeline/`(신규 전부).

---

## 3. DB 백업 (일일 pg_dump, 7일 롤링)

스크립트: `scripts/backup.sh`: `pg_dump | gzip` → `~/oneul-swim-backups/oneul_swim_YYYY-MM-DD.sql.gz`,
7일 지난 파일 자동 삭제, 성공 시 healthchecks.io 핑.

```bash
chmod +x scripts/backup.sh
# 수동 테스트
HEALTHCHECK_BACKUP_URL=https://hc-ping.com/<uuid> ./scripts/backup.sh
```

크론 등록(`crontab -e`), 매일 03:30:

```cron
30 3 * * * HEALTHCHECK_BACKUP_URL=https://hc-ping.com/<uuid> /home/ubuntu/oneul-swim-backend/scripts/backup.sh >> /home/ubuntu/backup.log 2>&1
```

복원: `gunzip -c <파일>.sql.gz | docker compose exec -T db psql -U oneul oneul_swim`

---

## 4. 모니터링 (healthchecks.io 무료 플랜)

무료 계정에서 체크 3개를 만들고, 각 URL(`https://hc-ping.com/<uuid>`)을 아래에 연결한다.

1. **/health 핑**: API 생존 감시. 크론으로 주기 핑:
   ```cron
   */5 * * * * curl -fsS -m 10 https://<API_DOMAIN>/health > /dev/null && curl -fsS -m 10 https://hc-ping.com/<uuid-health> > /dev/null
   ```
   (또는 healthchecks.io 유료 없이도, 위처럼 성공 시에만 핑을 쏘면 다운을 감지)
2. **백업 크론**: 3번의 `HEALTHCHECK_BACKUP_URL`. 하루 한 번 핑이 안 오면 알림.
   기대 주기: 1 day, grace 1 hour 정도로 설정.
3. **아침 푸시 크론**: 아침 요약은 앱 내부 `@Cron('0 8 * * *')` 이라 외부 핑이 없다.
   감시하려면 healthchecks 체크를 만들고, `PushService.sendMorningSummary()` 완료 후
   `HEALTHCHECK_MORNING_URL` 로 핑을 쏘도록 확장하거나, 서버 크론에서 `/push/preview` 를
   호출해 간접 확인한다(현재는 선택 사항).

healthchecks.io 는 "정해진 주기에 핑이 안 오면 알림"을 무료로 제공한다(이메일).

---

## 5. 도메인 (DuckDNS 무료 서브도메인)

1. https://www.duckdns.org 로그인(GitHub/Google) → 서브도메인 생성(예: `oneul-swim`).
   → 도메인은 `oneul-swim.duckdns.org`, 토큰은 계정 페이지 상단에 표시.
2. 서버 `.env` 의 `API_DOMAIN` 을 그 주소로 교체:
   ```
   API_DOMAIN=oneul-swim.duckdns.org
   ```
   Caddyfile 은 `{$API_DOMAIN}` 이라 코드 변경 없이 HTTPS 인증서를 자동 발급한다.
   `docker compose up -d caddy` 로 반영.
3. IP 가 바뀌는 환경이면 `scripts/duckdns.sh` 를 크론으로(5분마다) 돌려 IP 를 갱신:
   ```cron
   */5 * * * * DUCKDNS_DOMAIN=oneul-swim DUCKDNS_TOKEN=<token> /home/ubuntu/oneul-swim-backend/scripts/duckdns.sh >> /home/ubuntu/duckdns.log 2>&1
   ```
   (Oracle A1 은 고정 공인 IP라 필수는 아니지만, 재부팅/재할당 대비로 걸어두면 안전.)
4. 프론트(Vercel)의 API base URL 과 `CORS_ORIGINS` 도 새 도메인에 맞춰 갱신.

---

## 6. 강습 접수 소식 알림 (P4) 운영

- 사용자는 프론트에서 강습 소식 알림을 구독(`POST /subscriptions/lessons`).
- 관리자가 새 강습 접수 공지를 발송:
  ```bash
  curl -X POST https://<API_DOMAIN>/admin/announce \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"미사 강습 6월 접수 시작","body":"6/1 09:00부터 온라인 접수합니다."}'
  ```
  구독자 전체에게 best-effort 발송, 만료된 구독은 자동 정리, `{sent, failed}` 반환.
- 발송이 되려면 `.env` 의 VAPID 키가 설정돼 있어야 한다(미설정 시 `{sent:0, failed:0}`).
