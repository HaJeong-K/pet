"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DatabaseBackup, Download } from "lucide-react";

// ── 관리자 대시보드: DB 백업 카드 ──
// 매일 새벽 자동으로 백업되고(src/lib/server/dbBackup.ts), 여기서 마지막 백업 시각을 확인하거나
// 파일을 내려받아 따로 보관할 수 있습니다. 백업은 같은 Supabase 안에 저장되므로, 가끔 내려받아
// 컴퓨터나 클라우드 드라이브에도 보관해 두는 것을 권합니다.

type Backup = { name: string; createdAt: string | null; sizeKb: number };

async function call(method: "GET" | "POST", query = "") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch(`/api/admin/backup${query}`, { method, headers: { Authorization: `Bearer ${session.access_token}` } });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

export default function DbBackupCard() {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    try { setBackups((await call("GET")).json.backups ?? []); } catch { setBackups([]); }
  };
  useEffect(() => { refresh(); }, []);

  const latest = backups?.[0];
  const download = async (name: string) => {
    setMessage(null);
    const { ok, json } = await call("GET", `?file=${encodeURIComponent(name)}`);
    if (ok && json.url) window.location.href = json.url;
    else setMessage(json.error || "내려받기에 실패했어요.");
  };
  const backupNow = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { ok, json } = await call("POST");
      setMessage(ok ? `백업 완료 — 표 ${json.result.tables}개, ${json.result.rows.toLocaleString()}행, ${json.result.sizeKb.toLocaleString()}KB` : json.error || "백업에 실패했어요.");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "백업에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ggk-body" style={{ background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", padding: "16px 18px", marginBottom: 24, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: "#E4EBDC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <DatabaseBackup size={19} color="#48603A" />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
          DB 백업 · {backups === null ? "확인 중…" : latest ? `마지막 ${latest.name.slice(7, 17)}` : "아직 없음"}
        </div>
        <div style={{ fontSize: 12, color: "#777", lineHeight: 1.6, marginTop: 3 }}>
          매일 새벽 자동으로 백업하고 최근 14일치를 보관해요{latest ? ` (최근 파일 ${latest.sizeKb.toLocaleString()}KB)` : ""}.
          가끔 내려받아 따로 보관해 두면 더 안전해요.
        </div>
        {message && <div role="status" style={{ fontSize: 12, color: "#48603A", fontWeight: 600, marginTop: 6 }}>{message}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {latest && (
            <button onClick={() => download(latest.name)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 10, border: "none", background: "#5C7A4A", color: "white", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              <Download size={13} />최근 백업 내려받기
            </button>
          )}
          <button onClick={backupNow} disabled={busy} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white", color: "#555", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
            {busy ? "백업 중…" : "지금 백업"}
          </button>
        </div>
      </div>
    </div>
  );
}
