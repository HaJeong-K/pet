"use client";

// 숙소 탭 화면(/stay) — 숙박 예약 앱처럼 반려동물 동반 숙소를 찾고, 같이가개에서 바로 예약할 수 있는 곳을 먼저 보여 줍니다.
//   · 위: 검색(숙소 이름·지역) + 지역 고르기(내 주변·강원·제주…) → 세부 지역(강릉시·속초시… 숙소 수 많은 순) + 조건(바로 예약·대형견·펜션·호텔…)
//     검색·지역·조건 줄은 화면을 내려도 위에 붙어 있습니다.
//   · "같이가개에서 바로 예약": 사장님이 객실을 올린 숙소 — 최저가·동반 조건 요약
//   · 아래: 전체 숙소(가까운 순). 바로 예약 숙소는 숙소 화면(/stay/번호 — 객실·동반 조건·숙박 후기·예약),
//     그 밖의 숙소는 장소 상세로 갑니다.
//   · 바깥 틀은 StayFrame — 다른 화면처럼 본문 최대 1000px + 넓은 화면의 좌우 광고·보호소 공고 칸.
// 데이터는 /api/lodging/list(공공데이터 숙소 + 직접 등록된 숙소), 정렬·검색·필터는 여기서 합니다.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, CalendarCheck, MapPin, PawPrint, Search, Sparkles } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import PageGuide from "@/components/PageGuide";
import { STAY_GUIDE_KEY, STAY_GUIDE_STEPS } from "@/lib/pageGuides";
import StayFrame from "@/components/lodging/StayFrame";
import { useUserArea } from "@/lib/useUserRegion";
import { haversineKm } from "@/lib/geo";
import { normalizeSidoName } from "@/lib/shelterNotices";
import { REGION_BOARDS } from "@/lib/communityBoards";
import type { PetSize } from "@/lib/lodgingRules";

type Stay = {
  id: number; name: string; category: string | null; address: string | null; lat: number; lng: number; image: string | null; phone: string | null;
  largeDog: boolean | null; bookable: boolean; minPrice: number | null; roomCount: number; petSummary: string | null; petSizes: PetSize[];
};

const BLUE = "#1D4F91";
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
const realImage = (src: string | null) => (src && !src.includes("default-place") ? src : null);

function StayImage({ stay, height }: { stay: Stay; height: number }) {
  // 사진 주소가 깨져 있으면(공공데이터에 흔함) 기본 그림으로 바꿉니다
  const [broken, setBroken] = useState(false);
  const src = broken ? null : realImage(stay.image);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} style={{ width: "100%", height, objectFit: "cover", display: "block" }} />
  ) : (
    <div aria-hidden style={{ width: "100%", height, background: "linear-gradient(135deg,#E3EDFA,#F6F1E4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#4a6a99" }}>
      <BedDouble size={height > 120 ? 30 : 22} /><PawPrint size={height > 120 ? 20 : 15} />
    </div>
  );
}

