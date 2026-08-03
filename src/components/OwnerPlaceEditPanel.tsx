"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { BadgeCheck, Pencil, X } from "lucide-react";

// 인증된 사장님이 본인 업장(마이페이지에서 연결된 owner_place_id) 상세페이지에서
// 직접 정보를 수정할 수 있는 패널입니다. 관리자 승인 시에만 노출되며(place/[id]/page.tsx
// 에서 owner_status==='verified' && owner_place_id===place.id 일 때만 렌더링),
// 실제 저장은 /api/owner/update-place(서버 service role)를 거칩니다.
export default function OwnerPlaceEditPanel({
  place,
  onUpdated,
}: {
  place: any;
  onUpdated: (fields: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    hours: place.hours || "",
    phone: place.phone || "",
    closed_days: place.closed_days || "",
    pet_zone: place.pet_zone || "both",
    parking: place.parking || "",
    entry_fee: place.entry_fee || "",
    website: place.website || "",
    memo: place.memo || "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert("로그인이 필요합니다."); return; }
      const res = await fetch("/api/owner/update-place", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ placeId: place.id, fields: form }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`수정 실패: ${data.error || "알 수 없는 오류"}`); return; }
      onUpdated(form);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999,
        background: "linear-gradient(135deg,#E4EBDC,#DCE7CD)", border: "1px solid #cfe0bb",
        fontSize: 11, fontWeight: 700, color: "#48603A", marginRight: 8,
      }}>
        <BadgeCheck size={12} />내 업장 (인증된 사장님)
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999,
          border: "1px solid #ddd", background: "white", color: "#555", fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}
      >
        {open ? <X size={12} /> : <Pencil size={12} />}
        {open ? "닫기" : "업장 정보 수정"}
      </button>

      {open && (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 14, border: "1px solid #eee", background: "#fafafa", display: "flex", flexDirection: "column", gap: 8 }}>
          <Field label="운영시간"><input value={form.hours} onChange={set("hours")} style={inputStyle} placeholder="예: 매일 10:00~22:00" /></Field>
          <Field label="전화번호"><input value={form.phone} onChange={set("phone")} style={inputStyle} /></Field>
          <Field label="휴무일"><input value={form.closed_days} onChange={set("closed_days")} style={inputStyle} placeholder="예: 매주 월요일" /></Field>
          <Field label="반려동물 동반 구역">
            <select value={form.pet_zone} onChange={set("pet_zone")} style={inputStyle}>
              <option value="both">실내외 모두 가능</option>
              <option value="indoor">실내만 가능</option>
              <option value="terrace">실외(테라스)만 가능</option>
            </select>
          </Field>
          <Field label="주차"><input value={form.parking} onChange={set("parking")} style={inputStyle} /></Field>
          <Field label="입장료/이용료"><input value={form.entry_fee} onChange={set("entry_fee")} style={inputStyle} /></Field>
          <Field label="홈페이지"><input value={form.website} onChange={set("website")} style={inputStyle} /></Field>
          <Field label="안내사항">
            <textarea value={form.memo} onChange={set("memo")} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
          </Field>
          <button
            onClick={save}
            disabled={saving}
            style={{
              marginTop: 4, padding: "10px", borderRadius: 10, border: "none",
              background: saving ? "#ccc" : "#5C7A4A", color: "white", fontWeight: 700, fontSize: 12.5,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "저장 중..." : "저장하기"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd",
  fontSize: 12.5, boxSizing: "border-box", fontFamily: "'Noto Sans KR', sans-serif",
};
