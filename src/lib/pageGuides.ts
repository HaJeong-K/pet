// src/lib/pageGuides.ts
//
// 페이지별 첫 방문 안내 문구(src/components/PageGuide.tsx가 사용).
// 대상은 CSS 선택자로 찾고, 지금 화면에 없는 대상은 자동으로 건너뜁니다 — 그래서 PC·휴대폰 단계를
// 한 목록에 함께 적어 두면 각 화면에 있는 것만 차례로 안내됩니다.
// 문구를 바꾸면 storageKey 끝의 숫자를 올려야 이미 본 사람에게도 다시 보입니다.

import type { GuideStep } from "@/components/PageGuide";

export const MAP_GUIDE_KEY = "ggk_guide_map_v3";
export const MAP_GUIDE_STEPS: GuideStep[] = [
  // 휴대폰: 가로로 넘기는 필터 줄 / PC: 가운데 필터 줄
  { selector: '[data-guide="filters-mobile"]', title: "필터", text: "동반 가능 범위로 골라 볼 수 있어요.\n옆으로 밀면 동물병원·동물약국·공원 필터가 더 있어요." },
  { selector: '[data-guide="filters"]', title: "필터", text: "실내·야외 동반 가능 범위와 동물병원·동물약국·공원으로 골라 볼 수 있어요." },
  { selector: '[data-guide="park-toggle"]', title: "공원 표시", text: "공원은 지도에 기본으로 함께 보여요.\n이 버튼을 누르면 끄고, 다시 누르면 켤 수 있어요." },
  // 휴대폰: 메뉴 버튼 하나 / PC: 아이콘 5개
  { selector: '[aria-label="메뉴 열기"]', title: "메뉴", text: "신규 장소·추천·AI 코스·사장님 등록·제보하기는 이 메뉴에 모여 있어요." },
  { selector: '[aria-label="신규 장소"]', title: "신규 장소", text: "새로 등록된 장소를 모아 보여줘요." },
  { selector: '[aria-label="추천 장소"]', title: "추천 장소", text: "취향에 맞는 장소를 AI가 추천해드려요." },
  { selector: '[aria-label="AI 코스"]', title: "AI 코스", text: "AI가 산책하기 좋은 코스를 짜드려요." },
  { selector: '[aria-label="사장님 등록"]', title: "사장님 등록", text: "사장님이시라면 여기서 업장을 등록하세요." },
  { selector: '[aria-label="제보하기"]', title: "제보하기", text: "새로운 장소나 정보를 제보할 수 있어요." },
  // 휴대폰: 하단 목록 손잡이 / PC: 왼쪽 목록
  { selector: '[aria-label="목록 더 보기"]', title: "주변 장소 목록", text: "이 손잡이를 위로 끌어올리면 목록이 펼쳐지고,\n아래로 내리면 지도가 넓어져요." },
  { selector: '[data-guide="list-panel"]', title: "주변 장소 목록", text: "지금 지도에 보이는 장소들이에요. 누르면 지도가 그 장소로 이동해요." },
  { selector: '[title="내 위치로 이동"]', title: "내 위치", text: "지도를 내 위치로 옮겨요.\n지도를 멀리 옮겼을 때 돌아올 수 있어요." },
  { selector: '[data-guide="tabbar"]', title: "하단 탭", text: "커뮤니티, 유기동물 입양 공고, 마이페이지는 여기서 오갈 수 있어요." },
];

export const COMMUNITY_GUIDE_KEY = "ggk_guide_community_v1";
export const COMMUNITY_GUIDE_STEPS: GuideStep[] = [
  { selector: '[data-guide="community-boards"]', title: "게시판", text: "자유게시판, 지역 게시판, 사장님 게시판을 골라 볼 수 있어요." },
  { selector: 'input[placeholder="제목 또는 내용 검색"]', title: "검색", text: "제목이나 내용으로 글을 찾을 수 있어요." },
  { selector: '[aria-label="글쓰기"]', title: "글쓰기", text: "산책 후기, 질문, 동네 소식을 남겨 보세요." },
];

export const ADOPT_GUIDE_KEY = "ggk_guide_adopt_v1";
export const ADOPT_GUIDE_STEPS: GuideStep[] = [
  { selector: '[data-guide="adopt-regions"]', title: "지역 선택", text: "시·도를 고르면 그 아래에서 시·군·구까지 골라 볼 수 있어요.\n옆으로 밀면 지역이 더 있어요." },
  { selector: '[data-guide="adopt-alert"]', title: "새 공고 알림", text: "지역을 고른 뒤 켜 두면, 그 지역에 새 공고가 올라올 때 알림을 보내 드려요." },
  { selector: '[data-guide="adopt-list"] a', title: "공고 카드", text: "마감이 임박한 순서예요. 누르면 보호소 연락처와 입양·임시보호 문의 방법을 볼 수 있어요." },
];

export const MYPAGE_GUIDE_KEY = "ggk_guide_mypage_v1";
export const MYPAGE_GUIDE_STEPS: GuideStep[] = [
  { selector: '[data-guide="mypage-tabs"]', title: "내 활동", text: "찜한 장소, 커뮤니티에 쓴 글, 내가 쓴 댓글을 모아 볼 수 있어요." },
  { selector: '[data-guide="mypage-settings"]', title: "설정", text: "닉네임·프로필 변경, 로그아웃, 회원 탈퇴는 여기서 해요.\n사장님은 가게 정보와 통계도 여기서 볼 수 있어요." },
];

export const PLACE_GUIDE_KEY = "ggk_guide_place_v1";
export const PLACE_GUIDE_STEPS: GuideStep[] = [
  { selector: '[data-guide="place-score"]', title: "반려동물 친화도", text: "후기·반응·편의시설을 바탕으로 계산한 점수예요." },
  { selector: '[data-guide="place-actions"]', title: "찜·추천·길찾기", text: "찜해 두면 마이페이지에서 다시 볼 수 있어요.\n길찾기는 카카오맵·네이버지도로 연결돼요." },
  { selector: 'textarea[placeholder="댓글을 입력하세요"]', title: "후기", text: "다녀온 뒤 후기를 남겨 주세요. 다른 보호자에게 큰 도움이 돼요." },
  { selector: '[data-guide="place-menu"]', title: "공유·신고", text: "공유하기와 장소 신고하기가 여기 있어요.\n정보가 틀리거나 동반이 안 되는 곳은 신고해 주세요." },
];
