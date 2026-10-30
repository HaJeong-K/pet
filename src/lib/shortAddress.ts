// src/lib/shortAddress.ts
//
// 좁은 목록 카드용 짧은 주소 — 앞의 시·도와 시를 떼고 구·동·도로명부터 보여 줍니다.
//   경기도 수원시 팔달구 행궁로 12 → 팔달구 행궁로 12
//   서울특별시 종로구 사직로 8     → 종로구 사직로 8
//   제주특별자치도 제주시 한림읍 협재리 1 → 한림읍 협재리 1
// 시 바로 뒤에 도로명이 오면 어느 도시인지 알 수 없어지므로 시를 남깁니다.
//   강원특별자치도 강릉시 경강로 2100 → 강릉시 경강로 2100

const PROVINCE = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청[남북]|전라[남북]|경상[남북])(특별시|광역시|특별자치시|특별자치도|도)?$/;
const SUB_AREA = /(구|군|읍|면|동|리|가)$/;

export function shortAddress(address: string | null | undefined): string {
  // 끝의 (을지로1가) 같은 참고 항목은 뺍니다
  const tokens = (address ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim().split(/\s+/).filter(Boolean);
  if (PROVINCE.test(tokens[0] ?? "") && tokens.length > 1) tokens.shift();
  if (/시$/.test(tokens[0] ?? "") && SUB_AREA.test(tokens[1] ?? "")) tokens.shift();
  return tokens.join(" ");
}
