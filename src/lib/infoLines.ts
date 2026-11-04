// src/lib/infoLines.ts
//
// 영업시간·휴무일·주차·입장료처럼 한 칸에 여러 내용이 붙어 오는 글을 한 줄에 하나씩 나눕니다.
// 공공데이터는 출처마다 구분 방식이 달라서("매일 10:00~22:00 / 월요일 휴무", "월~금 09:30~18:30, 토 09:30~13:00",
// "- 1월/11월 09:00~17:30- 2월 09:00~18:00") 화면마다 한 줄로 길게 이어져 보였습니다.
//   · " / " (띄어 쓴 빗금)과 끝에 남은 "/" → 줄바꿈. "월/수/금", "1월/11월"처럼 붙여 쓴 빗금은 그대로 둡니다.
//   · 시각·괄호 뒤의 쉼표 → 줄바꿈("글램핑장, 펜션 15:00"처럼 낱말 사이 쉼표는 그대로)
//   · 줄 중간에 붙은 "- 항목", "[구분]", "※ 안내" → 새 줄

export function infoLines(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const text = raw
    .replace(/\r/g, "")
    .replace(/\s+\/\s+/g, "\n")
    .replace(/\/\s*$/gm, "")
    .replace(/([\d)])\s*,\s*/g, "$1\n")
    .replace(/(\S)\s*-\s(?=[가-힣\d[(])/g, "$1\n- ")
    .replace(/(\S)[ \t]*(\[[^\]\n]{1,20}\])/g, "$1\n$2")
    .replace(/([^\n])[ \t]*※/g, "$1\n※");
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** 화면에 그대로 넣을 수 있게 줄바꿈 문자로 이은 글(white-space: pre-line과 함께 씁니다) */
export const infoText = (raw: string | null | undefined): string => infoLines(raw).join("\n");
