// src/lib/pageGuides.ts
//
// 페이지별 첫 방문 안내 문구(src/components/PageGuide.tsx가 사용).
// 대상은 CSS 선택자로 찾고, 지금 화면에 없는 대상은 자동으로 건너뜁니다 — 그래서 PC·휴대폰 단계를
// 한 목록에 함께 적어 두면 각 화면에 있는 것만 차례로 안내됩니다.
// 지도 안내는 첫 소개(WelcomeIntro)에서 고른 목적에 맞춰 달라집니다(mapGuideSteps).
// 문구를 바꾸면 storageKey 끝의 숫자를 올려야 이미 본 사람에게도 다시 보입니다.

import type { GuideStep } from "@/components/PageGuide";

// ── 첫 소개에서 고른 목적 ──

export type GuideInterest = "places" | "stay" | "shop" | "owner";
const INTEREST_KEY = "ggk_guide_interest";

export function getGuideInterest(): GuideInterest {
  try {
    const saved = localStorage.getItem(INTEREST_KEY);
    if (saved === "stay" || saved === "shop" || saved === "owner") return saved;
  } catch { /* 저장소를 못 쓰면 기본 안내 */ }
  return "places";
}

export function setGuideInterest(interest: GuideInterest): void {
  try { localStorage.setItem(INTEREST_KEY, interest); } catch { /* 저장 실패는 무시 */ }
}

// ── 지도 ──

const SEARCH = 'input[placeholder*="우리동네"]';
const LOGIN_OR_MYPAGE: GuideStep[] = [
  { selector: '[data-guide="tab-mypage"]', title: "주문·예약 내역", text: "결제 내역, 취소 신청, 후기 쓰기는\n마이페이지의 주문·예약 내역에서 해요." },
  { selector: '[data-guide="tab-login"]', title: "로그인", text: "예약과 주문은 로그인한 뒤에 할 수 있어요.\n내역은 마이페이지에서 볼 수 있어요." },
];
const LIST: GuideStep[] = [
  // 휴대폰: 하단 목록 손잡이 / PC: 왼쪽 목록
  { selector: '[aria-label="목록 더 보기"]', title: "주변 장소 목록", text: "지도에 보이는 장소와 검색 결과가 여기에 나와요.\n손잡이를 위로 끌면 펼쳐져요." },
  { selector: '[data-guide="list-panel"]', title: "주변 장소 목록", text: "지도에 보이는 장소와 검색 결과가 여기에 나와요.\n누르면 지도가 그 장소로 이동해요." },
];

