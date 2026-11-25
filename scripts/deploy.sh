#!/usr/bin/env bash
# 오늘수영 백엔드 배포 스크립트. CI(.github/workflows/deploy.yml)와 사람(docs/OPERATIONS.md)이 같은 것을 실행한다.
#   ./scripts/deploy.sh <이미지 태그>   예) ./scripts/deploy.sh sha-7604f1c
#   ./scripts/deploy.sh --rollback      직전 태그(.env 의 API_IMAGE_TAG_PREV)로 되돌린다. 마이그레이션은 돌리지 않는다
# 전제: 이 파일의 상위 폴더(서버 ~/app)에 docker-compose.yml · Caddyfile · .env 가 있다.
# 흐름: 공유 네트워크·conf.d 확인 → Caddyfile 검사 → pull → DB 기동 → 마이그레이션 → up → 헬스 폴링(2초 × 30회)
#       → 실패 시 직전 태그로 자동 롤백 → 성공 시 .env 태그 고정 → 이미지 정리(현재·직전만) → 바뀐 Caddyfile 반영
# .env 의 API_IMAGE_TAG 는 헬스체크를 통과한 뒤에만 고쳐 쓴다. 그 전까지는 셸 환경변수로 compose 에 넘긴다.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env
IMAGE=ghcr.io/yeonji-gonji/oneul-swim-backend
API=api
NETWORK=caddy_shared
HEALTH_URL=http://127.0.0.1:3000/health
# 마지막으로 caddy 에 반영된 Caddyfile 사본. 깨진 Caddyfile 이 동기화되면 이 사본으로 되돌린다
CADDYFILE_APPLIED=.Caddyfile.applied

die() {
  echo "$*" >&2
  exit 1
}
get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
set_kv() { # 키가 있으면 바꾸고 없으면 추가
  if grep -qE "^$1=" "$ENV_FILE"; then
    sed -i.bak "s|^$1=.*|$1=$2|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
  fi
}

api_health() { # api 컨테이너 안에서 /health(DB SELECT 1 포함)를 한 번 부른다
  docker compose exec -T "$API" node -e \
    "fetch('$HEALTH_URL',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
    >/dev/null 2>&1
}
wait_healthy() { # 2초 간격 30회(60초)
  for _ in $(seq 1 30); do
    if api_health; then return 0; fi
    sleep 2
  done
  return 1
}

pull_image() { # 태그는 불변이라 서버에 이미 있으면 그대로 쓴다(롤백·재배포가 레지스트리 없이 된다)
  local ref="$IMAGE:$1"
  if docker image inspect "$ref" >/dev/null 2>&1; then return 0; fi
  docker pull "$ref" >/dev/null || die "pull 실패: $ref (.env 와 떠 있는 컨테이너는 그대로)"
}

caddy_cid() { docker ps -q --filter "network=$NETWORK" --filter label=com.docker.compose.service=caddy | head -1; }

# 이 배포로 뜰 caddy 이미지(docker-compose.yml 에 고정한 버전+다이제스트). 기본 이미지를 올리는 배포에서는 떠 있는 컨테이너의 이미지가 옛 버전이라
# compose 파일을 먼저 본다. 못 읽으면 떠 있는 컨테이너의 이미지로 대신한다.
caddy_image() {
  local img cid
  img="$(sed -n 's/^ *image: *\(caddy:[^ ]*\) *$/\1/p' docker-compose.yml | head -1)"
  if [ -z "$img" ]; then
    cid="$(caddy_cid)"
    if [ -n "$cid" ]; then img="$(docker inspect -f '{{.Config.Image}}' "$cid")"; fi
  fi
  echo "${img:-caddy:2-alpine}"
}

# Caddyfile 과 conf.d 조각을 caddy 가 읽는 그대로 묶어, 이 배포로 뜰 caddy 이미지로 검사한다.
# 깨진 Caddyfile 로 caddy 가 재생성되면 이 서버의 HTTPS 가 모두(같은 caddy 를 쓰는 다른 스택 포함) 끊기므로 컨테이너를 건드리기 전에 본다.
validate_caddyfile() {
  tar -cf - Caddyfile conf.d |
    docker run --rm -i --network none -e API_DOMAIN="$(get API_DOMAIN)" "$(caddy_image)" \
      sh -c 'tar -xf - -C /etc/caddy && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile'
}
check_caddyfile() {
  local out
  if out="$(validate_caddyfile 2>&1)"; then return 0; fi
  printf '%s\n' "$out" | tail -5 >&2
  if [ -f "$CADDYFILE_APPLIED" ] && ! cmp -s Caddyfile "$CADDYFILE_APPLIED"; then
    cp "$CADDYFILE_APPLIED" Caddyfile
    die "Caddyfile 검사 실패: 직전에 반영된 Caddyfile 로 되돌리고 배포를 시작하지 않음. 리포에서 고쳐 다시 배포한다"
  fi
  die "Caddyfile 검사 실패: 배포를 시작하지 않음. conf.d 조각이 깨졌으면 그 스택에서 고친다(docs/OPERATIONS.md §7)"
}

