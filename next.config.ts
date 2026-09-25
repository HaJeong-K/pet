import type { NextConfig } from "next";
import withBundleAnalyzerInit from "@next/bundle-analyzer";

const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  images: {
    // 장소 이미지가 사용자 업로드(Supabase Storage), 관광공사/식약처/문화정보원
    // 공공데이터 원본 URL 등 출처가 다양해서 도메인을 하나로 특정할 수 없습니다.
    // https 출처만 허용해 next/image의 자동 포맷 변환(WebP/AVIF)·반응형 크기·지연
    // 로딩 이점은 그대로 가져가되, http(평문) 출처는 막습니다.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

// `npm run analyze`로 실행하면 빌드 후 청크별 용량을 브라우저에서 시각적으로 보여줍니다
// (ANALYZE=true일 때만 활성화 — 평소 빌드/배포에는 영향 없음). "느낌"이 아니라 실측
// 기준으로 어떤 모듈이 초기 번들을 부풀리는지 확인할 때 씁니다.
export default withBundleAnalyzer(nextConfig);
