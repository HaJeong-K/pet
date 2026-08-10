"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
import ShelterNoticeCard, { type ShelterNoticeLite } from "./ShelterNoticeCard";
import { useUserRegion } from "@/lib/useUserRegion";
import { supabase } from "@/lib/supabase";
import { openPlaceDetail } from "@/lib/openPlace";

// ── 좌우 사이드 레일 ──
// 왼쪽: 광고 2개 — 오른쪽 보호소 공고 카드와 동일한 크기·간격으로 대칭 배치.
// 오른쪽: 국가동물보호정보시스템(animal.go.kr) 실제 보호동물 공고 2건을 마감임박·
//         현재 위치 지역 우선순으로 보여줍니다. 클릭하면 실제 공고 상세페이지가 새 탭으로 열립니다.
// "전국 보호소 공고 전체보기"는 포인핸드(pawinhand.kr)로 바로 연결합니다.
//
// ── 반응형 기준: 가로폭이 아니라 "화면 비율" ──
// 예전엔 가로폭(예: 1600px)으로만 노출 여부를 갈랐는데, 그러면 노트북을 그냥 최대화한
// "일반적인 전체화면"(가로폭은 1600px 미만이어도 가로가 세로보다 훨씬 긴 와이드 화면)까지
// 반응형 구간으로 취급되어 콘텐츠 출력 범위가 예상치 못하게 좁아지는 문제가 있었습니다.
// 이제는 가로:세로 비율이 1:1 이상(정사각형 ~ 가로형)이면 화면이 아무리 좁아도(=분할화면,
// 태블릿 등) 레일이 얇게 나타나고, 1:1 미만(모바일처럼 세로로 긴 화면)이면 숨깁니다. 본문
// 컬럼은 항상 flex:1(최대 1200px)로 자연스럽게 폭을 나눠 갖기 때문에, 일반 노트북 풀스크린
// 처럼 넓은 화면에서는 예전과 거의 동일한 콘텐츠 출력 범위(≈1200px)가 그대로 유지됩니다.
//
// ── 세로 길이: 페이지마다 다시 재지 않고, 모든 페이지가 동일한 고정값을 씁니다 ──
// 예전엔 페이지마다 헤더 높이를 실측(topOffset)해서 썼는데, 헤더 구성이 페이지마다
// 달라(커뮤니티: 배너+탭+검색줄, 마이페이지: 헤더+히어로) 레일의 세로 길이가 페이지마다
// 제각각으로 보이는 문제가 있었습니다. 이제는 모든 페이지가 동일한 값(RAIL_TOP_OFFSET)을
// 공유해서, 어느 페이지에서 봐도 레일의 시작 위치·길이가 완전히 같습니다.
const RAIL_TOP_OFFSET_PX = 100;
const RAIL_BOTTOM_GAP_VH = 2;

// ── 가로 위치: 레일이 "여백 칼럼"의 정 가운데에 옵니다 ──
// 페이지의 grid 레이아웃(1fr 여백 / 본문(최대 1200px) / 1fr 여백)에서, 레일은 자기
// 여백 칼럼 안에서 justifySelf:"center"로 가운데 정렬됩니다 — 본문 가장자리에 붙지도,
// 화면 진짜 가장자리에 붙지도 않고 남는 여백 폭의 정중앙에 위치합니다.
const SHELTER_FULL_LIST_URL = "https://pawinhand.kr/shelter/animal";

const PHRASES = ["나의 가족이 되어주세요", "나의 가족을 찾아주세요"];

