"use client";

// 보호센터 한 곳 — 그곳에서 지금 보호 중인 아이들의 공고만 모아 봅니다.
// 주소·지도는 싣지 않습니다(목록 화면과 같은 이유). 방문 전에는 전화로 먼저 문의하도록 안내합니다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, PawPrint, Phone } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import ShelterNoticeCard, { type ShelterNoticeLite } from "@/components/ShelterNoticeCard";
import { useAdoptPhrases } from "@/lib/adoptPhrases";

type Shelter = { id: string; name: string; sido: string; sigungu: string; tel: string; protecting: number; dogs: number; cats: number; others: number; urgent: number };

// 숫자 칸 — 폰에서는 한 줄을 나눠 쓰고, 넓은 화면에서는 STAT_MAX_WIDTH까지만 커집니다(가로로 길게 늘어지지 않게).
const STAT_MAX_WIDTH = 104;
/** 마감이 이 날수 이하로 남으면 "마감 임박"(서버 shelterDirectory.ts의 URGENT_DAYS와 같은 값) */
const URGENT_DAYS = 3;
type Notice = ShelterNoticeLite & { kind?: "dog" | "cat" | "other" };
type Choice = "all" | "dog" | "cat" | "other" | "urgent";
const PICK_LABEL: Record<Choice, string> = { all: "보호 중", dog: "강아지", cat: "고양이", other: "기타", urgent: "마감 임박" };
const matches = (n: Notice, pick: Choice) =>
  pick === "all" ? true : pick === "urgent" ? n.daysLeft <= URGENT_DAYS : (n.kind ?? "other") === pick;

/** "강원특별자치도" → "강원"처럼 짧게(이동 버튼과 한 줄에 들어가게) */
const shortSido = (sido: string) =>
  sido.replace(/통합특별시|특별자치도|특별자치시|특별시|광역시/g, "").replace(/^(충청|전라|경상)(북|남)도$/, (_, a: string, b: string) => a[0] + b).replace(/도$/, "") || sido;

