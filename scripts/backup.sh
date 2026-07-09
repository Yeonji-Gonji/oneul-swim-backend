#!/usr/bin/env bash
# 오늘수영 DB 백업 — pg_dump | gzip, 7일 롤링, healthchecks.io 핑.
#
# 실행권한 부여: chmod +x scripts/backup.sh
# 크론 예시(매일 03:30): 아래 OPERATIONS.md 참고.
#   30 3 * * * HEALTHCHECK_BACKUP_URL=https://hc-ping.com/<uuid> /home/ubuntu/oneul-swim-backend/scripts/backup.sh
set -euo pipefail

# 배포 디렉토리(docker-compose.yml 위치)로 이동 — 크론에서도 경로가 확실해진다
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/oneul-swim-backups}"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/oneul_swim_$(date +%F).sql.gz"

# -T: TTY 비활성(크론/비대화 환경). 컨테이너 안에서 덤프 후 호스트로 gzip 저장.
docker compose exec -T db pg_dump -U oneul oneul_swim | gzip > "$OUT"
echo "백업 완료: $OUT"

# 7일 롤링: 7일 지난 백업 삭제
find "$BACKUP_DIR" -name 'oneul_swim_*.sql.gz' -mtime +7 -delete

# 성공 시 모니터링 핑(미설정이면 스킵)
if [ -n "${HEALTHCHECK_BACKUP_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_BACKUP_URL" || true
fi
