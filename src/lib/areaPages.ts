// 지역별 소개 페이지(/area/지역) 공통 — 2026-11-13
// "대구 애견동반 카페", "강릉 반려동물 동반 숙소" 같은 검색으로 들어오는 사람을 위한 페이지입니다.
// 지역 id는 커뮤니티 지역 게시판(REGION_BOARDS)과 같습니다.

import { REGION_BOARDS } from "@/lib/communityBoards";

/** 지역 id → 주소 맨 앞에 오는 시·도 이름들(옛 이름·새 이름 모두) */
const ADDRESS_PREFIXES: Record<string, string[]> = {
  seoul: ["서울"], busan: ["부산"], daegu: ["대구"], incheon: ["인천"],
  jeonnam: ["전남", "전라남도", "광주", "전남광주"],
  daejeon: ["대전"], ulsan: ["울산"], sejong: ["세종"], gyeonggi: ["경기"], gangwon: ["강원"],
  chungbuk: ["충북", "충청북도"], chungnam: ["충남", "충청남도"], jeonbuk: ["전북", "전라북도"],
  gyeongbuk: ["경북", "경상북도"], gyeongnam: ["경남", "경상남도"], jeju: ["제주"],
};

export const AREAS = REGION_BOARDS.map((b) => ({ id: b.id, label: b.label }));
export const areaOf = (id: string) => AREAS.find((a) => a.id === id) ?? null;

export function inArea(address: string | null | undefined, areaId: string): boolean {
  const text = (address ?? "").trim();
  return (ADDRESS_PREFIXES[areaId] ?? []).some((prefix) => text.startsWith(prefix));
}

/** 페이지에 보여 줄 묶음 — 분류 이름으로 나눕니다 */
export const AREA_GROUPS: { id: string; title: string; test: (category: string) => boolean }[] = [
  { id: "food", title: "카페·음식점", test: (c) => /카페|음식점|식당|제과|베이커리/.test(c) },
  { id: "stay", title: "숙소", test: (c) => /숙박|펜션|호텔|리조트|민박|글램핑|캠핑|한옥/.test(c) },
  { id: "tour", title: "여행지·관광지", test: (c) => /여행지|관광지|박물관|미술관|문화|레포츠|체험/.test(c) },
  { id: "hospital", title: "동물병원·동물약국", test: (c) => /동물병원|동물약국/.test(c) },
  { id: "care", title: "미용·용품", test: (c) => /미용|용품|위탁|유치원/.test(c) },
];
