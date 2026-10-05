// src/lib/communityBoards.ts
//
// 커뮤니티 게시판·말머리 목록 — 커뮤니티 목록, 글쓰기, 마이페이지("작성한 글")가 함께 씁니다.
// 게시판을 늘리되 글의 성격이 섞이지 않도록, 게시판마다 쓸 수 있는 말머리와 짧은 이용 안내를 둡니다.
// 게시판을 추가하려면 여기에만 넣으면 됩니다(DB 변경 불필요 — board_id·post_type은 글자 값으로 저장).

export type Board = {
  id: string;
  label: string;
  /** 게시판을 골랐을 때 목록 위에 보여 주는 한 줄 안내(무엇을 쓰는 곳인지·지켜야 할 점) */
  desc?: string;
};

/** 주제 게시판 — 반려동물 이야기가 중심이지만, 일상 이야기도 나눌 수 있게 열어 둡니다. */
export const TOPIC_BOARDS: Board[] = [
  { id: "free", label: "자유게시판", desc: "반려 생활 이야기를 자유롭게 나눠요. 서로 존중하는 말로 써 주세요." },
  { id: "rescue", label: "유기동물", desc: "입양 홍보·임시보호·실종·목격 제보 게시판이에요. 분양비를 받는 판매 글과 품종 분양 홍보는 올릴 수 없어요." },
  { id: "tips", label: "꿀팁·정보", desc: "건강·훈련·용품·여행 정보를 나눠요. 광고·홍보성 글은 사장님 게시판을 이용해 주세요." },
  { id: "qna", label: "질문·고민", desc: "궁금한 점이나 고민을 물어보세요. 아픈 아이는 글보다 병원 진료가 먼저예요." },
  { id: "review", label: "후기", desc: "다녀온 장소, 써 본 용품, 병원 후기를 남겨요. 직접 경험한 내용만 써 주세요." },
  { id: "share", label: "나눔", desc: "안 쓰는 용품을 나누거나 필요한 물건을 구해요. 돈을 받는 판매 글과 생체(동물) 거래는 올릴 수 없어요." },
  { id: "daily", label: "일상·수다", desc: "반려동물과 상관없는 일상 이야기도 좋아요. 정치·종교·비방 글은 삭제될 수 있어요." },
  { id: "suggest", label: "건의·문의", desc: "서비스에 바라는 점, 불편한 점, 잘못된 장소 정보를 알려 주세요." },
];

export const REGION_BOARDS: Board[] = [
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

/** 글을 모아 보기만 하는 가상 게시판(여기에 직접 글을 쓰지는 않음) */
export const ALL_BOARD_ID = "all";
export const BEST_BOARD_ID = "best";
/**
 * 인기 게시판에 오르는 기준 — 좋아요와 조회수를 둘 다 넘어야 합니다.
 * 좋아요만 보면 지인 몇 명이 눌러 줘도 오르고, 조회수만 보면 제목만 자극적인 글이 오르기 때문에
 * "많이 읽혔고(조회) 읽은 사람들이 좋다고 한(좋아요)" 글만 올립니다.
 */
export const BEST_MIN_LIKES = 10;
export const BEST_MIN_VIEWS = 100;

export const BOARDS: Board[] = [
  { id: ALL_BOARD_ID, label: "전체" },
  { id: BEST_BOARD_ID, label: "인기", desc: `좋아요 ${BEST_MIN_LIKES}개 이상, 조회 ${BEST_MIN_VIEWS}회 이상인 글을 좋아요 많은 순으로 모아 봐요.` },
  ...TOPIC_BOARDS,
  { id: "business", label: "사장님 게시판" },
  ...REGION_BOARDS,
];

/** 글을 쓸 수 있는 게시판(전체·인기 제외) */
export const WRITABLE_BOARDS: Board[] = BOARDS.filter((b) => b.id !== ALL_BOARD_ID && b.id !== BEST_BOARD_ID);

const REGION_POST_TYPES = ["산책친구", "정보공유", "질문", "방문후기"];

/** 게시판별 말머리 — 그 게시판에 맞는 글만 올라오도록 고를 수 있는 말머리를 제한합니다. */
const POST_TYPES_BY_BOARD: Record<string, string[]> = {
  free: ["잡담", "자랑", "유머", "산책친구"],
  rescue: ["입양홍보", "임시보호", "실종", "목격·구조", "입양후기"],
  tips: ["건강·병원", "훈련·교육", "사료·간식", "미용·용품", "여행·산책"],
  qna: ["질문", "고민상담"],
  review: ["방문후기", "용품후기", "병원후기"],
  share: ["나눔", "구해요"],
  daily: ["일상", "맛집", "취미", "직장·육아"],
  suggest: ["건의", "오류제보", "장소정보", "문의"],
  business: ["업체소식", "이벤트", "신규오픈"],
};

/** 그 게시판에서 고를 수 있는 말머리(전체·인기는 여러 게시판이 섞여 있어 말머리 필터를 두지 않음) */
export function postTypesFor(boardId: string | null | undefined): string[] {
  if (!boardId || boardId === ALL_BOARD_ID || boardId === BEST_BOARD_ID) return [];
  if (POST_TYPES_BY_BOARD[boardId]) return POST_TYPES_BY_BOARD[boardId];
  return REGION_BOARDS.some((b) => b.id === boardId) ? REGION_POST_TYPES : [];
}

export const findBoard = (id: string | null | undefined): Board | undefined => BOARDS.find((b) => b.id === id);

/** 게시판 id → 이름(모르는 id는 그대로 보여줍니다) */
export const boardLabel = (id: string | null | undefined): string => findBoard(id)?.label || id || "커뮤니티";
