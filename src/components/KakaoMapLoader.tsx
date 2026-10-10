"use client";

import { useEffect, useSyncExternalStore } from "react";
import KakaoMap from "@/components/KakaoMap";
import LogoLoader from "@/components/LogoLoader";
import { fetchPublicDataPlaces } from "@/lib/publicDataPlaces";
import { fetchParks } from "@/lib/parkPlaces";

// ⚠ 속도: 예전에는 next/dynamic으로 지도 코드를 "화면 준비가 끝난 뒤"에야 받기 시작했습니다. 그래서
// "화면 준비 → 지도 코드 받기 → 지도 엔진 받기 → 장소 데이터 받기"를 한 줄로 차례차례 기다렸습니다(폰에서 3~4초).
// 이제 지도 코드는 첫 화면의 다른 코드와 함께 한꺼번에 받고(정적 import), 지도 엔진은 layout.tsx의 짧은 스크립트가,
// 장소 데이터는 아래에서 미리 받기 시작합니다. 지도 화면(KakaoMap)은 나중에 같은 것을 다시 요청하지만 이미 받고 있는
// 것을 그대로 이어받습니다(같은 요청은 한 번만 나갑니다).
// 지도는 브라우저에서만 그릴 수 있어서, 서버가 만든 첫 화면과 브라우저가 준비되기 전까지는 로고 화면을 보여 줍니다.

if (typeof window !== "undefined") {
  // 장소 데이터: 지난번 위치가 저장돼 있으면 그 동네 것을 바로 받기 시작합니다(지도 화면의 첫 요청과 같은 주소).
  // 저장된 위치가 없는 첫 방문은 내 위치가 잡힌 뒤에 받으므로 여기서는 받지 않습니다.
  try {
    const lat = parseFloat(window.localStorage.getItem("user_lat") || "");
    const lng = parseFloat(window.localStorage.getItem("user_lng") || "");
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      void fetchPublicDataPlaces({ lat, lng });
      void fetchParks({ lat, lng });
    }
  } catch { /* 저장소를 못 쓰는 환경 — 지도 화면이 평소대로 받습니다 */ }
}

const subscribeNothing = () => () => {};

export default function KakaoMapLoader() {
  // 서버가 만든 첫 화면에서는 false, 브라우저가 준비되면 true.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  // 먼저 그려 둔 지도(layout.tsx)를 지도 화면이 넘겨받지 못한 채 다른 화면으로 가면, 그 지도가 화면을 덮지 않게 치웁니다.
  useEffect(() => () => {
    document.getElementById("ggk-early-map")?.remove();
    (window as unknown as { __ggkEarlyMap?: unknown }).__ggkEarlyMap = null;
  }, []);
  // 지도가 준비되는 동안의 첫 화면 — 크림색 바탕에 로고가 통통 튑니다(예전에는 회색 뼈대 화면이었습니다).
  if (!mounted) return <LogoLoader page size={72} label="지도를 준비하고 있어요" />;
  return <KakaoMap />;
}
