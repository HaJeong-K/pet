"use client";

import { useEffect, useState, type CSSProperties } from "react";
import ShelterNoticeCard, { type ShelterNoticeLite } from "./ShelterNoticeCard";
import { useUserRegion } from "@/lib/useUserRegion";

// ── 고정 사이드 레일 ──
// 왼쪽: 광고 2개 — 오른쪽 보호소 공고 카드와 동일한 크기·간격으로 대칭 배치.
// 오른쪽: 국가동물보호정보시스템(animal.go.kr) 실제 보호동물 공고 2건을 마감임박·
//         현재 위치 지역 우선순으로 보여줍니다. 클릭하면 실제 공고 상세페이지가 새 탭으로 열립니다.
// 콘텐츠 컬럼(최대 1200px)과 겹치지 않도록 화면이 충분히 넓을 때만 노출됩니다.
// "전국 보호소 공고 전체보기"는 포인핸드(pawinhand.kr)로 바로 연결합니다 — 우리 쪽에서
// 데이터를 긁어오는 게 아니라 단순 외부 링크라 안전하고, 사용자가 훨씬 많은 공고를
// 한번에 볼 수 있습니다. (우측 미리보기 2건은 계속 animal.go.kr 공공데이터를 씁니다.)
const SHELTER_FULL_LIST_URL = "https://pawinhand.kr/shelter/animal";

const PHRASES = ["나의 가족이 되어주세요", "나의 가족을 찾아주세요"];

function useShelterNotices(region: string | null, enabled: boolean) {
  const [notices, setNotices] = useState<ShelterNoticeLite[]>([]);
  // 최초 요청이 아직 안 끝났으면 "불러오는 중", 끝났는데 결과가 0건이면 그 사실을
  // 구분해서 보여줍니다 — 예전엔 실패해도 항상 "불러오는 중"만 계속 떠 있었습니다.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return; // rightMode="ad"인 페이지(마이페이지)에서는 불필요한 요청을 안 보냅니다.
    setLoaded(false);
    const params = new URLSearchParams({ limit: "2" });
    if (region) params.set("region", region);
    fetch(`/api/shelter-notices?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setNotices(data.notices || []))
      .catch(() => setNotices([]))
      .finally(() => setLoaded(true));
  }, [region, enabled]);

  return { notices, loaded };
}

// rightMode="shelter"(기본): 오른쪽에 보호소 공고 카드. 커뮤니티 페이지용.
// rightMode="ad": 오른쪽도 왼쪽과 동일한 광고 자리 2개. 마이페이지처럼 광고만 놓을
// 페이지에서, 폭·높이·위치를 커뮤니티와 완전히 동일하게 맞추기 위해 이 컴포넌트를 그대로 재사용합니다.
export default function SideAdRail({ rightMode = "shelter" }: { rightMode?: "shelter" | "ad" }) {
  const region = useUserRegion();
  const { notices, loaded } = useShelterNotices(region, rightMode !== "ad");

  const adPanelStyle: CSSProperties = {
    background: "rgba(0,0,0,0.02)",
    border: "1px dashed rgba(0,0,0,0.12)",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const railBase: CSSProperties = {
    position: "fixed",
    top: "5vh",
    height: "90vh",
    width: "var(--ggk-rail-w, 160px)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    zIndex: 10,
  };

  return (
    <>
      <style>{`
        .ggk-side-ad-rail { display: none; }
        @media (min-width: 1600px) {
          .ggk-side-ad-rail {
            display: flex;
            --ggk-rail-w: clamp(160px, calc((100vw - 1200px) / 2 - 48px), 260px);
          }
        }
      `}</style>

      {/* 좌측: 광고 2개 — 우측 보호소 카드와 동일한 크기로 대칭 배치 */}
      <div className="ggk-side-ad-rail" style={{ ...railBase, left: "24px" }}>
        <div style={{ ...adPanelStyle, flex: 1, minHeight: 0 }}>
          <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>광고</span>
        </div>
        <div style={{ ...adPanelStyle, flex: 1, minHeight: 0 }}>
          <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>광고</span>
        </div>
      </div>

      {/* 우측: 광고 전용 페이지(마이페이지 등)에서는 왼쪽과 동일한 광고 자리 2개,
          그 외(커뮤니티)에서는 보호소 유기동물 공고 2건 */}
      {rightMode === "ad" ? (
        <div className="ggk-side-ad-rail" style={{ ...railBase, right: "24px" }}>
          <div style={{ ...adPanelStyle, flex: 1, minHeight: 0 }}>
            <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>광고</span>
          </div>
          <div style={{ ...adPanelStyle, flex: 1, minHeight: 0 }}>
            <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>광고</span>
          </div>
        </div>
      ) : (
        <div className="ggk-side-ad-rail" style={{ ...railBase, right: "24px" }}>
          <div
            className="ggk-logo"
            style={{
              fontSize: 17,
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
      )}
    </>
  );
}
