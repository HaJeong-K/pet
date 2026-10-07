import type { MetadataRoute } from "next";

// 앱처럼 설치할 수 있게 하는 정보(웹 앱 매니페스트) — /manifest.webmanifest 로 제공됩니다.
// 안드로이드 앱(사이트를 그대로 감싼 앱, android/ 참고)과 크롬의 "홈 화면에 추가"가 이 정보를 씁니다:
// 앱 이름·아이콘, 주소창 없이 전체 화면으로 열기(standalone), 처음 열 화면.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "같이가개 — 반려동물 동반 장소 지도",
    short_name: "같이가개",
    description: "반려동물과 함께 갈 수 있는 장소를 지도에서 찾아보세요.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F3E8",
    theme_color: "#5C7A4A",
    lang: "ko",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
