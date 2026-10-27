"use client";

import LogoLoader from "@/components/LogoLoader";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import { BadgeCheck, X, Store, BedDouble, MapPin, Phone, FileText } from "lucide-react";
import { OwnerKindBadge } from "@/components/OwnerKindPicker";
import { OWNER_KINDS, isMissingOwnerKind, ownerKindInfo, ownerKindOf, type OwnerKind } from "@/lib/ownerKind";

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
  owner_biz_no: string | null;
  owner_auto_verified: boolean | null;
  owner_kind?: string | null;
  created_at: string;
};

const OWNER_COLUMNS = "auth_user_id, email, nickname, owner_status, owner_business_name, owner_region, owner_sigungu, owner_address_detail, owner_phone, owner_place_id, owner_cert_url, owner_ocr_text, owner_biz_no, owner_auto_verified, created_at";

import { AdminPager, usePaged } from "@/components/admin/AdminListTools";
export default function AdminOwners() {
  const [rows, setRows] = useState<OwnerRow[]>([]);
  const [loading, setLoading] = useState(false);
  // 가게 / 숙소 신청을 나눠 봅니다(src/lib/ownerKind.ts)
  const [kindFilter, setKindFilter] = useState<"all" | OwnerKind>("all");
  // 사업자등록증은 비공개 저장소라, 서버가 만들어 준 10분짜리 임시 주소로 보여줍니다.
  const [certUrls, setCertUrls] = useState<Record<string, string>>({});

  const fetchOwners = async () => {
    setLoading(true);
    const pendingOwners = (columns: string) => supabase
      .from("users")
      .select(columns)
      .eq("owner_status", "pending")
      .order("created_at", { ascending: true })
      .returns<OwnerRow[]>();
    let { data, error } = await pendingOwners(`${OWNER_COLUMNS}, owner_kind`);
    // 유형 칸을 만드는 SQL(scripts/sql/owner-kind.sql) 실행 전이면 유형 없이 불러옵니다(모두 가게로 표시)
    if (isMissingOwnerKind(error)) ({ data, error } = await pendingOwners(OWNER_COLUMNS));
    setRows(data || []);
    setLoading(false);
    const ids = (data || []).filter((r) => r.owner_cert_url).map((r) => r.auth_user_id);
    if (ids.length > 0) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/admin/owners/cert-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userIds: ids }),
      });
      if (res.ok) setCertUrls((await res.json()).urls || {});
    }
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

  const countOf = (k: OwnerKind) => rows.filter((r) => ownerKindOf(r.owner_kind) === k).length;
  const shown = kindFilter === "all" ? rows : rows.filter((r) => ownerKindOf(r.owner_kind) === kindFilter);
  const pager = usePaged(shown);

  return (
    <div className="ggk-body" style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#F7F3E8", overflow: "hidden", alignItems: "center" }}>
      <AdminNav active="owners" onRefresh={fetchOwners} />
      <div style={{ width: "100%", maxWidth: "1200px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)", scrollbarWidth: "thin" as any }}>
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 14 }}>
          사장님 가입 승인 대기 {rows.length > 0 && `(${rows.length}건)`}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {([{ id: "all" as const, label: "전체", count: rows.length }, ...OWNER_KINDS.map((k) => ({ id: k.id, label: k.label, count: countOf(k.id) }))]).map((t) => (
            <button key={t.id} onClick={() => setKindFilter(t.id)} aria-pressed={kindFilter === t.id} style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 999, border: "none", cursor: "pointer",
              background: kindFilter === t.id ? "#5C7A4A" : "white", color: kindFilter === t.id ? "white" : "#555", fontSize: 12.5, fontWeight: 700,
              boxShadow: kindFilter === t.id ? "none" : "inset 0 0 0 1px #e5e0d0",
            }}>
              {t.id === "store" && <Store size={13} />}{t.id === "lodging" && <BedDouble size={13} />}
              {t.label} {t.count}
            </button>
          ))}
        </div>

        {loading && rows.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}><LogoLoader /></div>
        )}
        {!loading && rows.length > 0 && shown.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#aaa", fontSize: 13, background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)" }}>
            대기 중인 {kindFilter === "lodging" ? "숙소" : "가게"} 사장님 신청이 없습니다.
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#aaa", fontSize: 13, background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)" }}>
            대기 중인 사장님 가입 신청이 없습니다.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pager.items.map((r) => (
            <div key={r.auth_user_id} style={{
              background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)",
              borderLeft: `4px solid ${ownerKindInfo(r.owner_kind).color}`,
              padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 16,
            }}>
              {certUrls[r.auth_user_id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={certUrls[r.auth_user_id]} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                  <img
                    src={certUrls[r.auth_user_id]}
                    alt="사업자등록증"
                    style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, border: "1px solid #eee", background: "#fafafa" }}
                  />
                </a>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <OwnerKindBadge kind={ownerKindOf(r.owner_kind)} />
                  <span style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>{r.owner_business_name || `(${ownerKindInfo(r.owner_kind).nameLabel} 미입력)`}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>{r.nickname}</span>
                  {r.owner_cert_url && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#c2410c", background: "#fff3e6", border: "1px solid #ffd9ad", borderRadius: 6, padding: "2px 6px" }}>
                      국세청 자동확인 안 됨 · 수동확인 필요
                    </span>
                  )}
                  {r.owner_biz_no && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#444", background: "#f1f2f4", borderRadius: 6, padding: "2px 6px" }}>
                      사업자번호 {r.owner_biz_no.replace(/^(d{3})(d{2})(d{5})$/, "$1-$2-$3")}
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
          <AdminPager pager={pager} />
        </div>
        </div>
      </div>
    </div>
  );
}