export const MAP_GUIDE_KEY = "ggk_guide_map_v5";
const MAP_STEPS: Record<GuideInterest, GuideStep[]> = {
  places: [
    { selector: SEARCH, title: "검색", text: "가게 이름이나 지역으로 찾아요.\n‘우리동네 핫플’, ‘내주변 카페’처럼 말하듯이 써도 돼요." },
    // 휴대폰: 가로로 넘기는 필터 줄 / PC: 가운데 필터 줄
    { selector: '[data-guide="filters-mobile"]', title: "필터", text: "실내·야외 동반 범위로 골라 볼 수 있어요.\n옆으로 밀면 동물병원·동물약국·공원이 더 있어요." },
    { selector: '[data-guide="filters"]', title: "필터", text: "실내·야외 동반 범위와 동물병원·동물약국·공원으로 골라 볼 수 있어요." },
    ...LIST,
    // 휴대폰: 메뉴 버튼 하나 / PC: 버튼 묶음
    { selector: '[aria-label="메뉴 열기"]', title: "추천·코스·제보", text: "새로 생긴 곳, 취향 추천, 산책 코스, 제보하기가\n이 메뉴에 모여 있어요." },
    { selector: '[aria-label="취향 추천"]', title: "취향 추천", text: "지금 위치와 취향에 맞는 장소를 골라 드려요." },
    { selector: '[aria-label="산책 코스"]', title: "산책 코스", text: "공원·카페·식당을 이어 코스를 짜 드려요.\n마음에 드는 코스는 저장할 수 있어요." },
    { selector: '[data-guide="report"]', title: "제보하기", text: "지도에 없는 장소나 달라진 정보를 알려 주세요.\n반영되면 레벨 점수가 올라가요." },
  ],
  stay: [
    { selector: '[data-guide="tab-stay"]', title: "숙소 탭", text: "반려동물 동반 숙소는 여기서 찾고 예약해요.\n지역별로 모아 볼 수 있어요." },
    { selector: SEARCH, title: "지도에서 찾기", text: "지역 이름으로 검색하면 그 근처의 숙소와\n함께 갈 만한 장소를 지도에서 볼 수 있어요." },
    ...LIST,
    ...LOGIN_OR_MYPAGE,
  ],
  shop: [
    { selector: '[data-guide="tab-shop"]', title: "쇼핑 탭", text: "입점한 동네 가게의 메뉴를 모아 봐요.\n포장 주문이나 매장 식사 예약을 넣을 수 있어요." },
    { selector: SEARCH, title: "지도에서 찾기", text: "‘내주변 카페’처럼 검색해 보세요.\n입점 가게는 장소 화면에서 바로 주문할 수 있어요." },
    ...LIST,
    ...LOGIN_OR_MYPAGE,
  ],
  owner: [
    { selector: '[aria-label="사장님"]', title: "사장님", text: "우리 가게를 등록하고 관리하는 곳입니다.\n입점 상담도 이곳에서 시작합니다." },
    { selector: '[aria-label="메뉴 열기"]', title: "사장님 메뉴", text: "메뉴를 열면 ‘사장님’이 있습니다.\n우리 가게를 등록하고 관리할 수 있습니다." },
    { selector: SEARCH, title: "우리 가게 찾기", text: "가게 이름으로 검색해 보십시오.\n장소 화면의 입점 안내에서 바로 상담을 신청할 수 있습니다." },
    { selector: '[data-guide="tab-stay"]', title: "숙소 탭", text: "입점한 숙소가 손님에게 보이는 화면입니다." },
    { selector: '[data-guide="tab-shop"]', title: "쇼핑 탭", text: "입점한 가게의 메뉴가 손님에게 보이는 화면입니다." },
  ],
};
/** 고른 목적에 맞는 지도 안내 */
export const mapGuideSteps = (): GuideStep[] => MAP_STEPS[getGuideInterest()];

// ── 그 밖의 화면 ──

export const STAY_GUIDE_KEY = "ggk_guide_stay_v1";
export const STAY_GUIDE_STEPS: GuideStep[] = [
  { selector: 'input[placeholder*="숙소 이름"]', title: "숙소 찾기", text: "숙소 이름이나 지역으로 찾아요." },
  { selector: '[data-guide="stay-regions"]', title: "지역 고르기", text: "내 주변이나 원하는 지역의 숙소만 모아 봐요.\n‘전체 지역’에서는 시·도별로 볼 수 있어요." },
  { selector: '[data-guide="stay-card"]', title: "숙소 카드", text: "누르면 객실, 요금, 반려동물 동반 규정을 볼 수 있어요.\n입점한 숙소는 날짜를 골라 바로 예약해요." },
  ...LOGIN_OR_MYPAGE,
];

export const SHOP_GUIDE_KEY = "ggk_guide_shop_v1";
export const SHOP_GUIDE_STEPS: GuideStep[] = [
  { selector: 'input[placeholder*="가게나 상품"]', title: "가게·메뉴 찾기", text: "가게나 메뉴 이름으로 찾아요." },
  { selector: '[data-guide="shop-store"]', title: "입점 가게", text: "가게를 펼치면 메뉴를 고를 수 있어요.\n포장 주문이나 매장 식사 예약을 넣어 보세요." },
  ...LOGIN_OR_MYPAGE,
];

export const ORDERS_GUIDE_KEY = "ggk_guide_orders_v1";
export const ORDERS_GUIDE_STEPS: GuideStep[] = [
  { selector: '[data-guide="orders-tabs"]', title: "숙소·쇼핑 내역", text: "숙소 예약과 쇼핑 주문을 나눠 볼 수 있어요.\n결제 내역과 영수증도 여기서 확인해요." },
  { selector: '[data-guide="orders-list"]', title: "취소와 후기", text: "진행 중인 건은 여기서 취소를 신청해요.\n이용을 마치면 후기를 남길 수 있어요." },
];

