// src/lib/adoptPhrases.ts
//
// 보호소 공고 카드 위에 띄우는 입양 유도 문구.
// 카드 폭이 좁은 곳(사이드 레일 190px)에서도 한 줄에 들어가도록 짧게 유지합니다.
// 강아지·고양이 공고가 섞여 나오므로 "견생", "멍" 같은 특정 동물 표현은 쓰지 않습니다.

import { useState } from "react";

export const ADOPT_PHRASES = [
  "나의 가족이 되어주세요",
  "나의 가족을 찾아주세요",
  "저를 데려가 주실래요?",
  "따뜻한 집이 필요해요",
  "당신을 기다리고 있어요",
  "사랑받을 준비가 됐어요",
  "평생 가족을 기다려요",
  "제 이름을 불러주세요",
  "함께 걷고 싶어요",
  "오늘, 가족이 되어줄래요?",
  "마지막 가족이 되어주세요",
  "집에 가고 싶어요",
  "한 번만 눈 맞춰 주세요",
  "새 삶을 선물해 주세요",
  "저의 손을 잡아주세요",
  "곁에 있게 해 주세요",
];

/**
 * 화면을 열 때마다 문구 순서를 무작위로 섞어, 카드 순서(index)에 따라 하나씩 돌려줍니다.
 * 섞은 순서를 차례로 쓰기 때문에 이웃한 카드에 같은 문구가 연달아 나오지 않고,
 * 화면이 다시 그려져도(지역 변경 등) 문구가 깜빡이며 바뀌지 않습니다.
 */
export function useAdoptPhrases(): (index: number) => string {
  const [order] = useState(() => {
    const list = [...ADOPT_PHRASES];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  });
  return (index) => order[index % order.length];
}
