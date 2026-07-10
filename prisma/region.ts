/**
 * 한국 주소 → (시도, 시군구) 파싱. seed 와 벌크 임포트가 공유.
 * 도로명/지번 주소 모두 앞 두 토큰이 시도·시군구인 규칙을 이용한다.
 * 예) "경기도 하남시 덕풍북로 160" → { sido: "경기도", sigungu: "하남시" }
 *     "서울특별시 강남구 ..."       → { sido: "서울특별시", sigungu: "강남구" }
 * 세종특별자치시처럼 시군구가 없는 경우 sigungu 는 빈 문자열일 수 있다.
 */
export function parseSidoSigungu(address: string | null | undefined): {
  sido: string | null;
  sigungu: string | null;
} {
  if (!address) return { sido: null, sigungu: null };
  const parts = address.trim().split(/\s+/);
  const sido = parts[0] ?? null;
  const sigungu = parts[1] ?? null;
  return { sido, sigungu };
}
