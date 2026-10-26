#!/usr/bin/env bash
# 오늘수영 백엔드 배포 스크립트. CI(.github/workflows/deploy.yml)와 사람(docs/OPERATIONS.md)이 같은 것을 실행한다.
#   ./scripts/deploy.sh <이미지 태그>   예) ./scripts/deploy.sh sha-7604f1c
#   ./scripts/deploy.sh --rollback      직전 태그(.env 의 API_IMAGE_TAG_PREV)로 되돌린다
# 전제: docker-compose.yml, Caddyfile, .env 가 이 파일의 상위 폴더(서버 ~/app)에 있다.
# 흐름: pull → .env 태그 기록 → 마이그레이션 → up → 헬스체크 폴링(60초) → 실패 시 직전 태그로 자동 롤백 → 이미지 정리(현재·직전만 보존)
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
IMAGE=ghcr.io/yeonji-gonji/oneul-swim-backend

get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
set_kv() { # 키가 있으면 바꾸고 없으면 추가
  if grep -qE "^$1=" "$ENV_FILE" 2>/dev/null; then sed -i.bak "s|^$1=.*|$1=$2|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; fi
}
health() { # api 컨테이너 안에서 /health(DB SELECT 1 포함)를 2초 간격 30회 폴링
  for _ in $(seq 1 30); do
    docker compose exec -T api node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

CUR="$(get API_IMAGE_TAG)"
if [ "${1:-}" = "--rollback" ]; then
  NEW="$(get API_IMAGE_TAG_PREV)"; [ -n "$NEW" ] || { echo "롤백 불가: .env 에 API_IMAGE_TAG_PREV 가 없다"; exit 1; }
else
  NEW="${1:?사용법: deploy.sh <태그> | --rollback}"
fi
[ "$CUR" = "$NEW" ] && echo "주의: 현재 태그와 같은 태그($NEW)를 다시 배포한다"

echo "배포: ${CUR:-없음} -> $NEW"
docker pull "$IMAGE:$NEW" >/dev/null                       # 없는 태그면 .env 를 건드리기 전에 여기서 멈춘다
[ -n "$CUR" ] && [ "$CUR" != "$NEW" ] && set_kv API_IMAGE_TAG_PREV "$CUR"
set_kv API_IMAGE_TAG "$NEW"

# 마이그레이션 먼저. 실패하면 컨테이너 교체 없이 멈춘다(구 버전 유지). Prisma 는 down 마이그레이션이 없어 스키마는 되돌리지 않는다.
if ! docker compose run --rm api npx prisma migrate deploy; then
  echo "마이그레이션 실패: 태그를 ${CUR:-없음} 으로 되돌리고 중단"
  [ -n "$CUR" ] && set_kv API_IMAGE_TAG "$CUR"
  exit 1
fi
docker compose up -d --no-build api caddy

if health; then
  echo "헬스체크 통과: API_IMAGE_TAG=$NEW 고정"
else
  echo "헬스체크 실패: $NEW 최근 로그"; docker compose logs --tail=50 api || true
  if [ -n "$CUR" ] && [ "$CUR" != "$NEW" ]; then
    echo "직전 태그 $CUR 로 롤백"
    set_kv API_IMAGE_TAG "$CUR"; docker compose up -d --no-build api
    if health; then echo "롤백 완료(API_IMAGE_TAG=$CUR)"; else echo "롤백 후에도 헬스체크 실패: 수동 확인 필요"; fi
    docker image rm -f "$IMAGE:$NEW" >/dev/null 2>&1 || true   # 실패한 이미지는 보유 이유가 없다
  fi
  exit 1
fi

# 이미지 정리: 현재·직전 태그만 남긴다(레지스트리 접근 없이도 롤백이 가능해야 한다). 나머지와 dangling 은 삭제.
PREV="$(get API_IMAGE_TAG_PREV)"
docker images "$IMAGE" --format '{{.Tag}}' | while read -r t; do
  [ "$t" = "$NEW" ] || [ "$t" = "$PREV" ] || docker image rm -f "$IMAGE:$t" >/dev/null 2>&1 || true
done
docker image prune -f >/dev/null
