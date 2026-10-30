"use client";

// ── 후원 단체 관리 ──
// "보호소·후원" 화면(/shelter-notices/support)의 "후원할 수 있는 단체"에 올릴 곳을 고릅니다.
// 같이가개는 후원금을 받지 않고 단체의 공식 후원 페이지로 연결만 하므로, 계좌번호가 아니라 공식 페이지 주소를 적습니다.
// 등록 여부(기부금품 모집 등록·공익법인 지정 등)를 공개 자료로 확인한 곳만 올려 주세요.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import LogoLoader from "@/components/LogoLoader";
import { HeartHandshake, Plus, Trash2 } from "lucide-react";
import type { SupportOrg } from "@/lib/server/supportOrgs";

async function call(method: "GET" | "PUT", orgs?: SupportOrg[]) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/support-orgs", {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(orgs ? { "Content-Type": "application/json" } : {}) },
    body: orgs ? JSON.stringify({ orgs }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json.orgs as SupportOrg[];
}

const input: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };

export default function AdminSupportOrgs() {
  const [orgs, setOrgs] = useState<SupportOrg[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setMessage(null);
    try { setOrgs(await call("GET")); } catch (e) { setOrgs([]); setMessage({ ok: false, text: e instanceof Error ? e.message : "오류" }); }
  };
  useEffect(() => { load(); }, []);

  const update = (index: number, patch: Partial<SupportOrg>) => setOrgs((list) => (list || []).map((org, i) => (i === index ? { ...org, ...patch } : org)));
  const add = () => setOrgs((list) => [...(list || []), { id: `org-${Date.now()}`, name: "", description: "", url: "https://", hidden: false }]);
  const remove = (index: number) => setOrgs((list) => (list || []).filter((_, i) => i !== index));
  const save = async () => {
    if (!orgs || saving) return;
    setSaving(true);
    setMessage(null);
    try { setOrgs(await call("PUT", orgs)); setMessage({ ok: true, text: "저장했어요. 방문자 화면에는 최대 30분 안에 반영돼요." }); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "오류" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="support" onRefresh={load} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)", wordBreak: "keep-all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <HeartHandshake size={18} color="#5C7A4A" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>후원 단체</div>
          <a href="/shelter-notices/support" target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#5C7A4A" }}>방문자 화면 보기 →</a>
        </div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7, marginBottom: 14 }}>
          여기에 올린 단체만 &quot;후원하러 가기&quot; 버튼이 붙어요. 같이가개는 후원금을 받지 않고 단체의 공식 후원 페이지로 연결만 하므로,
          계좌번호가 아니라 <b>공식 후원 페이지 주소</b>를 적어 주세요. 등록 여부를 공개 자료로 확인한 곳만 올려 주세요.
        </div>

        {orgs === null ? (
          <div style={{ padding: 40, textAlign: "center" }}><LogoLoader /></div>
        ) : (
          <>
            {orgs.length === 0 && <div style={{ padding: 24, borderRadius: 12, background: "white", border: "1px solid #eee", fontSize: 13, color: "#5c5c5c", textAlign: "center", marginBottom: 10 }}>아직 올린 단체가 없어요. 방문자 화면에는 보호센터 목록만 보여요.</div>}
            <div style={{ display: "grid", gap: 10 }}>
              {orgs.map((org, i) => (
                <div key={org.id} style={{ background: "white", borderRadius: 14, border: "1px solid #eee", padding: 14, display: "grid", gap: 8, opacity: org.hidden ? 0.6 : 1 }}>
                  <input value={org.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="단체 이름" maxLength={60} style={input} />
                  <textarea value={org.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="어떤 활동을 하는 곳인지 한두 줄" maxLength={200} style={{ ...input, minHeight: 56, resize: "vertical" }} />
                  <input value={org.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="공식 후원 페이지 주소 (https://...)" inputMode="url" style={input} />
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#555", cursor: "pointer" }}>
                      <input type="checkbox" checked={org.hidden} onChange={(e) => update(i, { hidden: e.target.checked })} /> 숨기기
                    </label>
                    <button onClick={() => remove(i)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 11px", borderRadius: 9, border: "1px solid #f3c7c5", background: "white", color: "#b42318", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      <Trash2 size={12} /> 삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {message && <div role="status" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803d" : "#b91c1c" }}>{message.text}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={add} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "11px 16px", borderRadius: 11, border: "1px solid #d8d2c0", background: "white", fontSize: 13, fontWeight: 700, color: "#555", cursor: "pointer" }}>
                <Plus size={14} /> 단체 추가
              </button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: "11px 0", borderRadius: 11, border: "none", background: saving ? "#cbd5c0" : "#5C7A4A", color: "white", fontSize: 13.5, fontWeight: 800, cursor: saving ? "default" : "pointer" }}>
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