caddy_running() { [ -n "$(docker compose ps -q --status running caddy 2>/dev/null)" ]; }
wait_caddy() { # 재시작 직후 설정 오류로 죽는지 5초 동안 본다
  for _ in 1 2 3 4 5; do
    sleep 1
    caddy_running || return 1
  done
}
# caddy 는 Caddyfile 을 파일 하나로 바인드 마운트한다. 배포 동기화는 파일을 새로 만들어 바꾸므로(inode 가 바뀜)
# 떠 있는 caddy 는 재시작 전까지 옛 내용을 본다. 컨테이너가 보는 내용과 다를 때만 재시작한다(수 초 동안 HTTPS 끊김).
apply_caddyfile() {
  if docker compose exec -T caddy cat /etc/caddy/Caddyfile 2>/dev/null | cmp -s - Caddyfile; then
    cp Caddyfile "$CADDYFILE_APPLIED"
    echo "Caddyfile 변경 없음"
    return 0
  fi
  echo "Caddyfile 변경 감지: caddy 재시작"
  docker compose restart caddy
  if wait_caddy; then
    cp Caddyfile "$CADDYFILE_APPLIED"
    echo "caddy 재시작 완료"
    return 0
  fi
  docker compose logs --tail=30 caddy || true
  if [ -f "$CADDYFILE_APPLIED" ]; then
    cp "$CADDYFILE_APPLIED" Caddyfile
    docker compose restart caddy || true
    die "caddy 가 새 Caddyfile 로 뜨지 않음: 직전 Caddyfile 로 되돌림(API 는 배포됨)"
  fi
  die "caddy 가 새 Caddyfile 로 뜨지 않음: 되돌릴 사본이 없어 수동 확인 필요(API 는 배포됨)"
}

exec </dev/null # 이후 docker 명령이 stdin 을 물지 않게 한다(ssh 나 파이프로 실행될 때 호출한 쪽 입력을 먹지 않게)

[ -f "$ENV_FILE" ] || die ".env 없음: docs/OPERATIONS.md §0 의 서버 .env 작성을 먼저 한다"
CUR="$(get API_IMAGE_TAG)"
ROLLBACK=false
if [ "${1:-}" = --rollback ]; then
  ROLLBACK=true
  NEW="$(get API_IMAGE_TAG_PREV)"
  [ -n "$NEW" ] || die "롤백 불가: .env 에 API_IMAGE_TAG_PREV 가 없다"
else
  NEW="${1:?사용법: deploy.sh <태그> | --rollback}"
fi
[ "$NEW" != latest ] || die "latest 태그는 쓰지 않는다: sha-<short> 를 넘긴다"
if [ "$CUR" = "$NEW" ]; then echo "주의: 현재 태그와 같은 태그($NEW)를 다시 배포한다"; fi
echo "배포: ${CUR:-없음} -> $NEW"

# caddy 가 붙는 외부 네트워크(caddy_shared)와 사이트 조각 폴더(conf.d)를 compose 명령 전에 보장한다.
# 같은 서버의 다른 스택(aether-takt) 배포가 먼저 만들었을 수도 있다. conf.d 를 docker 가 대신 만들면 root 소유가 돼 다른 스택이 조각을 못 넣는다.
docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
mkdir -p conf.d
check_caddyfile
pull_image "$NEW"

# 이후 compose 는 셸 환경변수 API_IMAGE_TAG 를 .env 보다 먼저 읽는다. .env 에는 헬스체크를 통과한 뒤에만 쓴다
export API_IMAGE_TAG="$NEW"
docker compose up -d --wait db || die "db 가 healthy 가 되지 않음"
if [ "$ROLLBACK" = false ]; then
  # 마이그레이션 먼저. 실패하면 컨테이너를 바꾸지 않고 멈춘다(.env 와 떠 있는 컨테이너는 그대로).
  # Prisma 는 down 마이그레이션이 없어 스키마는 되돌리지 않는다.
  docker compose run --rm --no-deps -T "$API" npx prisma migrate deploy ||
    die "마이그레이션 실패: 컨테이너를 바꾸지 않고 중단(API_IMAGE_TAG=${CUR:-없음} 유지)"
fi
docker compose up -d --no-build "$API" caddy

if wait_healthy; then
  if [ -n "$CUR" ] && [ "$CUR" != "$NEW" ]; then set_kv API_IMAGE_TAG_PREV "$CUR"; fi
  set_kv API_IMAGE_TAG "$NEW"
  echo "헬스체크 통과: API_IMAGE_TAG=$NEW 고정"
else
  echo "헬스체크 실패: $NEW 최근 로그"
  docker compose logs --tail=50 "$API" || true
  if [ -n "$CUR" ] && [ "$CUR" != "$NEW" ]; then
    echo "직전 태그 $CUR 로 롤백"
    export API_IMAGE_TAG="$CUR"
    docker compose up -d --no-build "$API"
    if wait_healthy; then echo "롤백 완료(API_IMAGE_TAG=$CUR)"; else echo "롤백 뒤에도 헬스체크 실패: 수동 확인 필요"; fi
    docker image rm -f "$IMAGE:$NEW" >/dev/null 2>&1 || true # 헬스체크에 실패한 이미지는 둘 이유가 없다
  elif [ -z "$CUR" ]; then
    echo "되돌릴 직전 태그가 없어(첫 배포) $API 를 멈춤"
    docker compose stop "$API" || true
  fi
  exit 1
fi

# 이미지 정리: 현재·직전 태그만 남긴다(레지스트리 없이 롤백할 수 있게). 나머지와 dangling 은 지운다
PREV="$(get API_IMAGE_TAG_PREV)"
docker images "$IMAGE" --format '{{.Tag}}' | while read -r t; do
  [ "$t" = "$NEW" ] || [ "$t" = "$PREV" ] || docker image rm -f "$IMAGE:$t" >/dev/null 2>&1 || true
done
docker image prune -f >/dev/null

apply_caddyfile
