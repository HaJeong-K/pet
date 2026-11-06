"use client";

// 마이페이지 "알림" — 숙박 예약 확정·거절·취소, 체크인 전날 안내, 후기 요청 같은 손님 알림을 모아 봅니다.
//   안 읽은 알림이 있으면 아래 탭바 "마이페이지"에 빨간 숫자가 붙습니다(TabBar). 알림이 하나도 없으면 칸을 그리지 않습니다.
// 서버는 /api/me/notifications, 보내는 곳은 src/lib/server/guestNotify.ts.

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Note = { id: number; kind: string; title: string; body: string | null; url: string | null; read_at: string | null; created_at: string };

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
};

/** full = 마이페이지 "알림" 화면 전체(빈 안내·모든 알림 표시) / 기본 = 다른 화면에 끼워 넣는 작은 칸(없으면 안 그림) */
export default function MyNotificationsCard({ full = false }: { full?: boolean } = {}) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const call = useCallback(async (init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch("/api/me/notifications", { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, cache: "no-store" });
    return res.ok ? res.json() : null;
  }, []);
  useEffect(() => {
    let cancelled = false;
    call().then((j) => { if (!cancelled) setNotes(j?.notifications ?? []); });
    return () => { cancelled = true; };
  }, [call]);

  const markAll = async () => {
    await call({ method: "POST", body: JSON.stringify({ all: true }) });
    setNotes((list) => (list ?? []).map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    window.dispatchEvent(new CustomEvent("ggk-notifications-read"));
  };
  const open = async (n: Note) => {
    if (!n.read_at) { await call({ method: "POST", body: JSON.stringify({ id: n.id }) }); window.dispatchEvent(new CustomEvent("ggk-notifications-read")); }
    if (n.url) window.location.href = n.url;
  };

  if (!notes) return null;
  if (notes.length === 0) {
    return full ? (
      <div style={{ textAlign: "center", padding: "48px 16px", background: "white", border: "1px solid #E7E6E5", borderRadius: 18 }}>
        <Bell size={28} color="#A05A32" style={{ margin: "0 auto 10px", display: "block" }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>새 알림이 없어요</div>
        <div style={{ fontSize: 13.5, color: "#2A1C14", marginTop: 8, lineHeight: 1.7 }}>예약 확정·주문 상태·댓글·제보 결과가 생기면 여기에 모여요.</div>
      </div>
    ) : null;
  }
  const unread = notes.filter((n) => !n.read_at).length;
  const shown = showAll || full ? notes : notes.slice(0, 3);

  return (
    <div style={{ margin: full ? 0 : "12px 0 0", padding: full ? "16px 18px" : "14px 16px", borderRadius: full ? 18 : 16, background: "white", border: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Bell size={15} color="#A05A32" />
        <div className="ggk-logo" style={{ fontSize: 14, fontWeight: 800, color: "#222" }}>알림</div>
        {unread > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#EF4444", color: "white", fontSize: 10.5, fontWeight: 800, lineHeight: "18px", textAlign: "center" }}>{unread}</span>}
        {unread > 0 && <button onClick={markAll} style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#5c5c5c", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>모두 읽음</button>}
      </div>
      <div style={{ marginTop: 6 }}>
        {shown.map((n, i) => (
          <button key={n.id} onClick={() => open(n)} style={{ width: "100%", display: "flex", gap: 9, padding: "10px 2px", border: "none", borderTop: i ? "1px solid #f2f3f0" : "none", background: "transparent", cursor: n.url ? "pointer" : "default", textAlign: "left", fontFamily: "inherit" }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, marginTop: 6, flexShrink: 0, background: n.read_at ? "transparent" : "#EF4444" }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "flex", gap: 6 }}>
                <b style={{ flex: 1, fontSize: full ? 14.5 : 13, color: n.read_at ? "#4A3F38" : "#111" }}>{n.title}</b>
                <span style={{ flexShrink: 0, fontSize: 11, color: "#6e6e6e" }}>{ago(n.created_at)}</span>
              </span>
              {n.body && <span style={{ display: "block", fontSize: full ? 13.5 : 12, color: "#2A1C14", marginTop: 2, lineHeight: 1.6 }}>{n.body}</span>}
            </span>
          </button>
        ))}
      </div>
      {!full && notes.length > 3 && <button onClick={() => setShowAll((v) => !v)} style={{ width: "100%", marginTop: 4, padding: "8px 0", border: "none", background: "#F6F7F3", borderRadius: 10, color: "#A05A32", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{showAll ? "접기" : `알림 ${notes.length}개 모두 보기`}</button>}
    </div>
  );
}
