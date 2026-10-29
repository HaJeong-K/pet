"use client";

// 배너 광고 칸에 넣을 배너를 받아 옵니다. PC의 양옆 광고 칸(SideAdRail)과 휴대폰의 한 줄 배너(LocalAdStrip)가 같이 씁니다.
// 어느 가게가 나오는지는 서버가 정합니다(src/lib/localAds.ts · src/lib/server/bannerAds.ts):
//   숙소: 자주 검색한 지역 → 무작위, 일반 가게: GPS를 자주 켠 동네 → 자주 검색한 지역 → 무작위.
//   후보가 여러 곳이면 노출 횟수가 똑같아지도록 고릅니다.
// 서버는 부를 때마다 노출 횟수를 올리므로, 한 화면에서는 한 번만 부릅니다(양옆 칸과 한 줄 배너가 같은 응답을 나눠 씀).

import { useEffect, useState } from "react";
import { useUserArea } from "@/lib/useUserRegion";
import { trackEvent } from "@/lib/analytics";
import { readInterests } from "@/lib/interestRegions";
import { frequentGpsAreas, readGpsAreas } from "@/lib/gpsAreas";
import type { BannerFontId } from "@/lib/bannerCreative";

export type LocalAd = {
  id: number; name: string; category: string | null; address?: string | null;
  image: string | null; headline: string; body: string | null; font: BannerFontId; custom: boolean;
};

/** 양옆 광고 칸이 보이는 화면(가로형 + 1460px 이상)인지 — 보이면 2장, 아니면 한 줄 배너용 1장을 받습니다 */
export const RAIL_MEDIA = "(min-aspect-ratio: 1/1) and (min-width: 1460px)";

/** 배너가 보였다고 한 번만 셉니다(같은 방문에서 화면을 옮겨 다녀도 가게마다 한 번) */
export function trackBannerView(place: LocalAd, slot: string) {
  try {
    const key = `ggk_banner_seen_${place.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { /* 저장소를 못 써도 세기는 합니다 */ }
  trackEvent("banner_view", { placeId: place.id, placeName: place.name, meta: { slot } });
}
export function trackBannerClick(place: LocalAd, slot: string) {
  trackEvent("banner_click", { placeId: place.id, placeName: place.name, meta: { slot } });
}

// 같은 조건의 요청은 1분 동안 한 번만 보냅니다(한 화면의 두 칸이 같이 쓰고, 화면을 옮겨 다닐 때도 다시 세지 않게).
const REUSE_MS = 60_000;
let last: { key: string; at: number; promise: Promise<LocalAd[]> } | null = null;

function fetchAds(sigungu: string, lat: number | null, lng: number | null): Promise<LocalAd[]> {
  const slots = window.matchMedia(RAIL_MEDIA).matches ? 2 : 1;
  const key = `${sigungu}|${slots}`;
  if (last && last.key === key && Date.now() - last.at < REUSE_MS) return last.promise;
  const promise = fetch("/api/ads/local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sigungu, lat, lng, slots,
      gpsAreas: frequentGpsAreas(readGpsAreas()),
      interests: readInterests().map((p) => ({ lat: p.lat, lng: p.lng, hits: p.hits ?? 1 })),
    }),
  }).then((r) => r.json()).then((data) => (data.places || []) as LocalAd[]).catch(() => [] as LocalAd[]);
  last = { key, at: Date.now(), promise };
  return promise;
}

export function useLocalAds(enabled: boolean): { places: LocalAd[]; loaded: boolean } {
  const area = useUserArea();
  const sigungu = area.sigungu ?? "";
  const waiting = area.status === "pending";
  const { lat, lng } = area;
  const [state, setState] = useState<{ places: LocalAd[]; loaded: boolean }>({ places: [], loaded: false });

  useEffect(() => {
    // 위치를 확인하는 중에는 기다립니다 — 내 동네 광고가 있는지부터 봐야 합니다(위치를 끝내 모르면 관심 지역·무작위로).
    if (!enabled || waiting) return;
    let cancelled = false;
    fetchAds(sigungu, lat, lng).then((places) => { if (!cancelled) setState({ places, loaded: true }); });
    return () => { cancelled = true; };
    // 좌표는 조금씩 바뀌어도 다시 부르지 않습니다(시·군·구가 바뀔 때만).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, waiting, sigungu]);

  return state;
}
