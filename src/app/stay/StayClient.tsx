"use client";

// 숙소 탭 화면(/stay) — 숙박 예약 앱처럼 반려동물 동반 숙소를 찾고, 펫츠로드에서 바로 예약할 수 있는 곳을 먼저 보여 줍니다.
//   · 위: 검색(숙소 이름·지역) + 지역 고르기(내 주변·강원·제주…) → 세부 지역(강릉시·속초시… 숙소 수 많은 순) + 조건(바로 예약·대형견·펜션·호텔…)
//     검색·지역·조건 줄은 화면을 내려도 위에 붙어 있습니다.
//   · "펫츠로드에서 바로 예약": 사장님이 객실을 올린 숙소 — 최저가·동반 조건 요약
//   · 아래: 전체 숙소(가까운 순). 바로 예약 숙소는 숙소 화면(/stay/번호 — 객실·동반 조건·숙박 후기·예약),
//     그 밖의 숙소는 장소 상세로 갑니다.
//   · 바깥 틀은 StayFrame — 다른 화면처럼 본문 최대 1000px + 넓은 화면의 좌우 광고·보호소 공고 칸.
// 데이터는 /api/lodging/list(공공데이터 숙소 + 직접 등록된 숙소), 정렬·검색·필터는 여기서 합니다.

import PageHero, { HeroSearch } from "@/components/PageHero";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, CalendarCheck, MapPin, Search } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import PageGuide from "@/components/PageGuide";
import { STAY_GUIDE_KEY, STAY_GUIDE_STEPS } from "@/lib/pageGuides";
import StayFrame from "@/components/lodging/StayFrame";
import { useUserArea } from "@/lib/useUserRegion";
import { matchesTalk } from "@/lib/talkSearch";
import { haversineKm } from "@/lib/geo";
import { normalizeSidoName } from "@/lib/shelterNotices";
import { REGION_BOARDS } from "@/lib/communityBoards";
import type { PetSize } from "@/lib/lodgingRules";

type Stay = {
  id: number; name: string; category: string | null; address: string | null; lat: number; lng: number; image: string | null; phone: string | null;
  largeDog: boolean | null; bookable: boolean; minPrice: number | null; roomCount: number; petSummary: string | null; petSizes: PetSize[]; tags?: string[];
};

// 지역 분류와 순서는 커뮤니티 지역 게시판과 같습니다(src/lib/communityBoards.ts)
const NEARBY = "내 주변";
const ALL_REGIONS = "전체 지역";
const REGION_LABELS = [NEARBY, ALL_REGIONS, ...REGION_BOARDS.map((b) => b.label)];
const regionOrder = (sido: string) => { const i = REGION_BOARDS.findIndex((b) => b.label === sido); return i < 0 ? REGION_BOARDS.length : i; };
type Filter = "bookable" | "large" | "pension" | "hotel" | "camping" | "hanok";
const FILTERS: { id: Filter; label: string; test: (s: Stay) => boolean }[] = [
  { id: "bookable", label: "바로 예약", test: (s) => s.bookable },
  { id: "large", label: "대형견 가능", test: (s) => s.largeDog === true || s.petSizes.includes("large") },
  { id: "pension", label: "펜션·풀빌라", test: (s) => /펜션|풀빌라|독채/.test(s.category ?? "") },
  { id: "hotel", label: "호텔·리조트", test: (s) => /호텔|리조트|콘도/.test(s.category ?? "") },
  { id: "camping", label: "캠핑·글램핑", test: (s) => /캠핑|글램핑|카라반/.test(s.category ?? "") },
  { id: "hanok", label: "한옥·스테이", test: (s) => /한옥|스테이|게스트|민박/.test(`${s.category ?? ""} ${s.name}`) },
];
const PAGE = 30;
const regionOf = (address: string | null) => (address ?? "").split(" ").slice(0, 2).join(" ");
/** 세부 지역 열쇠 — 시·도는 짧은 이름으로 맞춥니다("강원도"·"강원특별자치도" → "강원")("강원 강릉시") */
const subKeyOf = (address: string | null) => { const t = (address ?? "").trim().split(/\s+/); return t.length >= 2 ? `${normalizeSidoName(t[0])} ${t[1]}` : null; };
/** 시·도 이름("강원특별자치도" → "강원") — 전체 지역에서 시·도별로 나눌 때 */
const sidoOf = (address: string | null) => { const t = (address ?? "").trim().split(/\s+/)[0]; return t ? normalizeSidoName(t) : null; };
const INK = "#2A1C14", SUB = "#6B5E55", DARK = "#3B2A20", LINE = "#EDECEB", WASH = "#FAF9F8";
const PICKS = 8; // 바로 예약 칸에 먼저 보여 줄 숙소 수
const rowTag: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7, background: WASH, color: "#444" };
const moreButton: React.CSSProperties = { width: "100%", marginTop: 20, padding: "15px 0", borderRadius: 14, border: `1px solid ${DARK}`, background: "white", color: DARK, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const realImage = (src: string | null) => (src && !src.includes("default-place") ? src : null);

// 사진 칸은 바깥 틀의 크기를 그대로 채웁니다(카드마다 높이가 달라지지 않게)
function StayImage({ stay }: { stay: Stay }) {
  // 사진 주소가 깨져 있으면(공공데이터에 흔함) 기본 그림으로 바꿉니다
  const [broken, setBroken] = useState(false);
  const src = broken ? null : realImage(stay.image);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
  ) : (
    <span aria-hidden style={{ width: "100%", height: "100%", background: WASH, display: "flex", alignItems: "center", justifyContent: "center", color: "#A05A32" }}>
      <BedDouble size={26} />
    </span>
  );
}

