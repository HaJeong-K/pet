"use client";

import LogoLoader from "@/components/LogoLoader";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import LevelBadge from "@/components/LevelBadge";
import { Users, Search, Flag, ShieldCheck, Store, BedDouble, UserX, Gavel, Undo2 } from "lucide-react";
import { ownerKindInfo, type OwnerKind } from "@/lib/ownerKind";

// ── 회원 관리 ──
// 가입 회원 목록과 회원별 활동(후기·답글·글·댓글 수), 신고받은 횟수, 관리자가 지운 글 수를 보여 줍니다.
// 신고를 많이 받은 회원을 먼저 볼 수 있고, 문제가 계속되는 회원은 강제 탈퇴시킬 수 있습니다.
// 숫자는 서버(/api/admin/members)가 셉니다 — 신고는 "신고된 글의 작성자" 기준입니다.

type Sanction = {
  /** 최근 1년 위반 횟수(해제 제외) */
  strikes: number;
  blocked: "suspend" | "ban" | null; blockedUntil: string | null;
  /** 한 번 더 위반하면 적용될 조치 */
  nextLabel: string;
  history: { stage: string; days: number | null; reason: string; createdAt: string; endsAt: string | null; liftedAt: string | null }[];
};
type Member = {
  sanction?: Sanction;
  authUserId: string; email: string | null; nickname: string | null; avatarUrl: string | null; createdAt: string | null;
  isAdmin: boolean; ownerStatus: string | null; ownerBusinessName: string | null;
  /** 사장님 유형 — 가게 / 숙소(src/lib/ownerKind.ts) */
  ownerKind?: OwnerKind;
  /** 회원 레벨과 점수(아직 한 번도 계산되지 않은 회원은 null) */
  level: number | null; points: number | null;
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

import { AdminPager, usePaged } from "@/components/admin/AdminListTools";
export default function AdminMembers() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sanctionsReady, setSanctionsReady] = useState(false);

  const load = async () => {
    setError(null);
    try { const json = await call("GET"); setMembers(json.members ?? []); setSanctionsReady(!!json.sanctionsReady); } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); setMembers([]); }
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

  // 위반 1회 기록 → 단계에 맞는 제재가 자동으로 정해집니다(경고 → 7일 → 30일 → 영구, src/lib/sanctions.ts)
  const sanction = async (m: Member, severe: boolean) => {
    if (busyId) return;
    const name = m.nickname || m.email || "이 회원";
    const willApply = severe ? "영구 정지(중대한 위반)" : m.sanction?.nextLabel ?? "경고";
    const reason = window.prompt(`"${name}" 회원에게 [${willApply}] 조치를 합니다.\n회원에게 그대로 전달되는 사유를 적어 주세요.\n(예: 다른 회원 비방 댓글 반복)`);
    if (reason == null) return;
    if (reason.trim().length < 2) { alert("사유를 적어 주세요."); return; }
    if (!window.confirm(`[${willApply}] 조치를 할까요?\n\n사유: ${reason.trim()}\n\n회원에게 알림이 가요.`)) return;
    setBusyId(m.authUserId);
    try { const r = await call("POST", { action: "sanction", authUserId: m.authUserId, reason: reason.trim(), severe }); alert(`적용했어요: ${r.applied}`); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "처리하지 못했어요."); }
    finally { setBusyId(null); }
  };
  const lift = async (m: Member) => {
    if (busyId) return;
    const reason = window.prompt("제재를 해제하는 사유를 적어 주세요.\n(해제하면 위반 횟수에서도 빠져요 — 이의가 받아들여진 경우에만)");
    if (reason == null) return;
    if (reason.trim().length < 2) { alert("사유를 적어 주세요."); return; }
    setBusyId(m.authUserId);
    try { await call("POST", { action: "lift", authUserId: m.authUserId, reason: reason.trim() }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "처리하지 못했어요."); }
    finally { setBusyId(null); }
  };

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
    <button key={key} onClick={() => setFilter(key)} style={{ padding: "7px 13px", borderRadius: 999, border: `1.5px solid ${filter === key ? "#A05A32" : "#e2e4e8"}`, background: filter === key ? "#A05A32" : "white", color: filter === key ? "white" : "#555", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
      {label} {n}
    </button>
  );
  const stat = (label: string, value: number, warn = false) => (
    <div style={{ flex: "1 1 60px", minWidth: 56, padding: "7px 6px", borderRadius: 9, background: warn && value > 0 ? "#FEF2F2" : "#f8fafc", textAlign: "center" }}>
      <div style={{ fontSize: 10.5, color: warn && value > 0 ? "#b91c1c" : "#666" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: warn && value > 0 ? "#b91c1c" : "#333", marginTop: 1 }}>{value}</div>
    </div>
  );

  // 한 쪽에 보여 줄 양을 나눕니다(필터·검색·정렬을 바꾸면 첫 쪽으로).
  const pager = usePaged(list, `${filter}|${sort}|${query}`);

  return (
    <div>
      <AdminNav active="members" onRefresh={load} />
      <div>
        <p style={{ fontSize: 12.5, color: "#555", lineHeight: 1.65, margin: "0 0 14px" }}>
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
        {members === null && <div style={{ textAlign: "center", padding: "50px 0", color: "#707070", fontSize: 13 }}><LogoLoader /></div>}
        {members !== null && list.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "50px 0", color: "#5c5c5c", fontSize: 13.5, fontWeight: 600 }}>조건에 맞는 회원이 없어요.</div>
        )}

        {pager.items.map((m) => (
          <div key={m.authUserId} style={{ background: "white", borderRadius: 16, border: `1px solid ${m.reported >= MANY_REPORTS ? "#FECACA" : "#eee"}`, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#F8E6D9", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Users size={17} color="#85482A" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#222", wordBreak: "break-all" }}>{m.nickname || "(닉네임 없음)"}</span>
                  <LevelBadge level={m.level} />
                  {m.isAdmin && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#F8E6D9", color: "#85482A" }}><ShieldCheck size={10} />관리자</span>}
                  {m.ownerStatus === "verified" && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: ownerKindInfo(m.ownerKind).background, color: ownerKindInfo(m.ownerKind).color }}>{m.ownerKind === "lodging" ? <BedDouble size={10} /> : <Store size={10} />}{ownerKindInfo(m.ownerKind).label} 사장님{m.ownerBusinessName ? ` · ${m.ownerBusinessName}` : ""}</span>}
                  {m.ownerStatus === "pending" && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>{ownerKindInfo(m.ownerKind).label} 사장님 신청 중</span>}
                  {m.reported >= MANY_REPORTS && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#FEE2E2", color: "#b91c1c" }}><Flag size={10} />신고 다수</span>}
                  {m.sanction?.blocked === "ban" && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#2A1C14", color: "white" }}>영구 정지</span>}
                  {m.sanction?.blocked === "suspend" && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#FEE2E2", color: "#b91c1c" }}>작성 제한 ~{fmtDate(m.sanction.blockedUntil)}</span>}
                  {!m.sanction?.blocked && (m.sanction?.strikes ?? 0) > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>위반 {m.sanction!.strikes}회</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "#5c5c5c", marginTop: 2, wordBreak: "break-all" }}>{m.email || "이메일 없음"} · 가입 {fmtDate(m.createdAt)}{m.points != null ? ` · ${m.points.toLocaleString()}점` : ""}</div>
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
              {sanctionsReady && stat("위반(1년)", m.sanction?.strikes ?? 0, true)}
            </div>

            {(m.reportedOpen > 0 || !m.isAdmin) && (
              <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
                {m.reportedOpen > 0 && (
                  <button onClick={() => router.push("/admin/reports")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 10, border: "none", background: "#A05A32", color: "white", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <Flag size={13} />미처리 신고 {m.reportedOpen}건 보러 가기
                  </button>
                )}
                {!m.isAdmin && sanctionsReady && m.sanction?.blocked !== "ban" && (
                  <button onClick={() => sanction(m, false)} disabled={busyId === m.authUserId} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 10, border: "1px solid #E7E1DC", background: "white", color: "#3B2A20", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <Gavel size={13} />위반 기록 → {m.sanction?.nextLabel ?? "경고"}
                  </button>
                )}
                {!m.isAdmin && sanctionsReady && m.sanction?.blocked !== "ban" && (
                  <button onClick={() => sanction(m, true)} disabled={busyId === m.authUserId} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 10, border: "1px solid #E7E1DC", background: "white", color: "#b91c1c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <Gavel size={13} />중대 위반 → 영구 정지
                  </button>
                )}
                {!m.isAdmin && sanctionsReady && m.sanction?.blocked && (
                  <button onClick={() => lift(m)} disabled={busyId === m.authUserId} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 10, border: "1px solid #E7E1DC", background: "white", color: "#5c5c5c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <Undo2 size={13} />제재 해제
                  </button>
                )}
                {!m.isAdmin && (
                  <button onClick={() => remove(m)} disabled={busyId === m.authUserId} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 10, border: "1px solid #FECACA", background: "#FEF2F2", color: "#b91c1c", fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: busyId === m.authUserId ? 0.6 : 1 }}>
                    <UserX size={13} />{busyId === m.authUserId ? "처리 중…" : "강제 탈퇴"}
                  </button>
                )}
              </div>
            )}
            {(m.sanction?.history.length ?? 0) > 0 && (
              <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px dashed #eee", display: "grid", gap: 3 }}>
                {m.sanction!.history.map((h, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: h.liftedAt ? "#9a9a9a" : "#5c5c5c", lineHeight: 1.5, textDecoration: h.liftedAt ? "line-through" : "none" }}>
                    {fmtDate(h.createdAt)} · <b>{h.stage === "warning" ? "경고" : h.stage === "ban" ? "영구 정지" : `${h.days}일 작성 제한`}</b> · {h.reason}{h.liftedAt ? " (해제)" : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <AdminPager pager={pager} />
      </div>
    </div>
  );
}
