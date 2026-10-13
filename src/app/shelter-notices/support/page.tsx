"use client";

// 보호소·후원 — 전국 동물보호센터에 문의할 수 있는 연락처와, 후원할 수 있는 단체의 공식 창구를 모아 둔 화면.
//
// 같이가개는 후원금을 받거나 전달하지 않습니다(돈이 우리를 거치면 기부금품 모집 등록 대상이 될 수 있음).
// 그래서 "후원하러 가기"는 관리자가 직접 고른 단체의 공식 후원 페이지로만 연결하고, 계좌번호는 싣지 않습니다.
// 보호소는 이름·지역·전화만 보여 줍니다 — 주소와 지도는 일부러 뺐습니다(동물을 버리러 찾아가는 데 쓰이지 않게).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, ExternalLink, HeartHandshake, PawPrint, Phone, Search } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";

type Shelter = { id: string; name: string; sido: string; sigungu: string; tel: string; protecting: number; dogs: number; cats: number; others: number; urgent: number };
type Org = { id: string; name: string; description: string; url: string };

const card: React.CSSProperties = { background: "white", borderRadius: 14, border: "1px solid #eee", padding: "13px 14px" };
const chip = (active: boolean): React.CSSProperties => ({
  flexShrink: 0, padding: "7px 13px", borderRadius: 999, border: active ? "none" : "1px solid #e5e5e5", cursor: "pointer",
  fontSize: 12.5, fontWeight: 700, background: active ? "#7A5236" : "white", color: active ? "white" : "#555", whiteSpace: "nowrap",
});

/** "경상북도" → "경북"처럼 짧게(칩에 쓰기 좋게) */
const shortSido = (sido: string) =>
  sido.replace(/통합특별시|특별자치도|특별자치시|특별시|광역시/g, "").replace(/^(충청|전라|경상)(북|남)도$/, (_, a: string, b: string) => a[0] + b).replace(/도$/, "") || sido;