export default function StayClient() {
  const router = useRouter();
  const area = useUserArea();
  const [stays, setStays] = useState<Stay[] | null>(null);
  const [query, setQuery] = useState("");
  const [showAllPicks, setShowAllPicks] = useState(false);
  const [region, setRegion] = useState(NEARBY);
  // 세부 지역(시·군·구) — 권역을 고르면 그 안의 시·군·구를 숙소가 많은 순으로 보여 줍니다
  const [subRegion, setSubRegion] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lodging/list").then((r) => r.json()).then((d) => { if (!cancelled) setStays(d.items ?? []); }).catch(() => { if (!cancelled) setStays([]); });
    return () => { cancelled = true; };
  }, []);

  const here = area.lat != null && area.lng != null ? { lat: area.lat, lng: area.lng } : null;
  const hereLat = here?.lat, hereLng = here?.lng;
  const list = useMemo(() => {
    if (!stays) return [];
    const inRegion = region !== NEARBY && region !== ALL_REGIONS;
    return stays
      .filter((s) => matchesTalk(query, [s.name, s.address, s.category, ...(s.tags ?? [])]))
      .filter((s) => !inRegion || sidoOf(s.address) === region)
      .filter((s) => !subRegion || (region === ALL_REGIONS ? sidoOf(s.address) : subKeyOf(s.address)) === subRegion)
      .filter((s) => filters.every((f) => FILTERS.find((x) => x.id === f)!.test(s)))
      .map((s) => ({ ...s, distance: hereLat != null && hereLng != null ? haversineKm(hereLat, hereLng, s.lat, s.lng) : null }))
      .sort((a, b) => Number(b.bookable) - Number(a.bookable) || (a.distance ?? 0) - (b.distance ?? 0) || a.name.localeCompare(b.name));
  }, [stays, query, region, subRegion, filters, hereLat, hereLng]);
  // 고른 지역 안의 세부 지역(숙소 수 많은 순)
  const subRegions = useMemo(() => {
    if (!stays) return [];
    const counts = new Map<string, number>();
    // 전체 지역: 시·도별(게시판 순서)
    if (region === ALL_REGIONS) {
      for (const st of stays) { const key = sidoOf(st.address); if (key) counts.set(key, (counts.get(key) ?? 0) + 1); }
      return [...counts.entries()].sort((a, b) => regionOrder(a[0]) - regionOrder(b[0]) || a[0].localeCompare(b[0], "ko")).map(([key, count]) => ({ key, count, label: key }));
    }
    if (region === NEARBY) return [];
    for (const st of stays) {
      if (sidoOf(st.address) !== region) continue;
      const key = subKeyOf(st.address);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
      .map(([key, count]) => ({ key, count, label: key.split(" ")[1] }));
  }, [stays, region]);
  const bookable = list.filter((s) => s.bookable);
  const toggle = (f: Filter) => { setFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])); setLimit(PAGE); };
  const open = (s: Stay) => router.push(s.bookable ? `/stay/${s.id}` : `/place/${s.id}`);
  const km = (d: number | null) => (d == null ? null : d < 1 ? `${Math.round(d * 1000)}m` : `${d < 10 ? d.toFixed(1) : Math.round(d)}km`);


  return (
    <StayFrame wide>
      <PageGuide storageKey={STAY_GUIDE_KEY} steps={STAY_GUIDE_STEPS} enabled={stays !== null} />
      {/* 넓은 화면은 바로 예약 숙소를 네 칸으로, 좁아질수록 칸을 줄입니다. 카드 높이는 칸마다 같습니다 */}
      <style>{`
        .stay-picks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .stay-thumb { width: 104px; }
        .stay-row-price { display: none; }
        .stay-row-price-inline { display: block; }
        @media (min-width: 640px) { .stay-picks { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; } .stay-thumb { width: 150px; } }
        @media (min-width: 900px) { .stay-picks { grid-template-columns: repeat(4, minmax(0, 1fr)); } .stay-row-price { display: block; } .stay-row-price-inline { display: none; } }
      `}</style>

      {/* 머리말 + 검색 — 탭 화면 공통 머리말(src/components/PageHero.tsx) */}
      <PageHero eyebrow="반려동물 동반 숙소" title="우리 아이도 환영하는 숙소" desc="동반 조건을 한눈에 비교하고, 펫츠로드에서 바로 예약해요.">
        <HeroSearch>
          <Search size={19} color={SUB} />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="말하듯이 찾기 — 예: 대구 독채, 강릉 한옥" aria-label="숙소 검색" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 15.5, fontFamily: "inherit", color: INK, background: "transparent" }} />
          {query && <button onClick={() => { setQuery(""); setLimit(PAGE); }} aria-label="검색어 지우기" style={{ border: "none", background: WASH, borderRadius: 999, width: 24, height: 24, cursor: "pointer", color: "#555", fontSize: 14, lineHeight: "24px", padding: 0 }}>×</button>}
        </HeroSearch>
      </PageHero>

      {/* 지역 · 세부 지역 · 조건 — 화면을 내려도 위에 붙어 있음 */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "white", borderBottom: `1px solid ${LINE}` }}>
        <div data-guide="stay-regions" style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "0 clamp(10px, 3vw, 24px)" }}>
          {REGION_LABELS.map((label) => {
            const on = region === label;
            return (
              <button key={label} onClick={() => { setRegion(label); setSubRegion(null); setLimit(PAGE); }} aria-pressed={on} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, padding: "14px 11px", border: "none", borderBottom: `3px solid ${on ? DARK : "transparent"}`, background: "transparent", color: on ? INK : SUB, fontSize: 15, fontWeight: on ? 800 : 600, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>
                {label === NEARBY && <MapPin size={14} />}{label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "10px clamp(18px, 4vw, 32px)", borderTop: `1px solid ${LINE}` }}>
          {FILTERS.map((f) => {
            const on = filters.includes(f.id);
            return (
              <button key={f.id} onClick={() => toggle(f.id)} aria-pressed={on} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: 999, border: `1px solid ${on ? DARK : "#DDDCDB"}`, background: on ? DARK : "white", color: on ? "white" : "#444", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                {f.id === "bookable" && <CalendarCheck size={14} />}{f.label}
              </button>
            );
          })}
        </div>
        {subRegions.length > 1 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "0 clamp(18px, 4vw, 32px) 10px" }}>
            {[{ key: null as string | null, label: region === ALL_REGIONS ? "전국" : `${region} 전체`, count: subRegions.reduce((n, x) => n + x.count, 0) }, ...subRegions].map((x) => {
              const on = subRegion === x.key;
              return (
                <button key={x.key ?? "all"} onClick={() => { setSubRegion(x.key); setLimit(PAGE); }} aria-pressed={on} style={{ flexShrink: 0, padding: "6px 11px", borderRadius: 10, border: `1px solid ${on ? DARK : LINE}`, background: on ? "#FBEDE3" : "white", color: on ? INK : "#555", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                  {x.label} <span style={{ fontWeight: 600, color: SUB }}>{x.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ padding: "0 clamp(18px, 4vw, 32px)" }}>
        {stays === null ? (
          <div style={{ padding: 60, textAlign: "center" }}><LogoLoader /></div>
        ) : (
          <>
            {/* 펫츠로드에서 바로 예약 — 가로로 밀지 않고 한눈에 보이게 칸으로 놓습니다 */}
            {bookable.length > 0 && (
              <section style={{ marginTop: 30 }}>
                <h2 className="ggk-logo" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK }}>펫츠로드에서 바로 예약</h2>
                <div style={{ fontSize: 14, color: SUB, marginTop: 4 }}>날짜를 고르고 반려동물 정보만 적으면 예약 끝.</div>
                <div className="stay-picks" style={{ marginTop: 18 }}>
                  {(showAllPicks ? bookable : bookable.slice(0, PICKS)).map((s) => (
                    <button key={s.id} data-guide="stay-card" onClick={() => open(s)} style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-start", padding: 0, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden", background: "white", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: INK }}>
                      <span style={{ display: "block", width: "100%", aspectRatio: "16 / 10" }}><StayImage stay={s} /></span>
                      <span style={{ flex: 1, width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", padding: "12px 13px 13px" }}>
                      <span style={{ display: "block", fontSize: 13, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{[s.category, regionOf(s.address)].filter(Boolean).join(" · ")}</span>
                      <span className="ggk-logo" style={{ marginTop: 3, fontSize: 16.5, fontWeight: 800, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.name}</span>
                      {s.petSummary && <span style={{ marginTop: 5, marginBottom: 8, fontSize: 13, color: "#444", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.petSummary}</span>}
                      {s.minPrice != null && <span style={{ marginTop: "auto", fontSize: 17, fontWeight: 800 }}>{s.minPrice.toLocaleString("ko-KR")}원<span style={{ fontSize: 13, fontWeight: 600, color: SUB }}> /1박~</span></span>}
                      </span>
                    </button>
                  ))}
                </div>
                {bookable.length > PICKS && (
                  <button onClick={() => setShowAllPicks((v) => !v)} style={moreButton}>{showAllPicks ? "접기" : `바로 예약 숙소 더 보기 (${bookable.length - PICKS}곳)`}</button>
                )}
              </section>
            )}

            {/* 전체 숙소 */}
            <section style={{ marginTop: 40, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, paddingBottom: 6 }}>
                <h2 className="ggk-logo" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK }}>{region === NEARBY ? (here ? "가까운 숙소" : "전국 숙소") : region === ALL_REGIONS && !subRegion ? "전국 숙소" : `${subRegion ? subRegions.find((x) => x.key === subRegion)?.label ?? region : region} 숙소`}</h2>
                <span style={{ fontSize: 14, color: SUB }}>{list.length.toLocaleString("ko-KR")}곳</span>
              </div>
              {list.length === 0 && (
                <div style={{ padding: "48px 16px", textAlign: "center", color: SUB, fontSize: 15, lineHeight: 1.7 }}>
                  조건에 맞는 숙소가 없어요.<br />지역이나 조건을 바꿔 보세요.
                </div>
              )}
              {list.slice(0, limit).map((s) => {
                const price = s.bookable && s.minPrice != null
                  ? <span style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap" }}>{s.minPrice.toLocaleString("ko-KR")}원<span style={{ fontSize: 13, fontWeight: 600, color: SUB }}> /1박~</span></span>
                  : <span style={{ fontSize: 13.5, color: SUB }}>전화로 예약</span>;
                return (
                  <button key={s.id} data-guide="stay-card" onClick={() => open(s)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 16, marginTop: 10, padding: 12, border: `1px solid ${LINE}`, borderRadius: 14, background: "white", color: INK, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                    <span className="stay-thumb" style={{ display: "block", flexShrink: 0, aspectRatio: "4 / 3", borderRadius: 10, overflow: "hidden" }}><StayImage stay={s} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="ggk-logo" style={{ display: "block", fontSize: 17, fontWeight: 800, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                      <span style={{ display: "block", marginTop: 4, fontSize: 14, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[km(s.distance), regionOf(s.address)].filter(Boolean).join(" · ")}</span>
                      <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                        {s.bookable && <span style={{ ...rowTag, background: DARK, color: "white" }}>바로 예약</span>}
                        {s.category && <span style={rowTag}>{s.category}</span>}
                        {(s.largeDog || s.petSizes.includes("large")) && <span style={{ ...rowTag, background: "#FBEDE3", color: "#85482A" }}>대형견 가능</span>}
                      </span>
                      <span className="stay-row-price-inline" style={{ marginTop: 7 }}>{price}</span>
                    </span>
                    <span className="stay-row-price" style={{ flexShrink: 0, paddingRight: 8 }}>{price}</span>
                  </button>
                );
              })}
              {list.length > limit && (
                <button onClick={() => setLimit((n) => n + PAGE)} style={moreButton}>숙소 더 보기 ({(list.length - limit).toLocaleString("ko-KR")}곳 남음)</button>
              )}
              <div style={{ margin: "32px 4px 40px", fontSize: 13, color: SUB, lineHeight: 1.7, textAlign: "center" }}>
                숙소 정보는 한국관광공사·한국문화정보원 공공데이터와 숙소 사장님이 올린 내용이에요.<br />
                반려동물 동반 조건은 바뀔 수 있으니 예약 전에 확인해 주세요.
              </div>
            </section>
          </>
        )}
      </div>
    </StayFrame>
  );
}
