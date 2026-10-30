"use client";

// 숙소 화면(/stay/번호)의 "숙소 소식" — 네이버 플레이스의 "소식/알림"처럼 공지만 모아 보는 구조입니다.
//   · 숙소 화면 위쪽 칸: 대표(고정) 공지와 최근 공지 3개(제목·날짜·N), [전체 보기 n]
//   · 공지를 누르거나 전체 보기를 누르면 화면 전체에 "숙소 소식" 창: 목록 → 공지 하나 열어 읽기 → 목록으로
//   · 주소에 ?notices=1 이면 창을 열고, ?notice=번호 면 그 공지를 바로 엽니다
//     (지도 위 장소 상세 창의 공지를 누르면 이렇게 들어옵니다 — PlaceNoticeBar)
// 공지는 사장님 센터 "공지"에서 씁니다. 서버는 /api/place-notices.

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Megaphone, Pin, X } from "lucide-react";
import { isNewNotice, noticeDate, type PlaceNotice } from "@/lib/placeNotices";

const BLUE = "#1D4F91";
const NEW_BADGE: React.CSSProperties = { flexShrink: 0, fontSize: 9.5, fontWeight: 800, color: "white", background: "#EF4444", borderRadius: 4, padding: "1px 4px", lineHeight: 1.3 };

export default function StayNotices({ placeId, placeName }: { placeId: number; placeName: string }) {
  const [notices, setNotices] = useState<PlaceNotice[] | null>(null);
  const [viewer, setViewer] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/place-notices?placeId=${placeId}`).then((r) => r.json())
      .then((d: { notices?: PlaceNotice[] }) => {
        if (cancelled) return;
        const list = d.notices ?? [];
        setNotices(list);
        // 장소 상세 창에서 공지를 눌러 들어온 경우
        const q = new URLSearchParams(window.location.search);
        const wanted = Number(q.get("notice"));
        if (wanted && list.some((n) => n.id === wanted)) { setViewer(true); setOpenId(wanted); }
        else if (q.get("notices") === "1" && list.length) setViewer(true);
      })
      .catch(() => { if (!cancelled) setNotices([]); });
    return () => { cancelled = true; };
  }, [placeId]);

  // 창이 열려 있으면 뒤 화면이 스크롤되지 않게
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setViewer(false); setOpenId(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  if (!notices || notices.length === 0) return null;
  const open = notices.find((n) => n.id === openId) ?? null;
  const show = (id: number | null) => { setOpenId(id); setViewer(true); };

  return (
    <>
      {/* 숙소 화면 위쪽 칸 */}
      <section id="stay-notices" style={{ background: "white", borderRadius: 18, border: "1px solid #F3E2B8", padding: "14px 16px", scrollMarginTop: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: "#FEF3C7" }}><Megaphone size={14} color="#B45309" /></span>
          <h2 className="ggk-logo" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#222" }}>숙소 소식</h2>
          <span style={{ fontSize: 12, color: "#6e6e6e", fontWeight: 700 }}>{notices.length}</span>
          <button onClick={() => show(null)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 2, border: "none", background: "transparent", color: "#5c5c5c", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            전체 보기<ChevronRight size={14} />
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          {notices.slice(0, 3).map((n, i) => (
            <button key={n.id} onClick={() => show(n.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "10px 2px", border: "none", borderTop: i ? "1px solid #f4efe3" : "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              {n.pinned && <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10.5, fontWeight: 800, color: "#B45309", background: "#FEF3C7", borderRadius: 5, padding: "1px 5px" }}><Pin size={9} />대표</span>}
              {isNewNotice(n.created_at) && <span style={NEW_BADGE}>N</span>}
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
              <span style={{ flexShrink: 0, fontSize: 11.5, color: "#6e6e6e" }}>{noticeDate(n.created_at)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 숙소 소식 창 — 목록 / 공지 읽기 */}
      {viewer && (
        <div role="dialog" aria-modal="true" aria-label={`${placeName} 숙소 소식`} onClick={() => { setViewer(false); setOpenId(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, height: "88dvh", background: "#FAF8F3", borderRadius: "22px 22px 0 0", display: "flex", flexDirection: "column", overflow: "hidden", wordBreak: "keep-all" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", background: "white", borderBottom: "1px solid #f0ebe0" }}>
              {open && <button onClick={() => setOpenId(null)} aria-label="목록으로" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={16} /></button>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#5c5c5c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{placeName}</div>
                <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#222" }}>{open ? "공지" : `숙소 소식 ${notices.length}`}</div>
              </div>
              <button onClick={() => { setViewer(false); setOpenId(null); }} aria-label="닫기" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 28px" }}>
              {open ? (
                <article style={{ background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "18px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {open.pinned && <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 800, color: "#B45309", background: "#FEF3C7", borderRadius: 5, padding: "2px 6px" }}><Pin size={10} />대표 공지</span>}
                    {isNewNotice(open.created_at) && <span style={NEW_BADGE}>N</span>}
                  </div>
                  <h3 className="ggk-logo" style={{ margin: "8px 0 0", fontSize: 19, fontWeight: 800, color: "#222", lineHeight: 1.45 }}>{open.title}</h3>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    {noticeDate(open.created_at)} 게시{open.updated_at.slice(0, 16) !== open.created_at.slice(0, 16) ? ` · ${noticeDate(open.updated_at)} 수정` : ""}
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f3efe3", fontSize: 14.5, color: "#333", lineHeight: 1.85, whiteSpace: "pre-line" }}>{open.content}</div>
                  {/* 이전·다음 공지 */}
                  {(() => {
                    const i = notices.findIndex((n) => n.id === open.id);
                    const prev = notices[i - 1], next = notices[i + 1];
                    return (
                      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                        <button disabled={!prev} onClick={() => prev && setOpenId(prev.id)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #e2dcc8", background: "white", color: prev ? "#555" : "#707070", fontSize: 12.5, fontWeight: 700, cursor: prev ? "pointer" : "default", fontFamily: "inherit" }}>‹ 이전 공지</button>
                        <button onClick={() => setOpenId(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: BLUE, color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>목록</button>
                        <button disabled={!next} onClick={() => next && setOpenId(next.id)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #e2dcc8", background: "white", color: next ? "#555" : "#707070", fontSize: 12.5, fontWeight: 700, cursor: next ? "pointer" : "default", fontFamily: "inherit" }}>다음 공지 ›</button>
                      </div>
                    );
                  })()}
                </article>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {notices.map((n) => (
                    <button key={n.id} onClick={() => setOpenId(n.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 15px", borderRadius: 14, border: `1px solid ${n.pinned ? "#F3D58A" : "#ece6d6"}`, background: n.pinned ? "#FFFBF0" : "white", cursor: "pointer", fontFamily: "inherit" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {n.pinned && <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10.5, fontWeight: 800, color: "#B45309" }}><Pin size={10} />대표</span>}
                        {isNewNotice(n.created_at) && <span style={NEW_BADGE}>N</span>}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                        <span style={{ flexShrink: 0, fontSize: 11.5, color: "#6e6e6e" }}>{noticeDate(n.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#555", marginTop: 5, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-line" }}>{n.content}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
