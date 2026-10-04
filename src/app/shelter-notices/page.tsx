"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PawPrint, MapPin } from "lucide-react";
import ShelterNoticeCard, { type ShelterNoticeLite } from "@/components/ShelterNoticeCard";
import { useUserArea } from "@/lib/useUserRegion";
import { normalizeSigungu } from "@/lib/sigungu";
import ShelterAlertToggle from "@/components/ShelterAlertToggle";
import { useAdoptPhrases } from "@/lib/adoptPhrases";
import PageGuide from "@/components/PageGuide";
import { ADOPT_GUIDE_KEY, ADOPT_GUIDE_STEPS } from "@/lib/pageGuides";

// ── 전국 보호소 공고 전체보기 ──
// 예전에는 이 버튼이 animal.go.kr의 검색결과 페이지로 직접 딥링크됐는데, 그 사이트가
// 세션 없이 바로 접근하면 오류 화면을 띄워서(우리 서버는 세션 쿠키를 받아 정상 동작하지만,
// 브라우저로 직접 새 탭을 열면 세션이 없어 실패) 우리 도메인 안에 자체 전체보기 페이지를
// 만들고, 이미 세션 처리가 되어 있는 /api/shelter-notices를 그대로 재사용합니다.
// 시/도를 고르면 그 지역 공고만, 기본값은 사용자의 현재 위치 시/도, 마감임박순 정렬입니다.

const SIDO_LIST = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

// 시·도를 고르면 그 안의 시·군·구까지 고를 수 있게, 지역을 골랐을 때는 공고를 넉넉히 받아옵니다.
const REGION_FETCH_LIMIT = 300;
const NATIONWIDE_FETCH_LIMIT = 60;
// 한 화면에 보여 줄 카드 수 — 너무 길게 늘어지지 않도록 페이지를 나눕니다.
const PAGE_SIZE = 20;
/** 시·군·구 선택값 중 "내 주변"을 뜻하는 특별한 값 */
const NEAR = "__near__";

const pagerBtn = (active: boolean, disabled = false): React.CSSProperties => ({
  minWidth: 34, height: 34, padding: "0 10px", borderRadius: 10, border: active ? "none" : "1px solid #e3e0d6",
  background: active ? "#5C7A4A" : "white", color: active ? "white" : disabled ? "#ccc" : "#555",
  fontWeight: 700, fontSize: 12.5, cursor: disabled ? "default" : "pointer",
});

const chipStyle = (active: boolean, small = false): React.CSSProperties => ({
  flexShrink: 0, padding: small ? "5px 11px" : "7px 14px", borderRadius: 999,
  border: small && !active ? "1px solid #e3e0d6" : "none",
  background: active ? (small ? "#48603A" : "#5C7A4A") : "white",
  color: active ? "white" : "#555",
  fontWeight: 700, fontSize: small ? 11.5 : 12, cursor: "pointer", whiteSpace: "nowrap",
  boxShadow: active || small ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
});

