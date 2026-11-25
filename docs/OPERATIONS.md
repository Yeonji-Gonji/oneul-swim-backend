# 운영 런북 (오늘수영 백엔드)

서버: Oracle Cloud A1(오사카) 1대, Docker Compose(Caddy + API + DB). 접속 정보(`<서버IP>`·`<계정>`)는 GitHub Secrets
`SSH_HOST`·`SSH_USER` 가 기준이다(공개 리포라 여기에 적지 않는다).
배포 디렉토리: `~/app` (docker-compose.yml, Caddyfile, .env, scripts/*.sh 위치).

1인 운영이라 배포·롤백·백업·도메인·모니터링 절차는 이 문서 하나에 둔다(2026-10-26 결정). 런타임 환경변수 사전은 `.env.example`(키별 주석)이다.
운영 설정이 지금 어떤 상태인지(미완·확인 필요)는 이 문서가 아니라 GitHub Issues 에 둔다.

---

## 0. 새 서버를 처음 세울 때 사람이 할 일

코드로 자동화되지 않는, 서버를 새로 세울 때 사람이 한 번은 해야 하는 일이다.

- **GitHub Secrets 등록** (Settings → Secrets and variables → Actions):
  - `SSH_HOST` = 서버 IP
  - `SSH_USER` = SSH 계정
  - `SSH_KEY` = 서버 접속 개인키 전체(`-----BEGIN ... END-----` 포함)
  - (GHCR 로그인은 `GITHUB_TOKEN` 자동 사용: 등록 불필요)
- **GitHub 리포 변수 등록** (같은 화면의 Variables 탭):
  - `SSH_HOST_KEY_FP` = 서버 ed25519 호스트 키 지문. `ssh-keyscan -t ed25519 <서버IP> | ssh-keygen -lf -` 출력의 두 번째 칸(`SHA256:...`).
    `deploy.yml`·`backup-offsite.yml`·`server-ops.yml` 이 이 값과 같은 서버에만 붙는다. 없으면 세 워크플로가 모두 첫 단계에서 실패한다.
    서버를 다시 만들면 지문이 바뀌므로 갱신한다. 같은 서버를 쓰는 aether-takt 리포의 같은 이름 변수와 값이 같다.
  - `BACKUP_AGE_RECIPIENT` = 외부 백업 암호화용 age 공개키(아래 3번). 없으면 외부 백업 잡이 돌지 않는다.
- **GHCR 패키지 공개/권한**: 최초 푸시 후 패키지가 private 이면, 서버 pull 을 위해
  GHCR 로그인을 서버에도 1회 해두거나 패키지를 public 으로 전환.
  (권장: 서버에서 `echo $GHCR_PAT | docker login ghcr.io -u yeonji-gonji --password-stdin`,
  또는 패키지 Settings → Change visibility → Public)
- **서버 `.env` 작성**: 리포의 `.env.example` 을 견본으로 `~/app/.env` 를 만들고 `chmod 600 ~/app/.env` 로 소유자만 읽게 한다.
  비밀값(DB 비밀번호·`ADMIN_TOKEN`·VAPID 개인키)이 들어 있는 파일이다. `scripts/deploy.sh` 가 태그를 `sed -i` 로 고쳐 써도
  권한은 유지된다(확인: `stat -c %a ~/app/.env`).
- **마이그레이션**: 기존 DB 를 옮겨 오면 아래 2번의 채택 절차, 빈 DB 면 `migrate deploy` 만.
- **DuckDNS 계정·서브도메인 발급**, `API_DOMAIN` 교체 (아래 5번).
- **healthchecks.io 무료 계정**에서 체크 3개 생성 후 URL 을 크론/스크립트에 주입 (아래 4번).
- **백업 크론 등록** (아래 3번).
- **VAPID 키 발급** 후 `.env` 의 `VAPID_PUBLIC_KEY/PRIVATE_KEY` 설정
  (`npx web-push generate-vapid-keys`). 프론트에는 public 키만 넣는다.

---

## 0-b. 로컬에 SSH 키가 없을 때 (Actions 로 서버 읽기)

`.github/workflows/server-ops.yml`(workflow_dispatch, 읽기 전용)이 Secrets 의 `SSH_KEY` 로 서버에 붙는다. 배포 전 파일 비교와 상태 확인에 쓴다. 결과는 Actions 런 로그.

```bash
gh workflow run server-ops.yml -R Yeonji-Gonji/oneul-swim-backend --ref main -f task=diff-deploy-files   # 서버 compose·Caddyfile·scripts/*.sh 와 리포 diff
gh workflow run server-ops.yml -R Yeonji-Gonji/oneul-swim-backend --ref main -f task=show-state          # 현재 태그·컨테이너·이미지·메모리·디스크
```

새 기기의 SSH 접속은 서버 `~/.ssh/authorized_keys` 에 그 기기의 공개키를 넣어야 열린다. 키가 있는 기기에서 `ssh-copy-id -i ~/.ssh/<새키>.pub ubuntu@<서버IP>`,
없으면 Oracle Cloud 콘솔의 Cloud Shell 또는 인스턴스 "Console connection" 으로 들어가 추가한다. 비밀키는 git·메신저로 옮기지 않는다.

## 1. 배포 (CD 와 수동이 같은 스크립트)

`main` 푸시 가운데 운영 이미지나 서버 배포 파일에 들어가는 경로(`src/`·`prisma/`·`data/`·`scripts/`·`package.json`·잠금 파일·`tsconfig*.json`·
`Dockerfile`·`.dockerignore`·`docker-compose.yml`·`Caddyfile`, `*.md` 제외)가 바뀐 커밋과 Actions 수동 실행(Deploy → Run workflow, main 만)에서
`.github/workflows/deploy.yml` 의 잡 하나(`deploy`)가 차례로:

1. arm64 러너(`ubuntu-24.04-arm`)에서 이미지를 빌드해 GHCR 에 **불변 태그 `sha-<short>`** 로 푸시한다. `latest` 는 쓰지 않는다.
2. 서버 호스트 키 지문이 리포 변수 `SSH_HOST_KEY_FP` 와 같은지 확인한 뒤 `docker-compose.yml`·`Caddyfile`·`scripts/deploy.sh`·`scripts/backup.sh`·`scripts/duckdns.sh` 를 서버 `~/app` 에 동기화한다.
3. SSH 로 `~/app/scripts/deploy.sh sha-<short>` 를 실행한다.
4. 운영 URL 스모크: `https://oneul-swim.duckdns.org/health` 의 `status` 가 `ok` 이고 `/pools` 의 `_meta.source` 가 `db` 인지 본다.
   `file` 이면 API 는 떴지만 DB 조회가 실패해 정적 파일로 답하는 상태다. 이 단계가 실패해도 서버는 이미 새 버전이므로 원인을 보고 롤백할지 정한다.

`scripts/deploy.sh` 가 하는 일(순서대로):

```text
caddy_shared 네트워크·conf.d 폴더가 없으면 만든다   # 같은 서버의 다른 스택과 같이 쓰는 caddy(§7)
Caddyfile + conf.d 조각을 compose 에 고정한 caddy 이미지로 검사   # 깨졌으면 아무것도 바꾸지 않고 중단, Caddyfile 은 직전 반영본으로 되돌림
pull(서버에 같은 태그가 있으면 건너뜀)              # 없는 태그면 여기서 중단
db 기동(healthy 대기)
docker compose run --rm --no-deps api npx prisma migrate deploy   # 실패하면 컨테이너를 바꾸지 않고 중단. 롤백 때는 돌리지 않음
docker compose up -d --no-build api caddy
/health 폴링(2초 × 30회, DB SELECT 1 포함)
  통과 → .env 에 API_IMAGE_TAG(현재)·API_IMAGE_TAG_PREV(직전) 기록, 이미지는 현재·직전만 남기고 정리
  실패 → 로그 50줄 출력, 직전 태그로 다시 up, 실패 이미지 삭제, exit 1(첫 배포면 api 를 멈춤)
떠 있는 caddy 가 보는 Caddyfile 이 서버 파일과 다르면 caddy 재시작   # 못 뜨면 직전 반영본으로 되돌려 다시 재시작
```

서버 `.env` 의 `API_IMAGE_TAG` 가 "지금 떠 있는 버전"의 단일 사실이다. 헬스체크를 통과한 뒤에만 기록되므로 배포가 중간에 끊겨도 값이 어긋나지 않는다.
확인: `grep API_IMAGE_TAG ~/app/.env`.

- 배포가 서버에 동기화하는 파일은 `docker-compose.yml`·`Caddyfile`·`scripts/deploy.sh`·`scripts/backup.sh`·`scripts/duckdns.sh` 다. 서버 크론은
  `~/app/scripts/` 의 사본을 실행하므로, 두 크론 스크립트도 리포에서 고쳐 배포하면 서버에 간다. 서버 파일을 손으로 고치지 않는다(다음 배포가 덮어쓴다).
- 이미지는 `linux/arm64` 로 빌드한다(서버가 Oracle A1). arm64 네이티브 러너라 QEMU 를 쓰지 않으며, amd64 이미지는 서버에서 뜨지 않는다.
- Caddyfile 만 고친 커밋도 배포가 돈다. caddy 는 Caddyfile 을 파일 하나로 바인드 마운트해서, 동기화로 파일이 바뀌어도 떠 있는 caddy 는 재시작 전까지
  옛 내용을 본다. `deploy.sh` 가 끝에서 차이를 보고 재시작한다(수 초 동안 이 서버의 HTTPS 가 끊긴다. 같은 caddy 를 쓰는 다른 스택 포함).
- 로그는 서버 journald 로 간다(`docker-compose.yml` 의 `x-logging`). 컨테이너가 배포로 교체돼도 이전 로그가 남고, 줄마다
  `CONTAINER_NAME`·`IMAGE_NAME`(배포 태그)이 붙는다. 보존 상한은 journald 기본값(디스크 10%, 최대 4G)이다.
  - 지금 컨테이너: `docker compose logs --tail=100 api`
  - 교체된 컨테이너까지: `journalctl CONTAINER_NAME=app-api-1 --since "2 days ago"`, 태그별: `journalctl IMAGE_NAME=ghcr.io/yeonji-gonji/oneul-swim-backend:sha-xxxxxxx`
  - caddy 접근 로그(JSON, 사이트별 `request.host`): `journalctl CONTAINER_NAME=app-caddy-1 -o cat --since -1h | grep '"logger":"http.log.access'`
  - journald 가 없는 Docker(예: Docker Desktop)에서 로컬로 띄우면 컨테이너가 뜨지 않는다. 그때는 `x-logging` 의 `driver` 를 로컬에서만 `json-file` 로 바꾼다.
- 기본 이미지(compose 의 caddy·postgres, Dockerfile 의 node)는 `버전-alpine@sha256:…` 로 고정한다. 같은 태그도 베이스 OS 패치로 다시 빌드되면
  내용이 바뀌어, 태그만으로는 서버에 무엇이 떠 있는지 알 수 없기 때문이다. 올리는 건 Dependabot 이 월 1회 여는 PR 이다(`.github/dependabot.yml`, 메이저 제외).
  - postgres PR 은 머지 전에 릴리스 노트(postgresql.org/docs/16/release-16-N.html)의 "Migration to Version" 과 `REINDEX` 항목을 보고,
    해당 인덱스가 있는지 확인한다. 머지하면 배포가 db 컨테이너를 새 버전으로 다시 만든다(데이터는 `pgdata` 볼륨, 몇 초 끊김).
  - postgres 메이저(17 이상)는 데이터 디렉토리 형식이 달라 덤프/복원이 필요하다. Dependabot 이 올리지 않으며 따로 계획한다.

### 수동 배포

```bash
cd ~/app
./scripts/deploy.sh sha-<short>        # GHCR 에 있는 태그. 목록: https://github.com/Yeonji-Gonji/oneul-swim-backend/pkgs/container/oneul-swim-backend
```

### 롤백

```bash
cd ~/app
./scripts/deploy.sh --rollback         # API_IMAGE_TAG_PREV 로 되돌린다(이미지는 서버에 보존돼 있어 레지스트리 접근 불필요)
```

- 마이그레이션은 되돌리지 않는다(Prisma 는 down 이 없다). 스키마를 바꾼 배포를 롤백할 때는 구 코드가 새 스키마와 호환되는지 먼저 본다.
  롤백은 `migrate deploy` 도 돌리지 않는다.
- 롤백 뒤에는 원인을 고친 새 커밋을 main 에 올려 정상 배포로 복귀한다. `.env` 태그를 손으로 고치지 않는다.

### 배포 검증

```bash
curl -s https://<API_DOMAIN>/health          # {"status":"ok"} (DB 연결 포함)
curl -s https://<API_DOMAIN>/pools | head -c 200
docker compose ps                            # api·caddy·db 모두 Up
```

### 처음 이 방식으로 전환할 때 (1회)

- 2026-10-26 실측: 서버 `~/app` 은 리포의 git 체크아웃(커밋 `b6808cd`, 2026-07-11)이고 `docker-compose.yml` 에만 로컬 수정이 있었다
  (`GEMINI_API_KEY` 제거 + 카카오 키 2개 추가). 그 차이는 이 리포에 반영했으므로 첫 동기화가 덮어써도 동작이 바뀌지 않는다.
  이후 서버 파일을 손으로 고치지 않는다(다음 배포가 덮어쓴다). 고칠 것은 리포에 고쳐 배포한다.

- 2026-11-25 전환(배포 잡 하나·호스트 키 지문 고정·크론 스크립트 동기화·메모리 상한·운영 의존성만 담은 이미지): 머지 전에 리포 변수 `SSH_HOST_KEY_FP` 를 넣는다(§0).
  첫 배포에서 `api`·`db` 컨테이너가 메모리 상한 때문에 한 번 재생성되고(DB 는 수 초 끊기고 데이터는 볼륨에 남는다), 서버 `~/app/scripts/backup.sh`·`duckdns.sh` 가
  리포 내용으로 바뀐다. 서버 사본을 손으로 고친 적이 있으면 `server-ops.yml` 의 `diff-deploy-files` 를 그 브랜치에서 먼저 돌려 차이를 본다.

- 서버 `~/app/docker-compose.yml` 이 리포 파일과 같은지 `diff` 로 본다. 다르면 서버 쪽 수정 내용을 리포에 먼저 반영한다
  (첫 배포가 서버 파일을 리포 내용으로 덮어쓴다).
- 서버 `.env` 에 `API_IMAGE_TAG` 가 없어도 된다. 첫 실행이 기록한다(이때는 롤백 대상이 없으므로 헬스체크 실패 시 중단만 한다).
- 서버에는 `latest` 태그 이미지가 남아 있을 수 있다. 첫 배포의 정리 단계가 지운다.

### 필요한 GitHub Secrets·변수
| 이름 | 종류 | 값 | 비고 |
|------|------|-----|------|
| `SSH_HOST` | Secret | 서버 IP/호스트 | |
| `SSH_USER` | Secret | SSH 사용자 | |
| `SSH_KEY` | Secret | 개인키 전체 | |
| `GITHUB_TOKEN` | (자동) | | GHCR 로그인용, 등록 불필요 |
| `SSH_HOST_KEY_FP` | 변수 | 서버 ed25519 호스트 키 지문 | 없으면 배포·외부 백업·서버 조회가 실패한다(§0) |
| `BACKUP_AGE_RECIPIENT` | 변수 | age 공개키 | 없으면 외부 백업 잡이 돌지 않는다(§3) |

---

## 2. 마이그레이션 채택 (기존 DB에 이력 심기: 최초 1회)

서버 DB에는 이미 구 스키마 테이블(`Report`, `PushSubscription`)이 `db push` 로 만들어져 있다.
마이그레이션 히스토리가 없으므로, 신규 마이그레이션을 그냥 `deploy` 하면 이미 있는 테이블을
또 만들려다 실패한다. 그래서 첫 마이그레이션(`0_init`)은 "이미 적용됨"으로 **표시만** 한다.

서버 배포 디렉토리에서 최초 1회:

```bash
cd ~/app
docker compose pull api

# (1) 0_init = Report + PushSubscription. 이미 테이블이 있으므로 "적용됨"으로 표시만.
docker compose run --rm api npx prisma migrate resolve --applied 0_init

# (2) 이후 migrate deploy 가 1_data_pipeline(신규 테이블 전부)만 실제 적용한다.
docker compose run --rm api npx prisma migrate deploy

# (3) 수영장 데이터 시드(Pool/FeeTier). data/pools.json → DB.
docker compose run --rm api npx tsx prisma/seed.ts

# (4) 정상 기동
docker compose up -d api caddy
```

이후부터는 CD 가 매 배포마다 `migrate deploy` 를 자동 수행하므로 수동 개입 불필요.

새 서버의 빈 DB 에 처음 띄울 때는 `resolve` 없이 그대로 `migrate deploy` 하면 된다(`0_init` 을 "적용됨"으로 표시한 것은 기존 운영 DB 한정).

> 마이그레이션 파일: `prisma/migrations/0_init/`(구 스키마), `prisma/migrations/1_data_pipeline/`(신규 전부).

---

## 3. DB 백업 (서버 일일 덤프 + 외부 암호화 사본)

### 서버 일일 덤프 (7일 롤링)

스크립트: `scripts/backup.sh`: `pg_dump | gzip` → `~/oneul-swim-backups/oneul_swim_YYYY-MM-DD.sql.gz`,
오늘 것 포함 최근 7개 보존, 성공 시 healthchecks.io 핑. 덤프는 `.partial` 로 쓴 뒤 gzip 검사를 통과해야 최종 이름으로 옮기므로,
중간에 끊긴 파일이 최신 덤프로 잡히지 않는다. 크론은 서버 사본(`~/app/scripts/backup.sh`)을 실행하고 그 사본은 매 배포가 리포 내용으로 갱신한다.
서버 크론(서버 시간대 UTC), 매일 03:30:

```cron
30 3 * * * HEALTHCHECK_BACKUP_URL=https://hc-ping.com/<uuid> $HOME/app/scripts/backup.sh >> $HOME/backup.log 2>&1
```

### 외부 암호화 사본 (30일, 2026-10-26~)

`.github/workflows/backup-offsite.yml` 이 매일 04:00 UTC 에 서버의 최신 덤프를 받아 age 공개키로 암호화해
Actions artifact(`oneul_swim_YYYY-MM-DD`)로 30일 보관한다. 오라클 계정 잠김이나 서버 손실에도 남는 사본이다.

- 암호화 공개키 = 리포 변수 `BACKUP_AGE_RECIPIENT`. **복호화 비밀키는 리포·서버 어디에도 없다.** 생성한 기기의
  `~/.config/age/oneul-swim-backup.txt` 와 비밀번호 관리자에만 있다. 비밀키를 잃으면 외부 사본은 못 연다.
- 덤프가 26시간보다 오래됐거나 gzip 이 깨졌으면 워크플로가 실패한다. GitHub 실패 메일 = 서버 백업 크론 이상 신호.
- 서버 호스트 키 지문은 리포 변수 `SSH_HOST_KEY_FP` 다(§0). 서버를 다시 만들면 지문이 바뀌어 실패하므로 변수를 갱신한다.
- 리포 변수 `BACKUP_AGE_RECIPIENT` 가 없으면 잡이 돌지 않는다(실패가 아니라 건너뜀).
- 공개 리포에서 60일 동안 커밋이 없으면 GitHub 가 schedule 워크플로를 끈다. Actions 탭에서 다시 켠다.

### 복원

```bash
# 외부 사본에서: 최근 artifact 내려받기 → 복호화
gh run download -R Yeonji-Gonji/oneul-swim-backend -n oneul_swim_YYYY-MM-DD -D /tmp/restore
age -d -i ~/.config/age/oneul-swim-backup.txt -o /tmp/restore/dump.sql.gz /tmp/restore/oneul_swim_YYYY-MM-DD.sql.gz.age
gunzip -t /tmp/restore/dump.sql.gz

# DB 에 붓기(서버 ~/app 에서). 덮어쓰기 전 지금 상태를 별도 폴더에 한 벌 남긴다(일일 덤프와 이름이 겹치지 않게)
BACKUP_DIR=$HOME/oneul-swim-backups/pre-restore ./scripts/backup.sh
gunzip -c dump.sql.gz | docker compose exec -T db psql -U oneul oneul_swim
```

빈 DB 에 복원한 뒤 `docker compose run --rm api npx prisma migrate deploy` 로 이후 마이그레이션을 맞춘다
(2026-10-26 로컬에서 운영 덤프 복원 → 새 이미지 migrate deploy → 기동까지 검증).

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
   */5 * * * * DUCKDNS_DOMAIN=oneul-swim DUCKDNS_TOKEN=<token> $HOME/app/scripts/duckdns.sh >> $HOME/duckdns.log 2>&1
   ```
   (Oracle A1 은 고정 공인 IP라 필수는 아니지만, 재부팅/재할당 대비로 걸어두면 안전.)
4. 프론트(Vercel)의 API base URL 과 `CORS_ORIGINS` 도 새 도메인에 맞춰 갱신.
5. 크론이 `>>` 로 쌓는 홈 폴더 로그는 logrotate 가 주 1회 돌려 4주치만 남긴다. 서버에만 있는 파일이라 새 서버에서는 손으로 만든다:
   ```bash
   sudo tee /etc/logrotate.d/home-cron-logs >/dev/null <<'EOF'
   /home/ubuntu/duckdns.log /home/ubuntu/backup.log /home/ubuntu/aether-takt-backup.log {
       su ubuntu ubuntu
       weekly
       rotate 4
       compress
       delaycompress
       missingok
       notifempty
       copytruncate
   }
   EOF
   sudo logrotate -d /etc/logrotate.d/home-cron-logs   # 문법 검사(실제로 돌리지 않음)
   ```

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

---

## 7. 같은 서버의 다른 스택 사이트 (caddy `conf.d`)

같은 서버의 다른 compose 스택(지금은 aether-takt API, 서버 `~/aether-takt`)도 이 스택의 caddy 를 입구로 쓴다. 이 스택에서 그 때문에 바뀐 것은 caddy 하나다.

- caddy 는 `Caddyfile` 끝의 `import /etc/caddy/conf.d/*.caddy` 로 서버 `~/app/conf.d/*.caddy` 조각을 읽는다. 조각이 하나도 없어도 뜬다.
- caddy 는 compose 기본 네트워크와 외부 네트워크 `caddy_shared` 에 함께 붙는다. 다른 스택은 앱 컨테이너만 `caddy_shared` 에 붙이고, 조각의 업스트림은 그 컨테이너의 서비스 이름이다(예: `aether-api:3100`). 이 스택의 `api`·`db` 는 `caddy_shared` 에 붙이지 않는다.
- `import` 와 마운트만 있고 caddy 가 `caddy_shared` 에 붙지 않으면 조각은 읽혀도 업스트림 이름을 풀지 못해 502 가 난다(2026-11-18 로컬 재현).
- `caddy_shared` 와 `conf.d` 폴더는 `scripts/deploy.sh` 가 없으면 만든다(다른 스택 배포가 먼저 만들었을 수도 있다). `conf.d` 를 docker 가 대신 만들면 root 소유가 돼 다른 스택이 조각을 넣지 못한다.
- 조각 파일은 그 스택의 배포가 관리한다. aether-takt 배포는 같은 caddy 이미지로 조각을 검사한 뒤 넣고 `caddy reload` 하며, reload 가 실패하면 이전 조각으로 되돌린다. 손으로 고치지 않는다.
- `caddy_shared` 에 붙는 서비스 이름이 이 스택의 `api`·`db`·`caddy` 와 겹치면 caddy 의 이름 풀이가 갈린다. 다른 스택은 접두사 붙은 이름을 쓴다(aether-takt 는 `aether-api`·`aether-db`).

깨진 조각 때문에 caddy 가 뜨지 않을 때(이 스택 배포 직후 HTTPS 가 모두 끊기면 먼저 의심한다):

```bash
cd ~/app
docker compose logs --tail=30 caddy            # 어느 조각에서 막혔는지 본다
mkdir -p ~/conf.d-aside && mv conf.d/<조각>.caddy ~/conf.d-aside/
docker compose up -d caddy
```

조각은 그 스택에서 고쳐 다시 배포하면 다시 들어간다. aether-takt 쪽 절차는 `Yeonji-Gonji/aether-takt` 리포의 `apps/api/deploy/README.md` 다.

---

## 8. 운영 함정

- **메모리 상한**: `api`·`db` 는 컨테이너 상한이 각 512m 이고, api 의 Node 힙 상한은 384MB 다(`NODE_OPTIONS`). 2026-11-18 실측으로 이 스택 전체가 약 100MiB 를 쓴다.
  재시작이 반복되면 `docker inspect app-api-1 --format '{{.State.OOMKilled}}'` 로 메모리 초과인지 보고, 지금 사용량은 `docker stats --no-stream`
  (또는 `server-ops.yml` 의 `show-state`)으로 본다. `docker compose run` 으로 돌리는 데이터 스크립트에도 같은 상한이 걸린다.
- **`.env` 와 compose 검사**: compose 의 `${…:?}` 검사 때문에 `.env` 에 `API_IMAGE_TAG`·`API_DOMAIN`·`POSTGRES_PASSWORD` 가 빠지면 `docker compose ps`·`logs`·`exec` 를
  포함한 모든 명령이 멈춘다. 백업 크론(`docker compose exec db`)도 같이 멈춘다. 새 서버의 첫 배포 전에는 `API_IMAGE_TAG` 가 없어 손으로 친 compose 명령이
  실패하는 것이 정상이다(`deploy.sh` 는 환경변수로 넘긴다).
- **Caddyfile 반영**: 위 §1. 손으로 `~/app/Caddyfile` 을 고쳐도 떠 있는 caddy 에는 반영되지 않고, 다음 배포가 리포 내용으로 덮어쓴다.
  `~/app/.Caddyfile.applied` 는 `deploy.sh` 가 마지막으로 반영한 사본(깨진 Caddyfile 이 왔을 때 되돌릴 기준)이라 지우지 않는다.
- **컨테이너 안 쓰기**: 운영 이미지의 코드·의존성은 root 소유이고 프로세스는 `node` 사용자다. 컨테이너 안에서 쓸 수 있는 곳은 `/app/data`·`/tmp`·홈 폴더(`/home/node`)다.
  리눅스 권한도 모두 뺐으므로(`cap_drop: ALL`) 1024 미만 포트를 듣거나 파일 소유자를 바꾸는 코드는 동작하지 않는다.
- **이미지 정리 범위**: `deploy.sh` 는 이 리포 이미지 가운데 현재·직전 태그만 남기고, `docker image prune -f` 로 서버 전체의 태그 없는(dangling) 이미지를 지운다.
  다른 스택의 태그 붙은 이미지는 건드리지 않는다.
- **배포 스크립트의 stdin**: `deploy.sh` 는 시작하면서 stdin 을 닫는다. `ssh <서버> '~/app/scripts/deploy.sh …'` 처럼 실행해도 호출한 쪽 입력을 먹지 않는다.
