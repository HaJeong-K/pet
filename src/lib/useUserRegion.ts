"use client";

import { useEffect, useState } from "react";

// ── 사용자 위치 기반 시/도 감지 ──
// 카카오 좌표→행정구역 변환 API로 현재 위치의 시/도(짧은 이름, 예: "경남")를 구합니다.
// SideAdRail(미리보기 2건)과 /shelter-notices(전체보기 페이지)에서 공통으로 씁니다.
// 위치 조회에 실패하거나 사용자가 거부하면 null을 반환하고, 호출부는 전국 공고로 대체합니다.
export function useUserRegion() {
  const [region, setRegion] = useState<string | null>(null);

  useEffect(() => {
    const cached = typeof window !== "undefined" ? localStorage.getItem("user_region_sido") : null;
    if (cached) setRegion(cached);

    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${longitude}&y=${latitude}`,
            { headers: { Authorization: `KakaoAK ${process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY}` } }
          );
          const data = await res.json();
          const name: string | undefined = data.documents?.[0]?.region_1depth_name;
          if (name) {
            setRegion(name);
            localStorage.setItem("user_region_sido", name);
          }
        } catch {
          /* 위치 조회 실패 시 전국 공고로 대체됩니다 */
        }
      },
      () => {},
      { maximumAge: 30 * 60 * 1000, timeout: 5000 }
    );
  }, []);

  return region;
}