export default function ShelterNoticesPage() {
  const router = useRouter();
  const userArea = useUserArea();
  const detectedRegion = userArea.sido;

  const adoptPhrase = useAdoptPhrases();
  const [sido, setSido] = useState<string>("");
  // 시·군·구 선택: ""=시·도 전체, NEAR="내 주변"(내 시·군·구 → 모자라면 가까운 지역), 그 외=시·군·구 이름
  const [sub, setSub] = useState<string>("");
  // 서버가 알려 준 "내 주변" 구성(내 지역 + 더해진 가까운 지역)
  const [near, setNear] = useState<{ ownSub: string | null; ownCount: number; subs: string[] } | null>(null);
  const [page, setPage] = useState(1);
  const pageTopRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [notices, setNotices] = useState<ShelterNoticeLite[]>([]);
  const [loading, setLoading] = useState(true);

  // 알림을 눌러 들어온 경우(?region=대구)에는 그 지역을 먼저 보여줍니다.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("region");
    if (fromUrl && SIDO_LIST.includes(fromUrl)) {
      setSido(fromUrl);
      setSub(new URLSearchParams(window.location.search).get("sub") || "");
      setInitialized(true);
    }
  }, []);

  // 위치 기반으로 감지된 지역이 오면 그걸 기본 선택값으로 한 번만 반영합니다.
  useEffect(() => {
    if (!initialized && detectedRegion) {
      setSido(detectedRegion);
      setSub(NEAR); // 내 위치의 시·도이므로 "내 주변"부터 보여줍니다
      setInitialized(true);
    }
  }, [detectedRegion, initialized]);

  useEffect(() => {
    // ⚠ 지역을 바꾸면 이전 요청의 응답은 버립니다. 예전엔 화면이 열릴 때 "전국" 요청과 감지된 지역 요청이
    // 연달아 나가서, 늦게 도착한 전국 응답이 지역 결과를 덮어써 "대구"를 골랐는데 전국 공고가 보였습니다.
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ full: "1", limit: String(sido ? REGION_FETCH_LIMIT : NATIONWIDE_FETCH_LIMIT) });
    if (sido) params.set("region", sido);
    // 내가 있는 시·도를 볼 때만 위치를 함께 보내 "내 주변" 구성을 받습니다(다른 시·도를 구경할 땐 의미가 없음).
    if (sido && sido === userArea.sido) {
      if (userArea.sigungu) params.set("sub", userArea.sigungu);
      if (userArea.lat != null && userArea.lng != null) { params.set("lat", userArea.lat.toFixed(2)); params.set("lng", userArea.lng.toFixed(2)); }
    }
    fetch(`/api/shelter-notices?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) { setNotices(data.notices || []); setNear(data.near ?? null); } })
      .catch(() => { if (!cancelled) { setNotices([]); setNear(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sido, userArea.sido, userArea.sigungu]);

  // 선택한 시·도에 실제로 공고가 있는 시·군·구 목록(공고 많은 순)
  const subRegions = useMemo(() => {
    if (!sido) return [];
    const counts = new Map<string, number>();
    notices.forEach((n) => { if (n.subRegion) counts.set(n.subRegion, (counts.get(n.subRegion) ?? 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  }, [notices, sido]);
  // 고른 시·군·구가 새로 받은 목록에 없으면(지역을 바꿨거나 공고가 마감됨) 전체로 보여줍니다.
  const nearAvailable = !!near && near.subs.length > 0;
  const activeSub = sub === NEAR ? (nearAvailable ? NEAR : "") : sub && subRegions.some(([name]) => name === sub) ? sub : "";
  // "내 주변": 내 지역 공고 먼저, 그다음 가까운 지역 순서(각 지역 안에서는 마감임박순 그대로)
  const nearNotices = useMemo(() => {
    if (!near) return [];
    return near.subs.flatMap((name) => notices.filter((n) => normalizeSigungu(n.subRegion) === name));
  }, [near, notices]);
  const visibleNotices = activeSub === NEAR ? nearNotices : activeSub ? notices.filter((n) => n.subRegion === activeSub) : notices;
  // "내 주변"에 가까운 지역이 더해졌는지 안내하는 문구
  const nearNote = (() => {
    if (activeSub !== NEAR || !near) return null;
    const own = near.ownSub, others = near.subs.filter((name) => name !== own);
    if (!own || near.ownCount === 0) return others.length > 0 ? `${own ? own + " 지역에는" : "내 지역에는"} 진행 중인 공고가 없어, 가까운 ${others.join("·")} 공고를 보여드려요.` : null;
    if (others.length > 0) return `${own} 공고가 ${near.ownCount}건뿐이라, 가까운 ${others.join("·")} 공고도 함께 보여드려요.`;
    return `내 위치 기준 ${own} 지역 공고예요.`;
  })();
  const selectSido = (next: string) => { setSido(next); setSub(""); setPage(1); };
  const selectSub = (next: string) => { setSub(next); setPage(1); };

  const totalPages = Math.max(1, Math.ceil(visibleNotices.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageNotices = visibleNotices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const goPage = (next: number) => {
    setPage(Math.max(1, Math.min(totalPages, next)));
    pageTopRef.current?.scrollIntoView({ block: "start" }); // 다음 페이지 첫 카드부터 보이게
  };
  // 페이지 번호는 현재 페이지 주변 5개까지만 보여줍니다.
  const pageNumbers = (() => {
    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  })();

  return (
    <div
      className="ggk-body"
      style={{
        // 사이트 전체의 body가 overflow:hidden(지도 화면용)이라, 페이지 자체를 스크롤 영역으로 둡니다.
        display: "flex", flexDirection: "column", height: "100dvh", overflowY: "auto",
        background: "#F7F3E8", alignItems: "center",
      }}
    >
      {/* 공고가 다 뜬 뒤에 안내를 시작합니다(카드를 짚는 단계가 있어서) */}
      <PageGuide storageKey={ADOPT_GUIDE_KEY} steps={ADOPT_GUIDE_STEPS} enabled={!loading} />
      <div style={{ width: "100%", maxWidth: "1200px", display: "flex", flexDirection: "column" }}>
        {/* ── 상단바 ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "16px 20px",
          background: "white", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 5,
        }}>
          <button
            onClick={() => router.back()}
            style={{
              border: "none", background: "#f5f6f8", borderRadius: "50%",
              width: 34, height: 34, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <ArrowLeft size={17} color="#555" />
          </button>
          <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: "#D9534F", flex: 1 }}>
            사지말고 입양하세요
          </div>
        </div>

        {/* ── 안내 + 지역 필터 ── */}
        <div style={{ padding: "18px 20px 4px" }}>
          <p style={{ fontSize: 12.5, color: "#666", lineHeight: 1.6, marginBottom: 14 }}>
            국가동물보호정보시스템(animal.go.kr) 공고를 마감이 임박한 순서로 보여드려요.
            시·도를 고르면 그 아래에서 시·군·구까지 골라 볼 수 있고, 선택하지 않으면 전국 공고를 볼 수 있어요.
          </p>
          <div data-guide="adopt-alert"><ShelterAlertToggle region={sido} /></div>
          <div data-guide="adopt-regions" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            <button
              onClick={() => selectSido("")}
              style={chipStyle(sido === "")}
            >
              전국
            </button>
            {SIDO_LIST.map((s) => (
              <button
                key={s}
                onClick={() => selectSido(s)}
                style={chipStyle(sido === s)}
              >
                {s}
              </button>
            ))}
          </div>
          {/* ── 시·군·구 선택(시·도를 골랐을 때만) ── */}
          {sido && !loading && (subRegions.length > 1 || nearAvailable) && (
            <div style={{ display: "flex", gap: 5, overflowX: "auto", padding: "8px 0 4px", alignItems: "center" }}>
              <span style={{ flexShrink: 0, fontSize: 11, color: "#999", fontWeight: 700, marginRight: 2 }}>{sido}</span>
              {nearAvailable && (
                <button onClick={() => selectSub(NEAR)} style={chipStyle(activeSub === NEAR, true)}>
                  <MapPin size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 2 }} />내 주변 {nearNotices.length}
                </button>
              )}
              <button onClick={() => selectSub("")} style={chipStyle(activeSub === "", true)}>전체 {notices.length}</button>
              {subRegions.map(([name, count]) => (
                <button key={name} onClick={() => selectSub(name)} style={chipStyle(activeSub === name, true)}>
                  {name} {count}
                </button>
              ))}
            </div>
          )}
        </div>

        {nearNote && !loading && (
          <div style={{ margin: "8px 20px 0", padding: "9px 12px", borderRadius: 10, background: "#EEF3E8", color: "#48603A", fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
            <MapPin size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />{nearNote}
          </div>
        )}

        {/* ── 공고 카드 그리드 ── */}
        <div ref={pageTopRef} style={{ padding: "16px 20px 110px", scrollMarginTop: 70 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#999", fontSize: 13 }}>
              공고를 불러오는 중...
            </div>
          ) : notices.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "80px 0", background: "white",
              borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)",
            }}>
              <PawPrint size={32} color="#ccc" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 13, color: "#999" }}>
                {sido ? `${sido} 지역에 진행 중인 공고가 없습니다.` : "현재 진행 중인 공고가 없습니다."}
              </div>
            </div>
          ) : (<>
            <div data-guide="adopt-list" style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 14,
            }}>
              {pageNotices.map((n, i) => (
                // ⚠ 카드는 flex:1로 부모 높이를 채우게 만들어져 있어(사이드 레일용), 부모가 flex 칸이어야 합니다.
                // 예전엔 일반 블록이라 카드가 제목 줄 높이로 찌그러져 사진이 보이지 않았습니다.
                <div key={n.desertionNo} style={{ height: 230, display: "flex", flexDirection: "column" }}>
                  <ShelterNoticeCard notice={n} phrase={adoptPhrase((currentPage - 1) * PAGE_SIZE + i)} />
                </div>
              ))}
            </div>
            {/* ── 페이지 이동 ── */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 22, flexWrap: "wrap" }}>
                <button onClick={() => goPage(currentPage - 1)} disabled={currentPage === 1} style={pagerBtn(false, currentPage === 1)}>이전</button>
                {pageNumbers.map((n) => (
                  <button key={n} onClick={() => goPage(n)} aria-current={n === currentPage ? "page" : undefined} style={pagerBtn(n === currentPage)}>{n}</button>
                ))}
                <button onClick={() => goPage(currentPage + 1)} disabled={currentPage === totalPages} style={pagerBtn(false, currentPage === totalPages)}>다음</button>
                <span style={{ fontSize: 11.5, color: "#999", marginLeft: 4 }}>{currentPage} / {totalPages}쪽 · 총 {visibleNotices.length}건</span>
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
