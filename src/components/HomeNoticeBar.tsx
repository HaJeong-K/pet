"use client";
// src/components/HomeNoticeBar.tsx
//
// 메인(지도) 화면 제목 아래 공지 한 줄 — 커뮤니티 "공지" 게시판의 가장 최근 공지를 보여 주고,
// 누르면 그 공지 글로 바로 갑니다. 공지가 없으면 아무것도 그리지 않습니다.
// 닫기를 누르면 그 공지는 이 기기에서 다시 띄우지 않습니다(새 공지가 올라오면 다시 보입니다).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Notice = { id: string | number; title: string; created_at: string };
const DISMISS_KEY = "ggk-home-notice-dismissed";

export default function HomeNoticeBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("community_posts")
      .select("id, title, created_at")
      .eq("is_notice", true)
      .eq("deleted", false)
      .eq("is_admin_deleted", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const latest = (data?.[0] as Notice | undefined) ?? null;
        if (cancelled || !latest) return;
        let dismissed: string | null = null;
        try { dismissed = localStorage.getItem(DISMISS_KEY); } catch {}
        if (dismissed !== String(latest.id)) setNotice(latest);
      });
    return () => { cancelled = true; };
  }, []);

  if (!notice) return null;

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { localStorage.setItem(DISMISS_KEY, String(notice.id)); } catch {}
    setNotice(null);
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/community/post/${notice.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(`/community/post/${notice.id}`); }}
      className="ggk-body"
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9, boxSizing: "border-box",
        padding: compact ? "7px 6px 7px 10px" : "7px 8px 7px 12px", borderRadius: 11,
        background: "#F6F9F2", border: "1px solid #E1E9D7", cursor: "pointer",
      }}
    >
      <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: 6, background: "#2F3B28", color: "white", fontSize: 11, fontWeight: 800, lineHeight: "17px" }}>공지</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: compact ? 13 : 13.5, fontWeight: 700, color: "#2a2520", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{notice.title}</span>
      <ChevronRight size={15} color="#7a8a6c" style={{ flexShrink: 0 }} />
      <button onClick={dismiss} aria-label="이 공지 닫기" style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 999, border: "none", background: "transparent", color: "#5f6456", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
        <X size={14} />
      </button>
    </div>
  );
}
