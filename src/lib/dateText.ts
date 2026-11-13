// 날짜 표시 통일 — 2026-11-13
// 손님 화면의 글·후기·댓글 날짜는 이 함수들로 같은 모양("26.11.13", "26.11.13 14:05")으로 보여 줍니다.
// 예전에는 화면마다 "26-11-13 14:05"와 "26.11.13"이 섞여 있었습니다.
// (예약·주문 날짜는 요일이 필요해서 stayDayLabel — "11월 13일(금)" — 을 그대로 씁니다.)

const two = (n: number) => String(n).padStart(2, "0");

/** "26.11.13" */
export function shortDate(value: string | number | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getFullYear()).slice(2)}.${two(d.getMonth() + 1)}.${two(d.getDate())}`;
}

/** "26.11.13 14:05" */
export function shortDateTime(value: string | number | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${shortDate(d)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