export default function ShelterSupportPage() {
  const router = useRouter();
  const [shelters, setShelters] = useState<Shelter[] | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [failed, setFailed] = useState(false);
  const [sido, setSido] = useState<string>("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shelters")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json) => { if (!cancelled) { setShelters(json.shelters || []); setOrgs(json.orgs || []); } })
      .catch(() => { if (!cancelled) { setShelters([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, []);

  const sidos = useMemo(() => [...new Set((shelters || []).map((s) => s.sido).filter(Boolean))], [shelters]);
  const shown = useMemo(() => {
    const q = query.trim().replace(/\s+/g, "");
    return (shelters || []).filter((s) => (!sido || s.sido === sido) && (!q || (s.name + s.sido + s.sigungu).replace(/\s+/g, "").includes(q)));
  }, [shelters, sido, query]);
  const totalProtecting = useMemo(() => (shelters || []).reduce((sum, s) => sum + s.protecting, 0), [shelters]);

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column" }}>
        {/* 머리 띠 — 입양 화면과 같은 틀(갈색 바탕·흰 글씨). 오른쪽에는 지금 수치를 작게 보여 줍니다. */}
        <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(135deg, #7A5236 0%, #5E3F29 100%)", padding: "24px clamp(20px, 4vw, 40px) 24px", wordBreak: "keep-all" }}>
          <HeartHandshake aria-hidden="true" size={160} color="rgba(255,255,255,0.06)" style={{ position: "absolute", right: -20, bottom: -44, transform: "rotate(-10deg)" }} />
          {/* 첫 줄: 작은 이름표와 이동 버튼을 같은 줄에(입양 화면의 머리 띠와 같은 구조) */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ display: "inline-block", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "3px 10px", borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#F3E6D4", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.4px" }}>보호센터 문의 · 후원 창구</span>
            <button onClick={() => router.push("/shelter-notices")} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.14)", color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
              <PawPrint size={14} /> 입양 공고
            </button>
          </div>
          <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px 32px" }}>
            <div style={{ flex: "1 1 280px", minWidth: 0, maxWidth: 560 }}>
              <div className="ggk-logo" style={{ marginTop: 10, fontSize: 23, fontWeight: 800, color: "white", lineHeight: 1.3, letterSpacing: "-0.3px" }}>
                입양이 어렵다면, <span style={{ color: "#F6C89A", display: "inline-block" }}>함께 도울 수 있어요</span>
              </div>
              <div style={{ marginTop: 7, fontSize: 12.5, color: "rgba(255,255,255,0.82)", lineHeight: 1.65 }}>
                보호센터를 누르면 그곳에서 가족을 기다리는 아이들만 모아 볼 수 있어요.<br />
                물품 후원이나 봉사는 보호센터에 직접 문의해 주세요(후원을 받지 않는 곳도 있어요).<br />
                <b style={{ color: "white" }}>같이가개는 후원금을 받거나 전달하지 않아요.</b>
              </div>
            </div>
            {shelters && shelters.length > 0 && (
              <div style={{ flex: "0 1 230px", minWidth: "min(100%, 200px)", display: "flex", gap: 8 }}>
                {[["보호센터", shelters.length], ["보호 중", totalProtecting]].map(([label, value]) => (
                  <div key={label} style={{ flex: "1 1 0", minWidth: 0, maxWidth: 120, padding: "11px 6px", borderRadius: 14, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.10)", textAlign: "center" }}>
                    <div className="ggk-logo" style={{ fontSize: 20, fontWeight: 800, color: "white", lineHeight: 1.2 }}>{Number(value).toLocaleString()}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.78)", marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "18px 20px var(--ggk-tabbar-space)", wordBreak: "keep-all" }}>
          {/* 후원할 수 있는 단체 — 관리자가 고른 곳만. 없으면 이 묶음은 보이지 않습니다. */}
          {orgs.length > 0 && (
            <section style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <HeartHandshake size={17} color="#D9534F" />
                <h2 className="ggk-logo" style={{ fontSize: 15.5, fontWeight: 800, color: "#222", margin: 0 }}>후원할 수 있는 단체</h2>
              </div>
              <p style={{ fontSize: 12, color: "#777", lineHeight: 1.65, margin: "0 0 12px" }}>
                같이가개는 후원금을 받거나 전달하지 않아요. 후원은 각 단체의 공식 창구에서 직접 이루어져요.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 10 }}>
                {orgs.map((org) => (
                  <div key={org.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#222" }}>{org.name}</div>
                    {org.description && <div style={{ fontSize: 12.5, color: "#666", lineHeight: 1.6, flex: 1 }}>{org.description}</div>}
                    <a href={org.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, background: "#D9534F", color: "white", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
                      후원하러 가기 <ExternalLink size={13} />
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            {/* 수치와 안내는 위 머리 띠에 있습니다. 후원 단체 묶음이 위에 있을 때만 구분용 제목을 답니다. */}
            {orgs.length > 0 && <h2 className="ggk-logo" style={{ fontSize: 15.5, fontWeight: 800, color: "#222", margin: "0 0 10px" }}>전국 동물보호센터</h2>}
            {/* 유기 경고 — 눈에 잘 들어오게 빨간 띠와 굵은 글씨로 */}
            <div role="note" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "13px 14px", borderRadius: 12, background: "#FDECEA", border: "1px solid #F3B7B1", borderLeft: "5px solid #C0392B", marginBottom: 12 }}>
              <AlertTriangle size={18} color="#C0392B" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ lineHeight: 1.6 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#B42318" }}>동물을 버리는 것은 처벌받는 범죄예요.</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#7A271A", marginTop: 2 }}>
                  키우기 어려워졌다면 버리지 말고 보호센터나 시·군·구청에 먼저 상담해 주세요.
                </div>
              </div>
            </div>

            {shelters === null ? (
              <div style={{ padding: 40, textAlign: "center" }}><LogoLoader /></div>
            ) : shelters.length === 0 ? (
              <div style={{ ...card, textAlign: "center", fontSize: 13, color: "#888", padding: 30 }}>
                {failed ? "보호센터 목록을 불러오지 못했어요. 잠시 후 다시 열어 주세요." : "지금은 보여 드릴 보호센터가 없어요."}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 12, background: "white", border: "1px solid #e8e2d2", marginBottom: 10 }}>
                  <Search size={15} color="#a59f90" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="보호센터 이름이나 지역으로 찾기" aria-label="보호센터 찾기" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 13.5, background: "transparent", fontFamily: "inherit" }} />
                </div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 10, scrollbarWidth: "none" }}>
                  <button onClick={() => setSido("")} style={chip(sido === "")}>전국</button>
                  {sidos.map((name) => (
                    <button key={name} onClick={() => setSido(name)} style={chip(sido === name)}>{shortSido(name)}</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 10 }}>
                  {shown.map((s) => (
                    <div key={s.id} style={{ ...card, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      {/* 누르면 이 보호센터의 공고만 모아 봅니다 */}
                      <button onClick={() => router.push(`/shelter-notices/support/${encodeURIComponent(s.id)}`)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px 11px", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                            {s.urgent > 0 && <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 999, background: "#FDE8E6", color: "#C0392B", fontSize: 10, fontWeight: 800 }}>마감 임박 {s.urgent}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>{[shortSido(s.sido), s.sigungu].filter(Boolean).join(" ")}</div>
                          <div style={{ fontSize: 12, color: "#5d574e", marginTop: 5, fontWeight: 600 }}>
                            {s.protecting > 0
                              ? <>보호 중 <b style={{ color: "#7A5236" }}>{s.protecting}마리</b>{[s.dogs > 0 && ` · 강아지 ${s.dogs}`, s.cats > 0 && ` · 고양이 ${s.cats}`, s.others > 0 && ` · 기타 ${s.others}`].filter(Boolean).join("")}</>
                              : <span style={{ color: "#aaa" }}>지금 보호 중인 공고 없음</span>}
                          </div>
                        </div>
                        <ChevronRight size={17} color="#bbb" style={{ flexShrink: 0 }} />
                      </button>
                      <div style={{ display: "flex", borderTop: "1px solid #f1ede2" }}>
                        <button onClick={() => router.push(`/shelter-notices/support/${encodeURIComponent(s.id)}`)} style={{ flex: 1, padding: "10px 0", border: "none", background: "transparent", fontSize: 12.5, fontWeight: 800, color: "#7A5236", cursor: "pointer", fontFamily: "inherit" }}>
                          아이들 보기
                        </button>
                        {s.tel && (
                          <a href={`tel:${s.tel.replace(/[^\d+]/g, "")}`} aria-label={`${s.name}에 전화로 문의하기`} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderLeft: "1px solid #f1ede2", color: "#3F5230", fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>
                            <Phone size={13} /> 전화 문의
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {shown.length === 0 && <div style={{ ...card, textAlign: "center", fontSize: 13, color: "#888", padding: 26, marginTop: 4 }}>조건에 맞는 보호센터가 없어요.</div>}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
