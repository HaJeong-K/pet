"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import { Users, Search, Flag, ShieldCheck, Store, UserX } from "lucide-react";

// ── 회원 관리 ──
// 가입 회원 목록과 회원별 활동(후기·답글·글·댓글 수), 신고받은 횟수, 관리자가 지운 글 수를 보여 줍니다.
// 신고를 많이 받은 회원을 먼저 볼 수 있고, 문제가 계속되는 회원은 강제 탈퇴시킬 수 있습니다.
// 숫자는 서버(/api/admin/members)가 셉니다 — 신고는 "신고된 글의 작성자" 기준입니다.

type Member = {
  authUserId: string; email: string | null; nickname: string | null; avatarUrl: string | null; createdAt: string | null;
  isAdmin: boolean; ownerStatus: string | null; ownerBusinessName: string | null;
  reviews: number; replies: number; posts: number; comments: number; reported: number; reportedOpen: number; adminDeleted: number;
};
type Filter = "all" | "reported" | "owner" | "admin";
type Sort = "recent" | "reported" | "active";

/** 이 횟수 이상 신고받으면 "신고 다수"로 표시 */
const MANY_REPORTS = 3;

async function call(method: "GET" | "POST", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/members", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json;
}

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" }) : "-");
const activity = (m: Member) => m.reviews + m.replies + m.posts + m.comments;