export default function StayClient() {
  const router = useRouter();
  const area = useUserArea();
  const [stays, setStays] = useState<Stay[] | null>(null);
  const [query, setQuery] = useState("");
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
    const q = query.trim().replace(/\s+/g, "");
    const inRegion = region !== NEARBY && region !== ALL_REGIONS;
    return stays
      .filter((s) => !q || `${s.name}${s.address ?? ""}${s.category ?? ""}`.replace(/\s+/g, "").includes(q))
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

  const chip = (on: boolean): React.CSSProperties => ({
    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 13px", borderRadius: 999, border: `1px solid ${on ? BLUE : "#e3e6ec"}`, background: on ? BLUE : "white",
    color: on ? "white" : "#555", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  });

  return (
    <StayFrame>
      <PageGuide storageKey={STAY_GUIDE_KEY} steps={STAY_GUIDE_STEPS} enabled={stays !== null} />
      <div>
        {/* 머리말 + 검색 */}
        <div style={{ padding: "26px 18px 20px", background: "linear-gradient(160deg,#1D4F91 0%,#3D7BC8 70%,#6FA3DD 100%)", color: "white", borderRadius: "0 0 26px 26px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.18)", fontSize: 11.5, fontWeight: 800 }}>
            <PawPrint size={12} />반려동물 동반 숙소
          </div>
          <h1 className="ggk-logo" style={{ margin: "10px 0 0", fontSize: 24, fontWeight: 800, lineHeight: 1.35 }}>우리 아이도 환영하는<br />숙소를 찾아보세요</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6, lineHeight: 1.6 }}>동반 조건을 미리 확인하고, 바로 예약까지.</div>
        </div>

        {/* 검색 · 지역 · 세부 지역 · 조건 — 화면을 내려도 위에 붙어 있음 */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, padding: "12px 16px 10px", background: "rgba(247,243,232,0.97)", backdropFilter: "blur(6px)", borderBottom: "1px solid rgba(60,50,30,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", borderRadius: 14, background: "white", border: "1px solid #e3e6ec", boxShadow: "0 3px 10px rgba(29,79,145,0.08)" }}>
            <Search size={17} color="#8a96a8" />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="숙소 이름이나 지역 — 예: 강릉, 애월, 가평" aria-label="숙소 검색" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 14.5, fontFamily: "inherit", color: "#222", background: "transparent" }} />
            {query && <button onClick={() => { setQuery(""); setLimit(PAGE); }} aria-label="검색어 지우기" style={{ border: "none", background: "#eef0f3", borderRadius: 999, width: 22, height: 22, cursor: "pointer", color: "#666", fontSize: 13, lineHeight: "22px", padding: 0 }}>×</button>}
          </div>
          <div data-guide="stay-regions" style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2, marginTop: 10 }}>
            {REGION_LABELS.map((label) => (
              <button key={label} onClick={() => { setRegion(label); setSubRegion(null); setLimit(PAGE); }} aria-pressed={region === label} style={chip(region === label)}>
                {label === NEARBY && <MapPin size={12} />}{label}
              </button>
            ))}
          </div>
          {subRegions.length > 1 && (
            <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", marginTop: 8, paddingBottom: 2 }}>
              {[{ key: null as string | null, label: region === ALL_REGIONS ? "전국" : `${region} 전체`, count: subRegions.reduce((n, x) => n + x.count, 0) }, ...subRegions].map((x) => {
                const on = subRegion === x.key;
                return (
                  <button key={x.key ?? "all"} onClick={() => { setSubRegion(x.key); setLimit(PAGE); }} aria-pressed={on}
                    style={{ flexShrink: 0, padding: "6px 11px", borderRadius: 10, border: `1px solid ${on ? BLUE : "#dfe5ee"}`, background: on ? "#E3EDFA" : "white", color: on ? BLUE : "#555", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    {x.label} <span style={{ fontWeight: 600, color: on ? BLUE : "#6e6e6e" }}>{x.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginTop: 8, paddingBottom: 2 }}>
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => toggle(f.id)} aria-pressed={filters.includes(f.id)} style={{ ...chip(false), border: `1px solid ${filters.includes(f.id) ? "#B45309" : "#e3e6ec"}`, background: filters.includes(f.id) ? "#FEF3C7" : "white", color: filters.includes(f.id) ? "#92400E" : "#555" }}>
                {f.id === "bookable" && <CalendarCheck size={12} />}{f.label}
              </button>
            ))}
          </div>
        </div>

        {stays === null ? (
          <div style={{ padding: 40, textAlign: "center" }}><LogoLoader /></div>
        ) : (
          <>
            {/* 같이가개에서 바로 예약 */}
            {bookable.length > 0 && (
              <section style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 18px" }}>
                  <Sparkles size={16} color={BLUE} />
                  <h2 className="ggk-logo" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#222" }}>같이가개에서 바로 예약</h2>
                </div>
                <div style={{ fontSize: 12.5, color: "#5c5c5c", padding: "3px 18px 0" }}>날짜를 고르고 반려동물 정보만 적으면 예약 끝.</div>
                <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", padding: "12px 18px 4px", scrollSnapType: "x mandatory" }}>
                  {bookable.slice(0, 12).map((s) => (
                    <button key={s.id} data-guide="stay-card" onClick={() => open(s)} style={{ flexShrink: 0, width: 230, scrollSnapAlign: "start", padding: 0, border: "none", borderRadius: 18, overflow: "hidden", background: "white", boxShadow: "0 4px 14px rgba(29,79,145,0.12)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <StayImage stay={s} height={140} />
                      <div style={{ padding: "11px 13px 13px" }}>
                        <div style={{ fontSize: 11.5, color: "#5c5c5c" }}>{[s.category, regionOf(s.address)].filter(Boolean).join(" · ")}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#222", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                        {s.petSummary && <div style={{ fontSize: 11.5, color: BLUE, marginTop: 4, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>🐾 {s.petSummary}</div>}
                        {s.minPrice != null && <div style={{ fontSize: 16, fontWeight: 800, color: "#222", marginTop: 6 }}>{s.minPrice.toLocaleString("ko-KR")}원<span style={{ fontSize: 12, fontWeight: 600, color: "#5c5c5c" }}> /1박~</span></div>}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* 전체 숙소 */}
            <section style={{ marginTop: 18, padding: "0 16px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "0 2px" }}>
                <h2 className="ggk-logo" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#222" }}>{region === NEARBY ? (here ? "가까운 숙소" : "전국 숙소") : region === ALL_REGIONS && !subRegion ? "전국 숙소" : `${subRegion ? subRegions.find((x) => x.key === subRegion)?.label ?? region : region} 숙소`}</h2>
                <span style={{ fontSize: 12.5, color: "#666" }}>{list.length.toLocaleString("ko-KR")}곳</span>
              </div>
              {list.length === 0 && (
                <div style={{ marginTop: 12, padding: "32px 16px", borderRadius: 18, background: "white", textAlign: "center", color: "#666", fontSize: 13, lineHeight: 1.7 }}>
                  조건에 맞는 숙소가 없어요.<br />지역이나 조건을 바꿔 보세요.
                </div>
              )}
              {/* 넓은 화면에서는 두 줄로 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 400px), 1fr))", gap: 10, marginTop: 10 }}>
                {list.slice(0, limit).map((s) => (
                  <button key={s.id} data-guide="stay-card" onClick={() => open(s)} style={{ width: "100%", minWidth: 0, boxSizing: "border-box", display: "flex", gap: 12, padding: 10, border: "none", borderRadius: 18, background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", alignItems: "stretch" }}>
                    <div style={{ width: 96, flexShrink: 0, borderRadius: 13, overflow: "hidden" }}><StayImage stay={s} height={96} /></div>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        {s.bookable && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: BLUE, color: "white" }}>바로 예약</span>}
                        {s.category && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#EEF3FA", color: BLUE }}>{s.category}</span>}
                        {(s.largeDog || s.petSizes.includes("large")) && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>대형견 가능</span>}
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: "#5c5c5c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[km(s.distance), regionOf(s.address)].filter(Boolean).join(" · ")}
                      </div>
                      {s.bookable && s.minPrice != null
                        ? <div style={{ fontSize: 14, fontWeight: 800, color: "#222" }}>{s.minPrice.toLocaleString("ko-KR")}원<span style={{ fontSize: 11.5, fontWeight: 600, color: "#5c5c5c" }}> /1박~</span></div>
                        : <div style={{ fontSize: 11.5, color: "#5f6672" }}>전화로 예약 · 동반 조건은 숙소에 확인</div>}
                    </div>
                  </button>
                ))}
              </div>
              {list.length > limit && (
                <button onClick={() => setLimit((n) => n + PAGE)} style={{ width: "100%", marginTop: 12, padding: "13px 0", borderRadius: 14, border: `1px solid ${BLUE}`, background: "white", color: BLUE, fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  숙소 더 보기 ({(list.length - limit).toLocaleString("ko-KR")}곳 남음)
                </button>
              )}
              <div style={{ margin: "20px 4px 8px", fontSize: 11.5, color: "#666", lineHeight: 1.7, textAlign: "center" }}>
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
