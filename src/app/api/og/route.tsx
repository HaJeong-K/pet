import { renderShareCard } from "@/lib/server/ogCard";

// GET /api/og — 사이트 기본 공유 카드(홈·커뮤니티 등 장소가 아닌 화면을 공유했을 때)
// 글자를 주소로 받지 않고 고정 문구만 그립니다(누가 우리 브랜드로 임의의 문구 이미지를 만들지 못하게).
export async function GET() {
  return renderShareCard({
    title: "반려동물과 함께 갈 곳 찾기",
    subtitle: "동반 가능한 카페·식당·공원·병원을 지도에서 한눈에",
    tags: ["동반 장소 지도", "AI 산책 코스", "유기동물 공고"],
  });
}
