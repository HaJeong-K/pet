"use client";

// 마이페이지 "차단한 회원" — 커뮤니티에서 차단한 회원을 모아 보고 해제합니다(2026-11-13).
// 차단은 글 상세의 메뉴에서 하고(community_blocks), 여기서는 목록과 해제만 합니다. 내 차단 목록은 본인만 읽을 수 있습니다.

import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Blocked = { id: string; nickname: string | null; avatarUrl: string | null; since: string };

export default function MyBlockedUsers() {
  const [list, setList] = useState<Blocked[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data: rows } = await supabase.from("community_blocks").select("blocked_user_id, created_at").order("created_at", { ascending: false });
    const ids = (rows ?? []).map((r) => r.blocked_user_id as string);
    const { data: profiles } = ids.length ? await supabase.from("public_profiles").select("auth_user_id, nickname, avatar_url").in("auth_user_id", ids) : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.auth_user_id as string, p]));
    setList((rows ?? []).map((r) => ({
      id: r.blocked_user_id as string,
      nickname: (byId.get(r.blocked_user_id as string)?.nickname as string | null) ?? null,
      avatarUrl: (byId.get(r.blocked_user_id as string)?.avatar_url as string | null) ?? null,
      since: r.created_at as string,
    })));
  };
  useEffect(() => { load(); }, []);

  const unblock = async (b: Blocked) => {
    if (busy || !window.confirm(`"${b.nickname || "이 회원"}" 차단을 해제할까요?\n해제하면 이 회원의 글과 댓글이 다시 보여요.`)) return;
    setBusy(b.id);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await supabase.from("community_blocks").delete().eq("auth_user_id", session.user.id).eq("blocked_user_id", b.id);
    setBusy(null);
    load();
  };

  if (list === null) return <div style={{ padding: 30, textAlign: "center", fontSize: 13, color: "#5c5c5c" }}>불러오는 중…</div>;
  if (list.length === 0) {
    return (
      <div style={{ padding: "44px 20px", textAlign: "center", background: "white", border: "1px solid #E7E6E5", borderRadius: 18 }}>
        <UserX size={30} color="#A05A32" />
        <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800, color: "#111" }}>차단한 회원이 없어요</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#5c5c5c", lineHeight: 1.6 }}>커뮤니티 글의 메뉴에서 회원을 차단하면<br />그 회원의 글과 댓글이 보이지 않아요.</div>
      </div>
    );
  }
  return (
    <div style={{ background: "white", border: "1px solid #E7E6E5", borderRadius: 18, overflow: "hidden" }}>
      {list.map((b, i) => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderTop: i ? "1px solid #F1EFEE" : "none" }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#F8E6D9", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {b.avatarUrl ? <img src={b.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <UserX size={16} color="#85482A" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nickname || "탈퇴한 회원"}</div>
            <div style={{ fontSize: 11.5, color: "#5c5c5c", marginTop: 2 }}>{new Date(b.since).toLocaleDateString("ko-KR")} 차단</div>
          </div>
          <button onClick={() => unblock(b)} disabled={busy === b.id} style={{ flexShrink: 0, padding: "8px 13px", borderRadius: 10, border: "1px solid #DDDCDB", background: "white", color: "#3B2A20", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: busy === b.id ? 0.6 : 1 }}>
            {busy === b.id ? "해제 중…" : "차단 해제"}
          </button>
        </div>
      ))}
    </div>
  );
}
