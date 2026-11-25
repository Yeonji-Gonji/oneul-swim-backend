// 테스트가 개발자의 로컬 .env 에 좌우되지 않게 한다.
// @prisma/client 는 import 될 때 프로젝트 루트의 .env 를 읽어 들이지만 이미 있는 환경변수는 덮어쓰지 않는다.
// 서비스 생성자가 읽는 VAPID 키를 여기서 먼저 비워 두면, 로컬 .env 에 형식이 틀린 예시 값이 있어도
// CI(.env 없음)와 같은 조건으로 돈다. 값이 필요한 테스트는 자기 안에서 process.env 를 채운다.
for (const key of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
  process.env[key] = '';
}
