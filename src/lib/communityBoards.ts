// src/lib/communityBoards.ts
//
// 커뮤니티 게시판 목록 — 커뮤니티 화면과 마이페이지("작성한 글"의 게시판 이름 표시)가 함께 씁니다.

export const BOARDS = [
  { id: "all", label: "전체" },
  { id: "free", label: "자유게시판" },
  { id: "business", label: "사장님 게시판" },
  { id: "seoul", label: "서울" },
  { id: "gyeonggi", label: "경기" },
  { id: "incheon", label: "인천" },
  { id: "gangwon", label: "강원" },
  { id: "chungbuk", label: "충북" },
  { id: "daejeon", label: "대전" },
  { id: "chungnam", label: "충남" },
  { id: "gyeongbuk", label: "경북" },
  { id: "daegu", label: "대구" },
  { id: "ulsan", label: "울산" },
  { id: "gyeongnam", label: "경남" },
  { id: "busan", label: "부산" },
  { id: "jeonbuk", label: "전북" },
  { id: "jeonnam", label: "전남" },
  { id: "gwangju", label: "광주" },
  { id: "jeju", label: "제주" },
];

/** 게시판 id → 이름(모르는 id는 그대로 보여줍니다) */
export const boardLabel = (id: string | null | undefined): string =>
  BOARDS.find((b) => b.id === id)?.label || id || "커뮤니티";
