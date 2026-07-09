#!/usr/bin/env bash
# DuckDNS 동적 DNS IP 갱신 — 크론용(무료, 월 0원 도메인).
#
# 실행권한 부여: chmod +x scripts/duckdns.sh
# 환경변수:
#   DUCKDNS_DOMAIN  서브도메인 이름만(예: oneul-swim). 전체 주소 아님.
#   DUCKDNS_TOKEN   DuckDNS 계정 토큰.
# 크론 예시(5분마다): */5 * * * * DUCKDNS_DOMAIN=oneul-swim DUCKDNS_TOKEN=... /path/duckdns.sh
set -euo pipefail

if [ -z "${DUCKDNS_DOMAIN:-}" ] || [ -z "${DUCKDNS_TOKEN:-}" ]; then
  echo "DUCKDNS_DOMAIN, DUCKDNS_TOKEN 환경변수가 필요합니다. 설정 후 다시 실행하세요." >&2
  exit 1
fi

# ip= 를 비워 두면 DuckDNS 가 요청 출발 IP 로 자동 설정한다
RESULT=$(curl -fsS -m 10 \
  "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")
echo "DuckDNS 응답: $RESULT"
[ "$RESULT" = "OK" ] || { echo "DuckDNS 갱신 실패" >&2; exit 1; }
