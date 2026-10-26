# ADR-0001: 배포 이미지는 불변 sha 태그만 쓰고, 배포 스크립트가 헬스체크 후 자동 롤백한다

- 날짜: 2026-10-26
- 상태: 채택
- 관련: `scripts/deploy.sh`, `.github/workflows/deploy.yml`, `docs/OPERATIONS.md`

## 배경

기존 CD 는 이미지를 `latest` + `<git sha>` 두 태그로 푸시하고 서버 compose 는 `latest` 를 pull 했다. 배포 뒤 `docker image prune -f` 가 직전
이미지를 지워, "지금 어떤 버전이 떠 있는가"를 서버에서 알 수 없고 롤백은 레지스트리에서 옛 sha 를 찾아 compose 를 손으로 고쳐야 했다.
`up -d` 뒤 헬스체크가 없어 기동 실패도 다음 요청이 깨질 때까지 몰랐다. api 컨테이너는 아무것도 듣지 않는 호스트 포트 5555 를 0.0.0.0 에
열고 있었고, 로그 로테이션이 없어 Always Free 디스크를 잠식할 수 있었다.

## 검토한 대안

1. `latest` 유지 + 수동 롤백 절차 문서화 — 변경이 작지만 "검증한 것 = 배포한 것"이 보장되지 않고 서버에서 현재 버전을 알 수 없다.
2. 불변 `sha-<short>` 태그 + 서버 `.env` 의 `API_IMAGE_TAG` 를 단일 사실로 + 배포 스크립트의 헬스체크·자동 롤백 — 서버에 직전 이미지를
   보존해 레지스트리 없이 롤백된다. 스크립트 한 개를 CI 와 사람이 공용한다. (채택)
3. 무중단 blue-green — VPS 1대·컨테이너 1개 규모에 과하다.

## 결정

대안 2. 태그는 `sha-<short>` 하나다. `scripts/deploy.sh <태그>` 가 pull → `.env` 기록(`API_IMAGE_TAG_PREV` 보존) → `prisma migrate deploy` →
up → `/health` 2초×30회 폴링 → 실패 시 직전 태그로 되돌린다. 이미지는 현재·직전만 남긴다. api 의 호스트 publish 를 없애고(caddy 가
compose 네트워크로 접근) 세 서비스에 json-file 로그 로테이션(10m×3)을 둔다. 워크플로는 `concurrency` 로 직렬화하고 문서 전용 변경은
`paths-ignore` 로 뺀다.

## 결과

- 서버 `.env` 의 `API_IMAGE_TAG` 가 현재 버전의 단일 사실이자 롤백 기준점이 된다. 수동 배포·롤백은 `deploy.sh` 한 줄이다.
- 첫 전환 배포가 서버의 compose·Caddyfile 을 리포 내용으로 덮어쓴다. 전환 전에 서버 사본과 리포를 `diff` 해 서버 쪽 수정을 리포에 먼저 반영해야 한다.
- 마이그레이션은 롤백 대상이 아니다(Prisma 에 down 이 없다). 스키마 변경 배포의 롤백은 구 코드와 새 스키마의 호환 확인이 선행된다.
- 되돌릴 경우의 비용: compose 의 `image:` 태그를 고정값으로 바꾸고 워크플로에서 `latest` 태그를 복구하면 된다. 스크립트는 그대로 두어도 해가 없다.
