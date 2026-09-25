"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

// /api/log-error → client_errors 테이블에 쌓인 실사용자 환경 오류(렌더링 오류,
// 처리되지 않은 예외/프라미스 거부)를 확인하는 관리자 페이지. Sentry 같은 SaaS
// 없이 최소한의 "무슨 오류가 어디서 났는지"를 사후에 확인하기 위한 용도입니다.
// 테이블이 아직 생성되지 않았으면(scripts/sql/client-errors.sql 미실행) 빈 목록과
// 안내 문구만 보여주고 조용히 실패합니다.

const formatDate = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const SOURCE_LABEL: Record<string, string> = {
  "window.onerror": "런타임 오류",
  "unhandledrejection": "처리되지 않은 Promise",
  "react-error-boundary": "렌더링 오류",
};

interface ClientError {
  id: number;
  message: string;
  stack: string | null;
  source: string | null;
  path: string | null;
  user_agent: string | null;
  created_at: string;
}

export default function AdminErrorsPage() {
  const [errors, setErrors] = useState<ClientError[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetchErrors();
  }, []);

  const fetchErrors = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_errors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setTableMissing(true);
      setLoading(false);
      return;
    }
    setTableMissing(false);
    setErrors(data || []);
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    await supabase.from("client_errors").delete().eq("id", id);
    setErrors((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div className="ggk-body" style={{ minHeight: "100vh", background: "#F7F3E8" }}>
      <AdminNav active="errors" onRefresh={fetchErrors} />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 28px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <AlertTriangle size={18} color="#dc2626" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>
            에러 로그
          </div>
          <span style={{ fontSize: 12, color: "#888" }}>최근 200건</span>
        </div>

        {tableMissing && (
          <div style={{ padding: 16, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", marginBottom: 16 }}>
            client_errors 테이블이 아직 없습니다. scripts/sql/client-errors.sql을 Supabase SQL 편집기에서 한 번 실행해주세요.
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>불러오는 중...</div>
        ) : errors.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
            {tableMissing ? null : "기록된 오류가 없습니다."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {errors.map((e) => (
              <div
                key={e.id}
                style={{
                  padding: 14, borderRadius: 12, background: "white",
                  border: "1px solid #eee", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#fee2e2", color: "#dc2626" }}>
                        {SOURCE_LABEL[e.source || ""] || e.source || "기타"}
                      </span>
                      <span style={{ fontSize: 11, color: "#999" }}>{formatDate(e.created_at)}</span>
                      {e.path && <span style={{ fontSize: 11, color: "#999" }}>· {e.path}</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#222", wordBreak: "break-word" }}>
                      {e.message}
                    </div>
                    {expandedId === e.id && e.stack && (
                      <pre style={{
                        marginTop: 8, padding: 10, borderRadius: 8, background: "#f8fafc",
                        fontSize: 11, color: "#555", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {e.stack}
                      </pre>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(e.id)}
                    title="삭제"
                    style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, flexShrink: 0 }}
                  >
                    <Trash2 size={14} color="#bbb" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
