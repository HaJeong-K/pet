"use client";

// 장소 상세의 가게 공지(사장님 소식) — 친화도 점수 바로 아래에 붙습니다(네이버 플레이스 "알림"과 같은 자리·모양).
//   · 접힌 상태: [공지] 대표 공지(없으면 최신 공지) 제목 · 날짜 · 공지 수 ›
//   · 누르면 펼쳐져 지난 공지까지 모두 보입니다. 공지마다 눌러서 내용을 펼칩니다(첫 공지는 펼친 채로).
// 공지가 없으면 아무것도 그리지 않습니다. 서버는 /api/place-notices, 규칙은 src/lib/placeNotices.ts.
// 같이가개에서 바로 예약되는 숙소(lodging)면 펼치지 않고 숙소 화면(/stay/번호)의 "숙소 소식"으로 보냅니다 —
//   공지를 누르면 그 공지가, 머리 줄을 누르면 공지 목록이 열립니다(지도 위 창을 벗어나도록 새로 엽니다).

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Megaphone, Pin } from "lucide-react";
import { isNewNotice, noticeDate, type PlaceNotice } from "@/lib/placeNotices";

const NEW_BADGE: React.CSSProperties = { flexShrink: 0, fontSize: 9.5, fontWeight: 800, color: "white", background: "#EF4444", borderRadius: 4, padding: "1px 4px", lineHeight: 1.3 };

export default function PlaceNoticeBar({ placeId, lodging = false }: { placeId: number; lodging?: boolean }) {
  const [notices, setNotices] = useState<PlaceNotice[]>([]);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  // 바로 예약되는 숙소인지(객실이 열려 있음) — 그러면 숙소 화면에서 공지를 보여 줍니다
  const [stayHref, setStayHref] = useState<string | null>(null);
  useEffect(() => {
    if (!lodging) return;
    let cancelled = false;
    fetch(`/api/lodging?placeId=${placeId}`).then((r) => r.json())
      .then((d: { rooms?: unknown[] }) => { if (!cancelled && (d.rooms ?? []).length > 0) setStayHref(`/stay/${placeId}`); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [placeId, lodging]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/place-notices?placeId=${placeId}`).then((r) => r.json())
      .then((d: { notices?: PlaceNotice[] }) => { if (!cancelled) { const list = d.notices ?? []; setNotices(list); setOpenId(list[0]?.id ?? null); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [placeId]);

  if (notices.length === 0) return null;
  const top = notices[0];
  if (stayHref) {
    return (
      <a href={`${stayHref}?notice=${top.id}`} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid #F3E2B8", background: "#FFFBF0", textDecoration: "none" }}>
        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 7px", borderRadius: 6, background: "#B45309", color: "white", fontSize: 10.5, fontWeight: 800 }}>
          <Megaphone size={11} />공지
        </span>
        {isNewNotice(top.created_at) && <span style={NEW_BADGE}>N</span>}
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#3d3122", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{top.title}</span>
        <span style={{ flexShrink: 0, fontSize: 11, color: "#6b5f3e" }}>{notices.length > 1 ? `숙소 소식 ${notices.length}` : noticeDate(top.created_at)}</span>
        <ChevronRight size={15} color="#a08a63" />
      </a>
    );
  }

  return (
    <div style={{ marginBottom: 10, borderRadius: 12, border: "1px solid #F3E2B8", background: "#FFFBF0", overflow: "hidden" }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 7px", borderRadius: 6, background: "#B45309", color: "white", fontSize: 10.5, fontWeight: 800 }}>
          <Megaphone size={11} />공지
        </span>
        {isNewNotice(top.created_at) && <span style={NEW_BADGE}>N</span>}
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#3d3122", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{top.title}</span>
        <span style={{ flexShrink: 0, fontSize: 11, color: "#6b5f3e" }}>{noticeDate(top.created_at)}</span>
        {notices.length > 1 && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#B45309" }}>{notices.length}</span>}
        {open ? <ChevronUp size={15} color="#a08a63" /> : <ChevronDown size={15} color="#a08a63" />}
      </button>

      {open && (
        <div style={{ borderTop: "1px solid #F3E2B8", background: "white" }}>
          {notices.map((n) => {
            const expanded = openId === n.id;
            return (
              <div key={n.id} style={{ borderBottom: "1px solid #f4efe3" }}>
                <button onClick={() => setOpenId(expanded ? null : n.id)} aria-expanded={expanded} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  {n.pinned && <Pin size={12} color="#B45309" style={{ flexShrink: 0 }} aria-label="대표 공지" />}
                  {isNewNotice(n.created_at) && <span style={NEW_BADGE}>N</span>}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: expanded ? 800 : 600, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap" }}>{n.title}</span>
                  <span style={{ flexShrink: 0, fontSize: 11, color: "#6e6e6e" }}>{noticeDate(n.created_at)}</span>
                </button>
                {expanded && (
                  <div style={{ padding: "0 12px 12px", fontSize: 12.5, color: "#555", lineHeight: 1.75, whiteSpace: "pre-line", wordBreak: "keep-all" }}>
                    {n.content}
                    {n.updated_at.slice(0, 16) !== n.created_at.slice(0, 16) && <div style={{ marginTop: 6, fontSize: 11, color: "#707070" }}>{noticeDate(n.updated_at)} 수정</div>}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ padding: "8px 12px", fontSize: 11, color: "#6e6e6e" }}>사장님이 올린 공지예요.</div>
        </div>
      )}
    </div>
  );
}