export const OWNER_GUIDE_KEY = "ggk_guide_owner_v1";
export const OWNER_GUIDE_STEPS: GuideStep[] = [
  // PC: 왼쪽 메뉴 / 휴대폰: 옆으로 미는 메뉴
  { selector: ".oc-side", title: "사장님 메뉴", text: "예약·주문 확인, 후기 답글, 공지, 가게 정보, 광고 상품을\n이 메뉴에서 관리합니다." },
  { selector: ".oc-chips", title: "사장님 메뉴", text: "옆으로 밀면 메뉴가 더 있습니다.\n예약·주문, 후기, 공지, 가게 정보를 관리합니다." },
  { selector: ".oc-main", title: "운영 현황", text: "고른 메뉴의 내용이 이곳에 표시됩니다.\n새 예약과 답글이 필요한 후기는 메뉴에 숫자로 표시됩니다." },
];

export const COMMUNITY_GUIDE_KEY = "ggk_guide_community_v3";
export const COMMUNITY_GUIDE_STEPS: GuideStep[] = [
  { selector: '[data-guide="community-boards"]', title: "게시판", text: "주제별 게시판과 지역 게시판을 골라 볼 수 있어요.\n운영 소식은 ‘공지’에 올라와요." },
  { selector: 'input[placeholder="제목 또는 내용 검색"]', title: "검색", text: "제목이나 내용으로 글을 찾을 수 있어요." },
  { selector: '[aria-label="글쓰기"]', title: "글쓰기", text: "산책 후기, 질문, 동네 소식을 남겨 보세요.\n닉네임 옆 배지는 활동으로 쌓은 레벨이에요." },
];

export const ADOPT_GUIDE_KEY = "ggk_guide_adopt_v2";
export const ADOPT_GUIDE_STEPS: GuideStep[] = [
  { selector: '[data-guide="adopt-regions"]', title: "지역 선택", text: "시·도를 고르면 시·군·구까지 골라 볼 수 있어요.\n옆으로 밀면 지역이 더 있어요." },
  { selector: '[data-guide="adopt-alert"]', title: "새 공고 알림", text: "지역을 고른 뒤 켜 두면, 그 지역에 새 공고가 올라올 때 알림을 보내 드려요." },
  { selector: '[data-guide="adopt-list"] a', title: "공고 카드", text: "마감이 임박한 순서예요. 누르면 보호소 연락처와 입양·임시보호 문의 방법을 볼 수 있어요." },
];

export const MYPAGE_GUIDE_KEY = "ggk_guide_mypage_v4";
export const MYPAGE_GUIDE_STEPS: GuideStep[] = [
  { selector: '[data-guide="mypage-orders"]', title: "주문·예약 내역", text: "숙소와 쇼핑의 결제 내역을 보고,\n취소를 신청하거나 후기를 남겨요." },
  { selector: '[data-guide="mypage-tabs"]', title: "내 활동", text: "찜한 장소, 저장한 코스, 커뮤니티에 쓴 글, 내가 쓴 댓글을 모아 볼 수 있어요." },
  { selector: '[data-member-level-card]', title: "내 레벨", text: "제보·후기·장소 사진 등록으로 점수가 쌓여요.\n다음 레벨까지 얼마나 남았는지 볼 수 있어요." },
  { selector: '[data-guide="mypage-settings"]', title: "설정", text: "닉네임·프로필 변경, 로그아웃, 회원 탈퇴는 여기서 해요." },
];

export const PLACE_GUIDE_KEY = "ggk_guide_place_v3";
export const PLACE_GUIDE_STEPS: GuideStep[] = [
  { selector: '[data-guide="place-score"]', title: "반려동물 친화도", text: "후기·반응·편의시설을 바탕으로 계산한 점수예요." },
  { selector: '[data-guide="place-photo-add"]', title: "사진 추가", text: "직접 찍은 장소 사진을 올려 주세요.\n다른 보호자에게 도움이 되고, 레벨 점수도 올라가요." },
  { selector: '[data-guide="place-actions"]', title: "찜·추천·길찾기", text: "찜해 두면 마이페이지에서 다시 볼 수 있어요.\n길찾기는 네이버지도로 연결돼요." },
  { selector: 'textarea[placeholder="댓글을 입력하세요"]', title: "후기", text: "다녀온 뒤 후기를 남겨 주세요. 다른 보호자에게 큰 도움이 돼요.\n사장님이 답글을 달아 주기도 해요." },
  { selector: '[data-guide="place-menu"]', title: "공유·신고", text: "공유하기와 장소 신고하기가 여기 있어요.\n정보가 틀리거나 동반이 안 되는 곳은 신고해 주세요." },
];
