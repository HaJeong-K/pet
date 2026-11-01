// src/lib/publicDataDedupe.ts
//
// 공공데이터 여러 출처를 합칠 때 같은 장소(이름+주소가 같음)를 하나로 줄입니다.
// 먼저 나온 출처를 남기되, 비어 있는 칸은 뒤 출처의 값으로 채웁니다.
// ⚠ 예전엔 뒤 출처를 통째로 버려서, 문화정보원과 겹치는 관광공사 장소 171곳(올림픽공원·한림공원 등) 중
//   166곳의 사진이 지도에 나오지 않았습니다(문화정보원 자료에는 사진이 없습니다).

const normalize = (text: string | null | undefined) =>
  (text || "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^가-힣0-9a-zA-Z]/g, "")
    .toLowerCase();

const placeKey = (item: any) => `${normalize(item.name)}|${normalize(item.address)}`;

const FILLABLE = ["image_url", "phone", "website", "hours", "closed_days", "parking", "entry_fee", "treatable_animals"];

export function dedupeAcrossSources(...sources: any[][]): any[] {
  const kept = new Map<string, any>();
  for (const list of sources) {
    for (const item of list) {
      const key = placeKey(item);
      if (!key.trim()) continue;
      const first = kept.get(key);
      if (!first) { kept.set(key, { ...item }); continue; }
      for (const field of FILLABLE) if (!first[field] && item[field]) first[field] = item[field];
    }
  }
  return [...kept.values()];
}
