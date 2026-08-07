"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import { BadgeCheck, X, Store, MapPin, Phone, FileText } from "lucide-react";

type OwnerRow = {
  auth_user_id: string;
  email: string;
  nickname: string;
  owner_status: string;
  owner_business_name: string | null;
  owner_region: string | null;
  owner_sigungu: string | null;
  owner_address_detail: string | null;
  owner_phone: string | null;
  owner_place_id: number | null;
  owner_cert_url: string | null;
  owner_ocr_text: string | null;
  created_at: string;
};

export default function AdminOwners() {
  const [rows, setRows] = useState<OwnerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOwners = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("users")
      .select("auth_user_id, email, nickname, owner_status, owner_business_name, owner_region, owner_sigungu, owner_address_detail, owner_phone, owner_place_id, owner_cert_url, owner_ocr_text, created_at")
      .eq("owner_status", "pending")
      .order("created_at", { ascending: true });
    setRows(data || []);
    setLoading(false);
  };

  // ⚠ 관리자 인증은 이제 src/app/admin/layout.tsx가 한 번만 확인하고, 통과한
  // 뒤에만 이 페이지가 마운트됩니다 — 여기서 다시 확인할 필요가 없습니다.
  useEffect(() => {
    fetchOwners();
  }, []);

  const decide = async (userId: string, action: "approve" | "reject") => {
    if (!confirm(action === "approve" ? "이 사장님 계정을 승인하시겠습니까?" : "이 신청을 반려하시겠습니까?")) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch("/api/admin/owners/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId, action }),
    });
    const data = await res.json();
    if (!res.ok) { alert(`처리 실패: ${data.error || "알 수 없는 오류"}`); return; }
    setRows((prev) => prev.filter((r) => r.auth_user_id !== userId));
  };

  return (
    <div className="ggk-body" style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#F7F3E8", overflow: "hidden", alignItems: "center" }}>
      <AdminNav active="owners" onRefresh={fetchOwners} />
      <div style={{ width: "100%", maxWidth: "1200px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px 60px", scrollbarWidth: "thin" as any }}>
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 14 }}>
          사장님 가입 승인 대기 {rows.length > 0 && `(${rows.length}건)`}
        </div>

        {loading && rows.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>불러오는 중...</div>
        )}
        {!loading && rows.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#aaa", fontSize: 13, background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)" }}>
            대기 중인 사장님 가입 신청이 없습니다.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.auth_user_id} style={{
              background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)",
              padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 16,
            }}>
              {r.owner_cert_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={r.owner_cert_url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                  <img
                    src={r.owner_cert_url}
                    alt="사업자등록증"
                    style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, border: "1px solid #eee", background: "#fafafa" }}
                  />
                </a>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <Store size={14} color="#5C7A4A" />
                  <span style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>{r.owner_business_name || "(가게명 미입력)"}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>{r.nickname}</span>
                  {r.owner_cert_url && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#c2410c", background: "#fff3e6", border: "1px solid #ffd9ad", borderRadius: 6, padding: "2px 6px" }}>
                      자동검증 불일치 · 수동확인 필요
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#666", flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={11} />{r.owner_region || "-"} {r.owner_sigungu || ""}
                  </span>
                  {r.owner_phone && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} />{r.owner_phone}</span>}
                  <span>{r.email}</span>
                  {r.owner_place_id && <span style={{ color: "#5C7A4A", fontWeight: 700 }}>지도 연결됨 (place #{r.owner_place_id})</span>}
                </div>
                {r.owner_address_detail && (
                  <div style={{ fontSize: 11.5, color: "#888", marginBottom: 4 }}>{r.owner_address_detail}</div>
                )}
                {r.owner_ocr_text && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 4, fontSize: 11, color: "#aaa", marginTop: 4, lineHeight: 1.4 }}>
                    <FileText size={11} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
                      OCR: {r.owner_ocr_text.replace(/\s+/g, " ").trim()}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => decide(r.auth_user_id, "reject")} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 10,
                  border: "1px solid #e8eaed", background: "white", color: "#888", fontWeight: 700, fontSize: 12, cursor: "pointer",
                }}>
                  <X size={13} />반려
                </button>
                <button onClick={() => decide(r.auth_user_id, "approve")} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 10,
                  border: "none", background: "linear-gradient(135deg,#5C7A4A,#48603A)", color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer",
                }}>
                  <BadgeCheck size={13} />승인
                </button>
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