export default function ShelterDetailClient({ id, initial, phraseSeed }: { id: string; initial: { shelter: Shelter; notices: Notice[] } | "missing" | null; /** 카드 위 문구 순서를 정하는 숫자 — 서버와 브라우저가 같은 문구를 그리도록 서버가 정해 줍니다 */ phraseSeed: number }) {
  const router = useRouter();
  // 서버가 채워 보낸 내용으로 바로 시작합니다. 서버가 못 채웠을 때(null)만 화면이 뜬 뒤에 받아 옵니다.
  const [data, setData] = useState<{ shelter: Shelter; notices: Notice[] } | null>(initial && initial !== "missing" ? initial : null);
  // 숫자 칸을 누르면 그 조건의 공고만 봅니다(다시 누르거나 "보호 중"을 누르면 전체).
  const [pick, setPick] = useState<Choice>("all");
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">(initial === "missing" ? "missing" : initial ? "ready" : "loading");
  const adoptPhrase = useAdoptPhrases(phraseSeed);

  useEffect(() => {
    if (!id || initial) return;
    let cancelled = false;
    fetch(`/api/shelters/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) { setState("missing"); return; }
        if (!res.ok) { setState("failed"); return; }
        setData(await res.json());
        setState("ready");
      })
      .catch(() => { if (!cancelled) setState("failed"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const shelter = data?.shelter;
  const shown = (data?.notices ?? []).filter((n) => matches(n, pick));

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column" }}>
        {state !== "ready" && (
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "24px clamp(20px, 4vw, 40px)", background: "linear-gradient(135deg, #7A5236 0%, #5E3F29 100%)" }}>
            <div style={{ flexShrink: 0, display: "flex", gap: 6 }}>
              <button onClick={() => router.push("/shelter-notices/support")} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.14)", color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                <ChevronLeft size={14} /> 보호소 목록
              </button>
              <button onClick={() => router.push("/shelter-notices")} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.14)", color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                <PawPrint size={14} /> 입양 공고
              </button>
            </div>
          </div>
        )}
        {state === "loading" && <div style={{ padding: 80, textAlign: "center" }}><LogoLoader label="불러오는 중…" /></div>}
        {(state === "missing" || state === "failed") && (
          <div style={{ margin: 20, padding: 30, borderRadius: 14, background: "white", border: "1px solid #eee", textAlign: "center", fontSize: 13, color: "#888", lineHeight: 1.7 }}>
            {state === "missing" ? "지금은 이 보호센터의 공고가 없어요." : "보호센터 정보를 불러오지 못했어요. 잠시 후 다시 열어 주세요."}
          </div>
        )}

        {state === "ready" && shelter && data && (
          <>
            {/* 머리 띠 — 넓은 화면에서는 왼쪽에 이름·안내, 오른쪽에 숫자·전화를 나란히 두고(숫자 칸과 버튼이 화면 끝까지
                늘어나지 않게), 폰에서는 위아래로 쌓습니다. */}
            <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(135deg, #7A5236 0%, #5E3F29 100%)", padding: "24px clamp(20px, 4vw, 40px) 26px", wordBreak: "keep-all" }}>
              <PawPrint aria-hidden="true" size={170} color="rgba(255,255,255,0.06)" style={{ position: "absolute", left: "38%", bottom: -48, transform: "rotate(-14deg)" }} />
              {/* 첫 줄: 지역 이름표와 이동 버튼을 같은 줄에(입양 화면의 머리 띠와 같은 구조) */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ display: "inline-block", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "3px 10px", borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#F3E6D4", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.4px" }}>{[shortSido(shelter.sido), shelter.sigungu].filter(Boolean).join(" ")}</span>
                <div style={{ flexShrink: 0, display: "flex", gap: 6 }}>
                  <button onClick={() => router.push("/shelter-notices/support")} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.14)", color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                    <ChevronLeft size={14} /> 보호소 목록
                  </button>
                  <button onClick={() => router.push("/shelter-notices")} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.14)", color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                    <PawPrint size={14} /> 입양 공고
                  </button>
                </div>
              </div>
              {/* 둘째 줄은 첫 줄(이름표·이동 버튼)과 띄웁니다 — 오른쪽 숫자 칸이 버튼에 붙지 않게 */}
          <div style={{ position: "relative", marginTop: 16, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "18px 32px" }}>
                <div style={{ flex: "1 1 280px", minWidth: 0, maxWidth: 520 }}>
                  <div className="ggk-logo" style={{ fontSize: 23, fontWeight: 800, color: "white", lineHeight: 1.3, letterSpacing: "-0.3px" }}>{shelter.name}</div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.7 }}>
                    입양·임시보호·봉사·물품 후원은 방문 전에 전화로 먼저 문의해 주세요. 운영 시간과 방문 방법은 보호센터마다 달라요.
                  </div>
                </div>
                <div style={{ flex: "0 1 440px", minWidth: "min(100%, 260px)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([["all", shelter.protecting], ["dog", shelter.dogs], ["cat", shelter.cats], ["other", shelter.others], ["urgent", shelter.urgent]] as [Choice, number][])
                      .filter(([key, value]) => key !== "other" || value > 0)
                      .map(([key, value]) => {
                        const active = pick === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setPick(active ? "all" : key)}
                            aria-pressed={active}
                            aria-label={`${PICK_LABEL[key]} ${value}마리만 보기`}
                            style={{
                              flex: "1 1 0", minWidth: 0, maxWidth: STAT_MAX_WIDTH, padding: "11px 6px", borderRadius: 14, textAlign: "center", cursor: "pointer", fontFamily: "inherit",
                              background: active ? "white" : "rgba(255,255,255,0.12)", border: active ? "1px solid white" : "1px solid rgba(255,255,255,0.10)",
                            }}
                          >
                            <div className="ggk-logo" style={{ fontSize: 20, fontWeight: 800, color: active ? "#5E3F29" : key === "urgent" ? "#F6C89A" : "white", lineHeight: 1.2 }}>{value}</div>
                            <div style={{ fontSize: 10.5, color: active ? "#7A5236" : "rgba(255,255,255,0.78)", marginTop: 3, fontWeight: active ? 800 : 400 }}>{PICK_LABEL[key]}</div>
                          </button>
                        );
                      })}
                  </div>
                  {shelter.tel && (
                    <a href={`tel:${shelter.tel.replace(/[^\d+]/g, "")}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 18px", borderRadius: 12, background: "white", color: "#5E3F29", fontSize: 14, fontWeight: 800, textDecoration: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.16)" }}>
                      <Phone size={15} /> 전화로 문의하기 · {shelter.tel}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: "18px 20px var(--ggk-tabbar-space)" }}>
              <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222", marginBottom: 4 }}>{pick === "all" ? "가족을 기다리는 아이들" : pick === "urgent" ? "마감이 임박한 아이들" : `가족을 기다리는 ${pick === "other" ? "기타 동물" : PICK_LABEL[pick]}`} {shown.length}마리</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>마감이 임박한 순서예요. 누르면 자세한 공고를 볼 수 있어요.</div>
              {shown.length === 0 ? (
                <div style={{ padding: 30, borderRadius: 14, background: "white", border: "1px solid #eee", textAlign: "center", fontSize: 13, color: "#888" }}>지금 보호 중인 공고가 없어요.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
                  {shown.map((n, i) => (
                    <div key={n.desertionNo} style={{ height: 230, display: "flex", flexDirection: "column" }}>
                      <ShelterNoticeCard notice={n} phrase={adoptPhrase(i)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