export default function AdminMembers() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try { setMembers((await call("GET")).members ?? []); } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); setMembers([]); }
  };
  useEffect(() => {
    // 대시보드에서 "신고 다수"로 넘어온 경우 등 주소의 ?filter= 값을 처음 한 번 반영합니다.
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f === "reported") { setFilter("reported"); setSort("reported"); }
    load();
  }, []);

  const counts = useMemo(() => ({
    all: members?.length ?? 0,
    reported: members?.filter((m) => m.reported > 0).length ?? 0,
    owner: members?.filter((m) => m.ownerStatus === "verified" || m.ownerStatus === "pending").length ?? 0,
    admin: members?.filter((m) => m.isAdmin).length ?? 0,
  }), [members]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (members ?? []).filter((m) =>
      (filter === "all" || (filter === "reported" && m.reported > 0) || (filter === "owner" && (m.ownerStatus === "verified" || m.ownerStatus === "pending")) || (filter === "admin" && m.isAdmin)) &&
      (!q || (m.nickname ?? "").toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q) || (m.ownerBusinessName ?? "").toLowerCase().includes(q))
    );
    const by: Record<Sort, (a: Member, b: Member) => number> = {
      recent: (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      reported: (a, b) => b.reported - a.reported || b.adminDeleted - a.adminDeleted,
      active: (a, b) => activity(b) - activity(a),
    };
    return [...filtered].sort(by[sort]);
  }, [members, filter, sort, query]);

  const remove = async (m: Member) => {
    if (busyId) return;
    const name = m.nickname || m.email || "이 회원";
    if (!window.confirm(`"${name}" 회원을 강제 탈퇴시킬까요?\n\n계정과 프로필이 삭제되고 되돌릴 수 없어요. 이미 쓴 글은 남아 있고, 같은 사람이 다시 가입하는 것까지 막지는 못해요.`)) return;
    if (!window.confirm("정말 탈퇴시킬까요? 한 번 더 확인합니다.")) return;
    setBusyId(m.authUserId);
    try { await call("POST", { action: "remove", authUserId: m.authUserId }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "처리하지 못했어요."); }
    finally { setBusyId(null); }
  };

  const chip = (key: Filter, label: string, n: number) => (
    <button key={key} onClick={() => setFilter(key)} style={{ padding: "7px 13px", borderRadius: 999, border: `1.5px solid ${filter === key ? "#5C7A4A" : "#e2e4e8"}`, background: filter === key ? "#5C7A4A" : "white", color: filter === key ? "white" : "#555", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
      {label} {n}
    </button>
  );
  const stat = (label: string, value: number, warn = false) => (
    <div style={{ flex: "1 1 60px", minWidth: 56, padding: "7px 6px", borderRadius: 9, background: warn && value > 0 ? "#FEF2F2" : "#f8fafc", textAlign: "center" }}>
      <div style={{ fontSize: 10.5, color: warn && value > 0 ? "#b91c1c" : "#999" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: warn && value > 0 ? "#b91c1c" : "#333", marginTop: 1 }}>{value}</div>
    </div>
  );

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="members" onRefresh={load} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Users size={18} color="#5C7A4A" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>회원 관리</div>
        </div>
        <p style={{ fontSize: 12.5, color: "#777", lineHeight: 1.65, margin: "0 0 14px" }}>
          가입 회원의 활동과 신고받은 횟수예요. 신고는 신고된 글의 작성자 기준으로 세요. 미처리 신고는 신고 관리에서 처리해요.
        </p>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
          {chip("all", "전체", counts.all)}
          {chip("reported", "신고받음", counts.reported)}
          {chip("owner", "사장님", counts.owner)}
          {chip("admin", "관리자", counts.admin)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 7, padding: "0 12px", height: 40, borderRadius: 10, background: "white", border: "1px solid #e2e4e8" }}>
            <Search size={14} color="#999" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="닉네임·이메일·업체명 검색" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 13, background: "transparent", fontFamily: "inherit" }} />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ height: 40, padding: "0 10px", borderRadius: 10, border: "1px solid #e2e4e8", background: "white", fontSize: 12.5, fontWeight: 700, color: "#444", fontFamily: "inherit" }}>
            <option value="recent">최근 가입순</option>
            <option value="reported">신고 많은 순</option>
            <option value="active">활동 많은 순</option>
          </select>
        </div>

        {error && <div style={{ padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", marginBottom: 14 }}>{error}</div>}
        {members === null && <div style={{ textAlign: "center", padding: "50px 0", color: "#bbb", fontSize: 13 }}>불러오는 중...</div>}
        {members !== null && list.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "50px 0", color: "#888", fontSize: 13.5, fontWeight: 600 }}>조건에 맞는 회원이 없어요.</div>
        )}

        {list.map((m) => (
          <div key={m.authUserId} style={{ background: "white", borderRadius: 16, border: `1px solid ${m.reported >= MANY_REPORTS ? "#FECACA" : "#eee"}`, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#E4EBDC", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Users size={17} color="#48603A" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#222", wordBreak: "break-all" }}>{m.nickname || "(닉네임 없음)"}</span>
                  {m.isAdmin && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#E4EBDC", color: "#48603A" }}><ShieldCheck size={10} />관리자</span>}
                  {m.ownerStatus === "verified" && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#FBEEDD", color: "#A8551F" }}><Store size={10} />사장님{m.ownerBusinessName ? ` · ${m.ownerBusinessName}` : ""}</span>}
                  {m.ownerStatus === "pending" && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>사장님 신청 중</span>}
                  {m.reported >= MANY_REPORTS && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#FEE2E2", color: "#b91c1c" }}><Flag size={10} />신고 다수</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "#888", marginTop: 2, wordBreak: "break-all" }}>{m.email || "이메일 없음"} · 가입 {fmtDate(m.createdAt)}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
              {stat("후기", m.reviews)}
              {stat("답글", m.replies)}
              {stat("글", m.posts)}
              {stat("댓글", m.comments)}
              {stat("신고받음", m.reported, true)}
              {stat("미처리", m.reportedOpen, true)}
              {stat("관리자 삭제", m.adminDeleted, true)}
            </div>

            {(m.reportedOpen > 0 || !m.isAdmin) && (
              <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
                {m.reportedOpen > 0 && (
                  <button onClick={() => router.push("/admin/reports")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 10, border: "none", background: "#5C7A4A", color: "white", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <Flag size={13} />미처리 신고 {m.reportedOpen}건 보러 가기
                  </button>
                )}
                {!m.isAdmin && (
                  <button onClick={() => remove(m)} disabled={busyId === m.authUserId} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 10, border: "1px solid #FECACA", background: "#FEF2F2", color: "#b91c1c", fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: busyId === m.authUserId ? 0.6 : 1 }}>
                    <UserX size={13} />{busyId === m.authUserId ? "처리 중…" : "강제 탈퇴"}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
