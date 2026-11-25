#!/usr/bin/env bash
# 오늘수영 DB 백업: pg_dump | gzip → ~/oneul-swim-backups/oneul_swim_YYYY-MM-DD.sql.gz, 7일 롤링, 성공 시 healthchecks.io 핑(선택)
# 서버 크론(서버 시간대 UTC) 매일 03:30. 등록 줄은 docs/OPERATIONS.md §3
# 서버 밖 사본은 .github/workflows/backup-offsite.yml 이 04:00 UTC 에 최신 덤프를 age 로 암호화해 Actions artifact 로 30일 보관한다
# 이 파일은 배포 때마다 리포 내용으로 서버 ~/app/scripts/ 에 동기화되고, 크론은 그 사본을 실행한다
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/oneul-swim-backups}"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/oneul_swim_$(date -u +%F).sql.gz"
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT

# 덤프가 끝까지 성공하고 gzip 이 온전할 때만 최종 이름으로 옮긴다(중간에 끊긴 파일을 최신 덤프로 착각하지 않게)
# -T: TTY 비활성(크론·비대화 환경)
docker compose exec -T db pg_dump -U oneul -d oneul_swim | gzip >"$TMP"
gzip -t "$TMP"
mv "$TMP" "$OUT"
echo "백업 완료: $OUT ($(du -h "$OUT" | cut -f1))"

# 7일 롤링: 오늘 것을 포함해 최근 7개를 남긴다
find "$BACKUP_DIR" -name 'oneul_swim_*.sql.gz' -mtime +6 -delete

if [ -n "${HEALTHCHECK_BACKUP_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_BACKUP_URL" >/dev/null || true
fi