// ── 좌측(+우측 ad 모드) 레일의 실제 수익 메커니즘: 사장님이 마이페이지에서 프리미엄을
// 신청하고 관리자가 승인하면 places.is_premium=true가 되고, 이 훅이 그 장소들을 가져와
// "광고" 플레이스홀더 대신 실제로 노출합니다. 아직 프리미엄 고객이 하나도 없는 기간에는
// (신청 자체가 없으면) 기존처럼 빈 "광고" 플레이스홀더로 자연스럽게 폴백됩니다.
function usePremiumAdPlaces(enabled: boolean) {
  const [places, setPlaces] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    supabase
      .from("places")
      .select("id, name, category, image_url, is_premium, premium_expires_at")
      .eq("is_premium", true)
      .gt("premium_expires_at", new Date().toISOString())
      .then(({ data }) => {
        if (cancelled) return;
        // 여러 프리미엄 업장이 있을 때 특정 업장만 계속 상단에 노출되지 않도록 매 로드마다 섞습니다.
        const shuffled = [...(data || [])].sort(() => Math.random() - 0.5);
        setPlaces(shuffled);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  return { places, loaded };
}

function PremiumAdCard({ place }: { place: any }) {
  const router = useRouter();
  return (
    <div
      onClick={() => openPlaceDetail(router, place)}
      style={{
        flex: 1, minHeight: 0, borderRadius: "16px", overflow: "hidden", cursor: "pointer",
        position: "relative", display: "flex", flexDirection: "column",
        border: "1px solid rgba(212,162,76,0.35)",
        background: place.image_url ? `url(${place.image_url}) center/cover no-repeat` : "linear-gradient(145deg,#fff8ec,#ffe9c2)",
      }}
    >
      <div style={{
        position: "absolute", top: 6, left: 6, display: "inline-flex", alignItems: "center", gap: 3,
        padding: "2px 7px", borderRadius: 999, fontSize: 9, fontWeight: 800,
        background: "linear-gradient(135deg,#F0D28A,#D4A24C)", color: "#5C4106",
      }}>
        <Crown size={8} />AD
      </div>
      <div style={{
        marginTop: "auto", padding: "8px 8px 7px",
        background: place.image_url ? "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))" : "transparent",
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, lineHeight: 1.3,
          color: place.image_url ? "white" : "#5C4106",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {place.name}
        </div>
      </div>
    </div>
  );
}

function useShelterNotices(region: string | null, enabled: boolean, offset: number) {
  const [notices, setNotices] = useState<ShelterNoticeLite[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoaded(false);
    const params = new URLSearchParams({ limit: "2" });
    if (region) params.set("region", region);
    if (offset) params.set("offset", String(offset));
    fetch(`/api/shelter-notices?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setNotices(data.notices || []))
      .catch(() => setNotices([]))
      .finally(() => setLoaded(true));
  }, [region, enabled, offset]);

  return { notices, loaded };
}

const adPanelStyle: CSSProperties = {
  background: "rgba(0,0,0,0.02)",
  border: "1px dashed rgba(0,0,0,0.12)",
  borderRadius: "16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

// 항상 본문 컬럼과 같은 grid 행의 형제(position:static)로 자연스럽게 배치됩니다. 폭은
// <style> 미디어쿼리가 담당하고, 세로 길이·위치는 모든 페이지가 동일한 고정값을 씁니다.
const railBase: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  alignSelf: "flex-start",
  justifySelf: "center",
  flexShrink: 0,
  marginTop: `${RAIL_TOP_OFFSET_PX}px`,
  height: `calc(100vh - ${RAIL_TOP_OFFSET_PX}px - ${RAIL_BOTTOM_GAP_VH}vh)`,
};

const RAIL_STYLE_TAG = (
  <style>{`
    .ggk-side-ad-rail { display: none; }

    /* 가로:세로 비율이 1:1 이상(정사각형~가로형)이면 화면이 좁아도(분할화면·태블릿 등)
       레일을 얇게 표시합니다. 최소 폭 안전장치로 600px 미만은 표시하지 않습니다. */
    @media (min-aspect-ratio: 1/1) and (min-width: 600px) {
      .ggk-side-ad-rail {
        display: flex;
        width: clamp(72px, calc((100vw - 1200px) / 2 - 32px), 240px);
      }
    }
  `}</style>
);

/** 좌측 레일 — 프리미엄 등록 업장이 있으면 실제로 노출하고, 없으면 빈 광고 자리로 폴백. */
export function AdRailLeft() {
  const { places, loaded } = usePremiumAdPlaces(true);
  const slots = [places[0], places[1]];
  return (
    <>
      {RAIL_STYLE_TAG}
      <div className="ggk-side-ad-rail" style={railBase}>
        {slots.map((p, i) =>
          p ? (
            <PremiumAdCard key={p.id} place={p} />
          ) : (
            <div key={i} style={{ ...adPanelStyle, flex: 1, minHeight: 0 }}>
              <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>{loaded ? "광고" : ""}</span>
            </div>
          )
        )}
      </div>
    </>
  );
}

/**
 * 우측 레일.
 * rightMode="shelter"(기본): 보호소 공고 카드. 커뮤니티 페이지용.
 * rightMode="ad": 왼쪽과 동일한 광고 자리 2개(마이페이지 등 광고만 놓을 페이지용).
 * shelterOffset: rightMode="shelter"일 때만 의미 있음 — 선정 규칙(주의사항)은 페이지마다
 * 동일하게 두고, 몇 번째 순위부터 보여줄지만 달리해서 여러 페이지가 겹치지 않게 합니다.
 */
export function AdRailRight({
  rightMode = "shelter",
  shelterOffset = 0,
}: {
  rightMode?: "shelter" | "ad";
  shelterOffset?: number;
}) {
  const region = useUserRegion();
  const { notices, loaded } = useShelterNotices(region, rightMode !== "ad", shelterOffset);
  const { places: adPlaces, loaded: adLoaded } = usePremiumAdPlaces(rightMode === "ad");

  if (rightMode === "ad") {
    // 좌측 레일과 다른 업장이 보이도록 뒤에서부터 2개를 씁니다(같은 페이지에 좌우 레일이
    // 함께 있는 경우는 없지만, 프리미엄 업장이 여러 곳이면 자연스럽게 노출이 분산됩니다).
    const slots = [adPlaces[adPlaces.length - 1], adPlaces[adPlaces.length - 2]];
    return (
      <>
        {RAIL_STYLE_TAG}
        <div className="ggk-side-ad-rail" style={railBase}>
          {slots.map((p, i) =>
            p ? (
              <PremiumAdCard key={p.id} place={p} />
            ) : (
              <div key={i} style={{ ...adPanelStyle, flex: 1, minHeight: 0 }}>
                <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>{adLoaded ? "광고" : ""}</span>
              </div>
            )
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {RAIL_STYLE_TAG}
      <div className="ggk-side-ad-rail" style={railBase}>
        <div
          className="ggk-logo"
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "#D9534F",
            padding: "0 2px",
            textAlign: "center",
          }}
        >
          사지말고 입양하세요
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1, minHeight: 0 }}>
          {notices.length > 0 ? (
            notices.map((n, i) => (
              <ShelterNoticeCard key={n.desertionNo} notice={n} phrase={PHRASES[i % PHRASES.length]} />
            ))
          ) : (
            <>
              <div style={{ ...adPanelStyle, flex: 1 }}>
                <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>
                  {loaded ? "표시할 공고가 없습니다" : "공고 불러오는 중"}
                </span>
              </div>
              <div style={{ ...adPanelStyle, flex: 1 }}>
                <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>
                  {loaded ? "표시할 공고가 없습니다" : "공고 불러오는 중"}
                </span>
              </div>
            </>
          )}
        </div>
        <a
          href={SHELTER_FULL_LIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 10.5,
            color: "#8FA876",
            textAlign: "center",
            fontWeight: 600,
            textDecoration: "none",
            padding: "2px 0",
          }}
        >
          전국 보호소 공고 전체보기 →
        </a>
      </div>
    </>
  );
}
