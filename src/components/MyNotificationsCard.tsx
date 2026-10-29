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

export default function MyNotificationsCard() {
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

  if (!notes || notes.length === 0) return null;
  const unread = notes.filter((n) => !n.read_at).length;
  const shown = showAll ? notes : notes.slice(0, 3);

  return (
    <div style={{ margin: "12px 0 0", padding: "14px 16px", borderRadius: 16, background: "white", border: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Bell size={15} color="#5C7A4A" />
        <div className="ggk-logo" style={{ fontSize: 14, fontWeight: 800, color: "#222" }}>알림</div>
        {unread > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#EF4444", color: "white", fontSize: 10.5, fontWeight: 800, lineHeight: "18px", textAlign: "center" }}>{unread}</span>}
        {unread > 0 && <button onClick={markAll} style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#888", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>모두 읽음</button>}
      </div>
      <div style={{ marginTop: 6 }}>
        {shown.map((n, i) => (
          <button key={n.id} onClick={() => open(n)} style={{ width: "100%", display: "flex", gap: 9, padding: "10px 2px", border: "none", borderTop: i ? "1px solid #f2f3f0" : "none", background: "transparent", cursor: n.url ? "pointer" : "default", textAlign: "left", fontFamily: "inherit" }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, marginTop: 6, flexShrink: 0, background: n.read_at ? "transparent" : "#EF4444" }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "flex", gap: 6 }}>
                <b style={{ flex: 1, fontSize: 13, color: n.read_at ? "#666" : "#222" }}>{n.title}</b>
                <span style={{ flexShrink: 0, fontSize: 11, color: "#aaa" }}>{ago(n.created_at)}</span>
              </span>
              {n.body && <span style={{ display: "block", fontSize: 12, color: "#888", marginTop: 2, lineHeight: 1.55 }}>{n.body}</span>}
            </span>
          </button>
        ))}
      </div>
      {notes.length > 3 && <button onClick={() => setShowAll((v) => !v)} style={{ width: "100%", marginTop: 4, padding: "8px 0", border: "none", background: "#F6F7F3", borderRadius: 10, color: "#5C7A4A", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{showAll ? "접기" : `알림 ${notes.length}개 모두 보기`}</button>}
    </div>
  );
}
