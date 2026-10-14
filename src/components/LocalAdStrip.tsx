"use client";

// 휴대폰·좁은 화면용 한 줄 배너 — 배너 광고 가게를 보여 줍니다(누가 나오는지는 src/lib/useLocalAds.ts).
// PC의 넓은 화면에서는 양옆 광고 칸(SideAdRail)이 보여 주므로 이 배너는 숨깁니다.
// 보여 줄 가게가 없으면 아무것도 그리지 않습니다(빈 광고 칸을 남기지 않음).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import BannerCreativeView from "@/components/BannerCreativeView";
import { RAIL_MEDIA, trackBannerClick, trackBannerView, useLocalAds } from "@/lib/useLocalAds";
import { openPlaceDetail } from "@/lib/openPlace";

export default function LocalAdStrip() {
  const router = useRouter();
  const { places } = useLocalAds(true);
  const place = places[0];
  // 실제로 이 배너가 보이는 화면(좁은 화면)에서만 노출로 셉니다 — 넓은 화면에서는 양옆 광고 칸이 셉니다.
  useEffect(() => {
    if (place && !window.matchMedia(RAIL_MEDIA).matches) trackBannerView(place, "strip");
  }, [place]);
  if (!place) return null;
  return (
    <div className="ggk-local-ad-strip" style={{ flexShrink: 0 }}>
      <style>{`
        /* SideAdRail이 보이는 화면(가로형 + 1460px 이상)에서는 숨깁니다 — 같은 광고가 두 번 보이지 않게 */
        @media ${RAIL_MEDIA} { .ggk-local-ad-strip { display: none !important; } }
      `}</style>
      <BannerCreativeView banner={place} shape="strip" onClick={() => { trackBannerClick(place, "strip"); openPlaceDetail(router, place); }} />
    </div>
  );
}
