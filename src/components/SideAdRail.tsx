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
// 컬럼은 항상 min(1000px, 100%)로 고정 폭을 갖기 때문에, 레일 폭(최소 190px)이 넓어져도
// 본문이 함께 줄어들며 전체 구성이 화면 안에 자연스럽게 들어맞습니다.
//
// ── 세로 길이: 페이지마다 다시 재지 않고, 모든 페이지가 동일한 고정값을 씁니다 ──
// 예전엔 페이지마다 헤더 높이를 실측(topOffset)해서 썼는데, 헤더 구성이 페이지마다
// 달라(커뮤니티: 배너+탭+검색줄, 마이페이지: 헤더+히어로) 레일의 세로 길이가 페이지마다
// 제각각으로 보이는 문제가 있었습니다. 이제는 모든 페이지가 동일한 값(RAIL_TOP_OFFSET)을
// 공유해서, 어느 페이지에서 봐도 레일의 시작 위치·길이가 완전히 같습니다.
// ⚠ 예전엔 100px/2vh로 여백을 크게 잡아서, 카드 2개가 화면 세로 영역의 아래쪽에 뭉쳐
// 있는 것처럼 보였습니다(카드 자체는 항상 반반이지만, 그 반반을 나누는 전체 구간이
// 화면 위쪽 100px를 비워두고 시작). 여백을 최소로 줄여 레일이 화면 맨 위부터 맨
// 아래까지 거의 꽉 차게 폈습니다.
const RAIL_TOP_OFFSET_PX = 16;
const RAIL_BOTTOM_GAP_VH = 1;

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
    // ⚠ 실제로 겪은 버그: 페이지가 막 열리면 위치 감지(useUserRegion)가 아직 끝나기 전이라
    // region이 처음엔 null입니다 — 그 순간 이 effect가 먼저 "전국(region 없음)" 요청을
    // 한 번 보냅니다. 잠시 후 위치 감지가 끝나 region이 실제 값("경북" 등)으로 바뀌면
    // 이 effect가 다시 실행되어 "그 지역" 요청을 새로 보내는데, 문제는 두 요청이
    // 순서대로 응답한다는 보장이 없다는 것입니다 — 전국 요청은 서버 캐시가 이미 데워져
    // 있어 빨리 끝나는 경우가 많고, 특정 지역 요청은 캐시가 비어 있으면 외부 사이트를
    // 직접 조회하느라 더 오래 걸립니다. 그래서 "전국" 응답이 "지역" 응답보다 늦게
    // 도착하면, 이미 맞게 뜬 지역 공고를 오래된 전국 공고가 덮어써버렸습니다.
    // 새로고침하면 위치가 이미 캐시돼 있어 처음부터 "지역" 요청 하나만 나가서 이
    // 경쟁 자체가 없었던 것이라 우연히 정상으로 보였던 것입니다.
    // 요청마다 순번을 매겨서, 가장 나중에 "보낸" 요청의 응답만 반영하도록 고칩니다.
    let ignore = false;
    setLoaded(false);
    const params = new URLSearchParams({ limit: "2" });
    if (region) params.set("region", region);
    if (offset) params.set("offset", String(offset));
    fetch(`/api/shelter-notices?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => { if (!ignore) setNotices(data.notices || []); })
      .catch(() => { if (!ignore) setNotices([]); })
      .finally(() => { if (!ignore) setLoaded(true); });
    return () => { ignore = true; };
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

// 항상 본문 컬럼과 같은 grid 행의 형제(position:static)로 자연스럽게 배치됩니다. 폭·표시
// 여부는 <style> 미디어쿼리(.ggk-side-ad-rail)가 담당하고, 세로 길이·위치는 모든 페이지가
// 동일한 고정값을 씁니다. ⚠ display는 여기 인라인 스타일에 넣지 않습니다 — 인라인 스타일은
// 항상 스타일시트 규칙(미디어쿼리의 display:none 포함)보다 우선 적용되기 때문에, 여기에
// display:flex를 넣으면 좁은 화면에서 미디어쿼리가 매치되지 않아도 레일이 숨겨지지 않고
// 아주 얇은 조각으로 계속 남아 화면을 어지럽히는 문제가 있었습니다.
const railBase: CSSProperties = {
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
       레일을 얇게 표시합니다. 최소 폭은 190px로 고정("나의 가족이 되어주세요" 같은
       보호소 공고 문구가 항상 한 줄로 출력되도록, 이전엔 72px까지 좁아져 줄바꿈이 생겼음).
       ⚠ min-width가 600px일 때는 본문(min(1000px,100%)) + 레일 2개(각 190px 이상) +
       칼럼 간격(16px×2)을 더하면 필요한 총 폭이 1412px인데 화면은 600~1412px 사이일 수
       있어서, 레일이 190px를 억지로 채우려다 화면 밖으로 넘쳐 잘려 보이는 문제가 있었습니다.
       그래서 min-width를 "본문 1000px + 레일 최소폭 190px×2 + 간격 16px×2"가 실제로
       다 들어가는 지점(1444px)보다 여유 있게 잡아, 레일이 뜰 때는 항상 화면 안에
       완전히 들어가고(clamp가 최솟값 190px에 걸리지 않고 계산값을 그대로 씀), 그보다
       좁은 화면에서는 아예 숨겨서(레일 없이 본문만) 잘림이 생기지 않게 합니다. */
    @media (min-aspect-ratio: 1/1) and (min-width: 1460px) {
      .ggk-side-ad-rail {
        display: flex;
        width: clamp(190px, calc((100vw - 1000px) / 2 - 32px), 240px);
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
