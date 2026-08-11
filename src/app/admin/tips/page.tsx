"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { geocodeAddress } from "@/lib/geocodeAddress";
import { approveProposal } from "@/lib/approveProposal";
import { applyInfoUpdateProposal } from "@/lib/applyInfoUpdateProposal";
import AdminNav from "@/components/AdminNav";
import PetIllustration from "@/components/illustrations/PetIllustration";
import {
  ArrowLeft, FileText, CheckCircle, MapPin, Clock,
  RefreshCw, AlertCircle, Dog, Phone, MessageCircle,
  ChefHat, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  X, Pencil, Save, MapPinCheckInside, PauseCircle, LandPlot, User, Trash2,
  Stethoscope, PawPrint, Home, Trees, Building2, ImageIcon, BadgeCheck,
  MapPinPlus, Globe, CalendarOff, ParkingCircle, Ticket,
} from "lucide-react";

function PetZoneIcon({ zone, size = 11 }: { zone: string; size?: number }) {
  if (zone === "indoor") return <Home size={size} />;
  if (zone === "terrace") return <Trees size={size} />;
  if (zone === "both") return <Building2 size={size} />;
  return null;
}

/* ── 스타일 ── */
const STYLES = `
  * { box-sizing: border-box; }
  .tip-card  { transition: box-shadow 0.18s ease; }
  .tip-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.10) !important; }
  .action-btn { transition: all 0.15s ease; }
  .action-btn:hover { filter: brightness(0.93); }
  .edit-input { width:100%; padding:7px 10px; border-radius:8px; border:1.5px solid #5C7A4A; font-size:12px; outline:none; font-family:'Noto Sans KR',sans-serif; background:white; }
  ::-webkit-scrollbar { width:6px; }
  ::-webkit-scrollbar-thumb { background:#d1d5db; border-radius:999px; }
  .field-rows > div:last-child { border-bottom: none !important; }
`;

const PET_ZONE_LABEL: Record<string, string> = { indoor:"실내 가능", terrace:"테라스 가능", both:"실내외 가능" };
const PET_ZONE_EMOJI: Record<string, string> = { indoor:"🏠", terrace:"🌿", both:"🏡" };

const formatDate = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

// 카카오 주소→좌표 변환 및 승인 로직은 src/lib/geocodeAddress.ts, src/lib/approveProposal.ts로
// 이동했습니다 — jebo 자동 승인(AI 비전 검증) 흐름과 이 관리자 수동 승인이 완전히 같은
// 로직을 타도록 하기 위함입니다.

type ActiveFilter = "pending" | "on_hold" | "approved";

/* ── 필드 행 컴포넌트 ── */
function FieldRow({
  icon, label, fieldKey, value, proposalId,
  editingField, editValue, onEdit, onEditValue, onSave, onCancel,
  renderEditInput,
}: {
  icon: React.ReactNode; label: string; fieldKey: string; value: any;
  proposalId: number;
  editingField: { id: number; field: string } | null;
  editValue: string;
  onEdit: (id: number, field: string, val: string) => void;
  onEditValue: (v: string) => void;
  onSave: (id: number, field: string) => void;
  onCancel: () => void;
  renderEditInput?: () => React.ReactNode;
}) {
  const isEditing = editingField?.id === proposalId && editingField?.field === fieldKey;

  const displayValue = () => {
    if (fieldKey === "large_dog") {
      if (value === true)  return <span style={{ color:"#16a34a", fontWeight:600, display:"flex", alignItems:"center", gap:4 }}><CheckCircle2 size={13}/>가능</span>;
      if (value === false) return <span style={{ color:"#dc2626", fontWeight:600, display:"flex", alignItems:"center", gap:4 }}><XCircle size={13}/>불가</span>;
      return <span style={{ color:"#bbb" }}>미입력</span>;
    }
    if (fieldKey === "pet_zone" && value) {
      return <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><PetZoneIcon zone={value} /> {PET_ZONE_LABEL[value]}</span>;
    }
    return value
      ? <span style={{ color:"#333" }}>{value}</span>
      : <span style={{ color:"#bbb" }}>미입력</span>;
  };

  return (
    <div style={{ padding:"8px 0", borderBottom:"1px solid #f0f2f5" }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:6, justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, minWidth:80, paddingTop:2 }}>
          {icon}
          <span style={{ fontSize:11, color:"#888", fontWeight:600 }}>{label}</span>
        </div>
        <div style={{ flex:1, fontSize:12, lineHeight:1.6 }}>
          {isEditing ? (
            renderEditInput ? renderEditInput() : (
              <input
                className="edit-input"
                value={editValue}
                onChange={(e) => onEditValue(e.target.value)}
                autoFocus
              />
            )
          ) : displayValue()}
        </div>
        <div style={{ display:"flex", gap:4, flexShrink:0, marginLeft:6 }}>
          {isEditing ? (
            <>
              <button onClick={() => onSave(proposalId, fieldKey)} style={{ padding:"3px 9px", borderRadius:6, border:"none", background:"#5C7A4A", color:"white", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:3 }}>
                <Save size={11}/>저장
              </button>
              <button onClick={onCancel} style={{ padding:"3px 8px", borderRadius:6, border:"1px solid #ddd", background:"white", color:"#888", fontSize:11, cursor:"pointer" }}>
                취소
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                let v = value;
                if (fieldKey === "large_dog") v = value === true ? "true" : value === false ? "false" : "";
                onEdit(proposalId, fieldKey, String(v ?? ""));
              }}
              style={{ padding:"3px 8px", borderRadius:6, border:"1px solid #e2e4e8", background:"#f8fafc", color:"#666", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", gap:3 }}
            >
              <Pencil size={11}/>수정
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   메인 컴포넌트
══════════════════════════════════════════ */
export default function AdminProposalsPage() {
  const [proposals,     setProposals]     = useState<any[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [activeFilter,  setActiveFilter]  = useState<ActiveFilter>("pending");
  const [reporterEmails, setReporterEmails] = useState<Record<string, string>>({});

  /* ── 인라인 편집 상태 ── */
  const [editingField, setEditingField] = useState<{ id: number; field: string } | null>(null);
  const [editValue,    setEditValue]    = useState("");

  /* ── 이미지 라이트박스 ── */
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex,  setLightboxIndex]  = useState(0);

  // ⚠ 관리자 인증은 이제 src/app/admin/layout.tsx가 한 번만 확인하고, 통과한
  // 뒤에만 이 페이지가 마운트됩니다 — 여기서 다시 확인할 필요가 없습니다.
  useEffect(() => {
    fetchProposals();
  }, []);

  /* ── proposals + 제보자 이메일 불러오기 ── */
  const fetchProposals = async () => {
    setLoading(true);
    // ★ 인증된 사장님이 직접 한 제보(is_owner_request)를 최우선으로 위에 노출
    const { data, error } = await supabase
      .from("proposals")
      .select("*")
      .order("is_owner_request", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[admin/tips] proposals 조회 실패:", error.message, error.details, error.hint);
      setLoading(false);
      return;
    }
    const list = data || [];
    setProposals(list);

    /* 로그인 제보자 이메일 조회 */
    const authIds = list.filter(p => p.auth_user_id).map(p => p.auth_user_id);
    if (authIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("auth_user_id, email")
        .in("auth_user_id", authIds);
      if (users) {
        const map: Record<string, string> = {};
        users.forEach(u => { map[u.auth_user_id] = u.email; });
        setReporterEmails(map);
      }
    }
    setLoading(false);
  };

  /* ── 보류 처리 ── */
  const handleHold = async (id: number) => {
    await supabase.from("proposals").update({ status: "on_hold" }).eq("id", id);
    setProposals(prev => prev.map(p => p.id === id ? { ...p, status: "on_hold" } : p));
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 제보를 삭제하시겠습니까?")) return;
    await supabase.from("proposals").delete().eq("id", id);
    setProposals(prev => prev.filter(p => p.id !== id));
  };

  /* ── 승인 ──
     - proposal_kind === "info_update": 이미 지도에 있는 장소의 빠진 정보를 채워달라는
       제안 → src/lib/applyInfoUpdateProposal.ts (기존 행 UPDATE, 또는 공공데이터
       출처 장소면 실제 행으로 승격)
     - 그 외(기본값 "new_place"): 신규 장소 등록 제보 → 기존 approveProposal.ts (places INSERT) */
  const handleApprove = async (proposal: any) => {
    if (proposal.proposal_kind === "info_update") {
      const result = await applyInfoUpdateProposal(supabase, proposal);

      if (!result.ok) {
        const msg =
          result.reason === "place_not_found" ? "대상 장소를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다." :
          result.reason === "update_failed"    ? "장소 정보 업데이트 중 오류가 발생했습니다." :
                                                  "장소 등록 중 오류가 발생했습니다.";
        alert(msg);
        return;
      }

      await supabase.from("proposals").update({ status: "approved", is_resolved: true }).eq("id", proposal.id);
      setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "approved", is_resolved: true } : p));
      alert(`"${proposal.place_name}" 장소에 제안하신 정보가 반영되었습니다.`);
      return;
    }

    const result = await approveProposal(supabase, proposal);

    if (!result.ok) {
      if (result.reason === "no_coords") {
        alert("좌표(위도/경도)를 확인할 수 없습니다.\n'보류' 탭에서 주소를 다시 저장하거나 좌표를 직접 입력해주세요.");
      } else {
        alert("장소 등록 중 오류가 발생했습니다.");
      }
      return;
    }

    setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "approved", is_resolved: true, lat: result.lat, lng: result.lng } : p));
    alert(`"${proposal.place_name}" 장소가 지도에 등록되었습니다.`);
  };

  /* ── 인라인 필드 수정 시작 ── */
  const startEdit = (id: number, field: string, val: string) => {
    setEditingField({ id, field });
    setEditValue(val);
  };

  /* ── 인라인 필드 저장 ── */
  const saveField = async (id: number, field: string) => {
    let value: any = editValue.trim() || null;

    if (field === "large_dog") {
      value = editValue === "true" ? true : editValue === "false" ? false : null;
    }

    /* 주소 저장 시 좌표 자동 추출 */
    let extra: any = {};
    if (field === "address" && value) {
      const coords = await geocodeAddress(value);
      if (coords) extra = { lat: coords.lat, lng: coords.lng };
    }

    await supabase.from("proposals").update({ [field]: value, ...extra }).eq("id", id);
    setProposals(prev => prev.map(p =>
      p.id === id ? { ...p, [field]: value, ...extra } : p
    ));
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);

  /* ── 제보자 표시 ── */
  const getReporterDisplay = (p: any) => {
    if (p.auth_user_id) {
      const email = reporterEmails[p.auth_user_id];
      return { label: "회원", value: email || "이메일 조회 중...", isEmail: true };
    }
    if (p.reporter_key) {
      return { label: "비회원", value: p.reporter_key, isEmail: false };
    }
    return { label: "알 수 없음", value: "—", isEmail: false };
  };

  /* ── 필터별 목록 ── */
  const pendingList  = proposals.filter(p => p.status === "pending");
  const onHoldList   = proposals.filter(p => p.status === "on_hold");
  const approvedList = proposals.filter(p => p.status === "approved");
  const displayList  =
    activeFilter === "pending"  ? pendingList  :
    activeFilter === "on_hold"  ? onHoldList   : approvedList;

  return (
    <>
      <style>{STYLES}</style>

      <div className="ggk-body" style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#F7F3E8", overflow:"hidden", alignItems:"center" }}>
        <AdminNav active="tips" onRefresh={fetchProposals} />
        <div style={{ width:"100%", maxWidth:"1200px", display:"flex", flexDirection:"column", flex:1, minHeight:0, overflow:"hidden" }}>

          {/* ── 3단 필터 탭 ── */}
          <div style={{ padding:"16px 28px 10px", flexShrink:0 }}>
            <div style={{ display:"flex", background:"#e8eaed", borderRadius:12, padding:"3px", gap:"3px" }}>
              {([
                { key:"pending",  label:"미처리",   count: pendingList.length,  icon: <AlertCircle size={13}/>,  activeColor:"#5C7A4A", activeBg:"#E4EBDC" },
                { key:"on_hold",  label:"보류",      count: onHoldList.length,   icon: <PauseCircle size={13}/>,  activeColor:"#f59e0b", activeBg:"#fef3c7" },
                { key:"approved", label:"처리완료",  count: approvedList.length, icon: <CheckCircle size={13}/>,  activeColor:"#22c55e", activeBg:"#dcfce7" },
              ] as const).map((tab) => {
                const isActive = activeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className="ggk-body"
                    style={{
                      flex:1, padding:"9px 8px", borderRadius:10, border:"none",
                      background: isActive ? "white" : "transparent",
                      fontWeight:700, fontSize:12, color: isActive ? "#111" : "#888",
                      cursor:"pointer",
                      boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                      transition:"all 0.15s ease",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                    }}
                  >
                    <span style={{ color: isActive ? tab.activeColor : "#aaa" }}>{tab.icon}</span>
                    {tab.label}
                    <span style={{
                      fontSize:10, fontWeight:800, padding:"1px 7px", borderRadius:999,
                      background: isActive ? tab.activeBg : "#f0f2f5",
                      color: isActive ? tab.activeColor : "#999",
                    }}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 리스트 ── */}
          <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"0 28px 60px", scrollbarWidth:"thin" }}>
            {loading ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#bbb", fontSize:13 }}>불러오는 중...</div>
            ) : displayList.length === 0 ? (
              <div style={{ textAlign:"center", padding:"80px 0" }}>
                <div style={{ width:64, height:64, borderRadius:20, background:"#E4EBDC", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
                  <PetIllustration variant="empty" width={44} />
                </div>
                <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#222" }}>
                  {activeFilter === "pending" ? "미처리 제보가 없습니다" :
                   activeFilter === "on_hold" ? "보류 중인 제보가 없습니다" : "처리완료 내역이 없습니다"}
                </div>
              </div>
            ) : (
              displayList.map((tip) => {
                const reporter = getReporterDisplay(tip);
                const isOnHold = tip.status === "on_hold";

                return (
                  <div key={tip.id} className="tip-card" style={{
                    background:"white", borderRadius:20, marginBottom:16, overflow:"hidden",
                    border:`1.5px solid ${
                      tip.status === "pending"  ? "#8FA876" :
                      tip.status === "on_hold"  ? "#fde68a" : "#bbf7d0"
                    }`,
                    boxShadow:"0 3px 12px rgba(0,0,0,0.05)",
                  }}>
                    {/* 카드 헤더 */}
                    <div style={{
                      padding:"11px 16px",
                      background:
                        tip.status === "pending"  ? "#F7F3E8" :
                        tip.status === "on_hold"  ? "#fffbeb" : "#f0fdf4",
                      borderBottom:`1px solid ${
                        tip.status === "pending"  ? "#8FA876" :
                        tip.status === "on_hold"  ? "#fde68a" : "#bbf7d0"
                      }`,
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                    }}>
                      <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {tip.proposal_kind === "info_update" && (
                          <span style={{
                            fontSize:10, padding:"3px 9px", borderRadius:999, fontWeight:800,
                            background:"linear-gradient(135deg,#3b82f6,#2563eb)", color:"white",
                            display:"flex", alignItems:"center", gap:3,
                          }} title="이미 있는 장소의 빠진 정보를 채워달라는 제안">
                            <MapPinPlus size={10}/>정보 추가 제안
                          </span>
                        )}
                        {tip.is_owner_request && (
                          <span style={{
                            fontSize:10, padding:"3px 9px", borderRadius:999, fontWeight:800,
                            background:"linear-gradient(135deg,#5C7A4A,#48603A)", color:"white",
                            display:"flex", alignItems:"center", gap:3,
                          }}>
                            <BadgeCheck size={10}/>사장님 직접 신청
                          </span>
                        )}
                        {/* AI 비전 검증으로 자동 등록된 제보 표시 */}
                        {tip.ai_verified && (
                          <span style={{
                            fontSize:10, padding:"3px 9px", borderRadius:999, fontWeight:800,
                            background:"linear-gradient(135deg,#8b5cf6,#7c3aed)", color:"white",
                            display:"flex", alignItems:"center", gap:3,
                          }} title={tip.ai_review?.reasoning || "AI 비전 검증 통과로 자동 등록됨"}>
                            AI 자동 승인
                          </span>
                        )}
                        {/* 자동 승인은 안 됐지만 AI가 1차로 검토는 해본 경우 — 관리자 참고용 */}
                        {!tip.ai_verified && tip.ai_review && !tip.ai_review.skipped && (
                          <span
                            style={{
                              fontSize:10, padding:"3px 9px", borderRadius:999, fontWeight:700,
                              background:"#f3f0ff", color:"#6d28d9", border:"1px solid #ddd6fe",
                            }}
                            title={tip.ai_review.reasoning || ""}
                          >
                            AI 검토: 확인 필요
                          </span>
                        )}
                        <span style={{
                          fontSize:10, padding:"3px 10px", borderRadius:999, fontWeight:700,
                          background:
                            tip.status === "pending"  ? "#E4EBDC" :
                            tip.status === "on_hold"  ? "#fef3c7" : "#dcfce7",
                          color:
                            tip.status === "pending"  ? "#48603A" :
                            tip.status === "on_hold"  ? "#92400e" : "#15803d",
                          display:"flex", alignItems:"center", gap:4,
                        }}>
                          {tip.status === "pending"  && <><AlertCircle size={9}/>검토 대기</>}
                          {tip.status === "on_hold"  && <><PauseCircle size={9}/>보류 중</>}
                          {tip.status === "approved" && <><CheckCircle size={9}/>승인 완료</>}
                        </span>
                      </span>
                      <span style={{ fontSize:10, color:"#aaa" }}>{formatDate(tip.created_at)}</span>
                    </div>

                    <div style={{ padding:"14px 16px" }}>

                      {/* 장소명 */}
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                        <div style={{ width:32, height:32, borderRadius:9, background:"#E4EBDC", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <MapPin size={15} color="#5C7A4A" />
                        </div>
                        <div style={{ flex:1 }}>
                          <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#111" }}>{tip.place_name}</div>
                          <div style={{ fontSize:11, color:"#777", marginTop:1 }}>{tip.address}</div>
                        </div>
                      </div>

                      {/* ── 보류 탭: 필드별 수정 가능 ── */}
                      {isOnHold ? (
                        <div className="field-rows" style={{ background:"#fafafa", borderRadius:12, border:"1px solid #eee", padding:"4px 12px", marginBottom:12 }}>

                          <FieldRow icon={<MapPin size={12} color="#5C7A4A"/>}       label="장소명"   fieldKey="place_name" value={tip.place_name} proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                          <FieldRow icon={<MapPin size={12} color="#5C7A4A"/>}       label="주소"     fieldKey="address"    value={tip.address}    proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                          <FieldRow icon={<ChefHat size={12} color="#5C7A4A"/>}      label="카테고리" fieldKey="category"   value={tip.category}   proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />

                          {/* pet_zone 전용 수정 UI */}
                          <FieldRow
                            icon={<LandPlot size={12} color="#5C7A4A"/>} label="동반범위" fieldKey="pet_zone" value={tip.pet_zone}
                            proposalId={tip.id} editingField={editingField} editValue={editValue}
                            onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit}
                            renderEditInput={() => (
                              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                                {(["indoor","terrace","both"] as const).map(v => (
                                  <button key={v} onClick={() => setEditValue(v)} style={{
                                    padding:"4px 10px", borderRadius:8, border:`1.5px solid ${editValue===v?"#5C7A4A":"#ddd"}`,
                                    background: editValue===v ? "#5C7A4A" : "white",
                                    color: editValue===v ? "white" : "#555",
                                    fontSize:11, fontWeight:600, cursor:"pointer",
                                  }}>
                                    <PetZoneIcon zone={v} /> {PET_ZONE_LABEL[v]}
                                  </button>
                                ))}
                              </div>
                            )}
                          />

                          <FieldRow icon={<Clock size={12} color="#5C7A4A"/>}        label="영업시간" fieldKey="hours"      value={tip.hours}      proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />

                          {/* large_dog 전용 수정 UI */}
                          <FieldRow
                            icon={<Dog size={12} color="#5C7A4A"/>} label="대형견" fieldKey="large_dog" value={tip.large_dog}
                            proposalId={tip.id} editingField={editingField} editValue={editValue}
                            onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit}
                            renderEditInput={() => (
                              <div style={{ display:"flex", gap:5 }}>
                                {[{v:"true",label:"가능"},{v:"false",label:"불가"}].map(opt => (
                                  <button key={opt.v} onClick={() => setEditValue(opt.v)} style={{
                                    padding:"4px 14px", borderRadius:8, border:`1.5px solid ${editValue===opt.v?(opt.v==="true"?"#16a34a":"#dc2626"):"#ddd"}`,
                                    background: editValue===opt.v ? (opt.v==="true"?"#16a34a":"#dc2626") : "white",
                                    color: editValue===opt.v ? "white" : "#555",
                                    fontSize:11, fontWeight:600, cursor:"pointer",
                                    display:"flex", alignItems:"center", gap:4,
                                  }}>
                                    {opt.v==="true" ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}{opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          />

                          <FieldRow icon={<Phone size={12} color="#5C7A4A"/>}        label="전화번호" fieldKey="phone"      value={tip.phone}      proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                          <FieldRow icon={<Globe size={12} color="#5C7A4A"/>}        label="홈페이지" fieldKey="website"    value={tip.website}    proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                          <FieldRow icon={<CalendarOff size={12} color="#5C7A4A"/>}  label="휴무일"   fieldKey="closed_days" value={tip.closed_days} proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                          <FieldRow icon={<ParkingCircle size={12} color="#5C7A4A"/>} label="주차"    fieldKey="parking"    value={tip.parking}    proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                          <FieldRow icon={<Ticket size={12} color="#5C7A4A"/>}       label="입장료"   fieldKey="entry_fee"  value={tip.entry_fee}  proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                          {tip.category === "동물병원" && (
                            <>
                              <FieldRow icon={<Stethoscope size={12} color="#5C7A4A"/>} label="진료과목" fieldKey="specialty_department" value={tip.specialty_department} proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                              <FieldRow icon={<PawPrint size={12} color="#5C7A4A"/>}    label="가능 동물" fieldKey="treatable_animals" value={tip.treatable_animals} proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                            </>
                          )}
                          <FieldRow icon={<MessageCircle size={12} color="#5C7A4A"/>} label="메모"    fieldKey="memo"      value={tip.memo}       proposalId={tip.id} editingField={editingField} editValue={editValue} onEdit={startEdit} onEditValue={setEditValue} onSave={saveField} onCancel={cancelEdit} />
                        </div>
                      ) : (
                        /* 미처리/처리완료: 읽기 전용 뱃지 */
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
                          {tip.category && <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}><ChefHat size={11} color="#5C7A4A"/>{tip.category}</span>}
                          {tip.pet_zone && <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"inline-flex", alignItems:"center", gap:4 }}><PetZoneIcon zone={tip.pet_zone} /> {PET_ZONE_LABEL[tip.pet_zone]}</span>}
                          {tip.hours    && <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}><Clock size={11} color="#888"/>{tip.hours}</span>}
                          {tip.large_dog !== null && tip.large_dog !== undefined && (
                            <span style={{ fontSize:11, padding:"4px 10px", borderRadius:999, fontWeight:600, background: tip.large_dog?"#dcfce7":"#fee2e2", color: tip.large_dog?"#15803d":"#dc2626", display:"flex", alignItems:"center", gap:4 }}>
                              {tip.large_dog ? <CheckCircle2 size={11}/>:<XCircle size={11}/>}
                              {tip.large_dog ? "대형견 가능":"대형견 불가"}
                            </span>
                          )}
                          {tip.phone    && <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}><Phone size={11} color="#5C7A4A"/>{tip.phone}</span>}
                          {tip.website     && <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}><Globe size={11} color="#5C7A4A"/>{tip.website}</span>}
                          {tip.closed_days && <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}><CalendarOff size={11} color="#5C7A4A"/>{tip.closed_days}</span>}
                          {tip.parking     && <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}><ParkingCircle size={11} color="#5C7A4A"/>{tip.parking}</span>}
                          {tip.entry_fee   && <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}><Ticket size={11} color="#5C7A4A"/>{tip.entry_fee}</span>}
                          {tip.category === "동물병원" && (
                            <span style={{ fontSize:11, color:"#1d4ed8", background:"#eff6ff", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}>
                              <Stethoscope size={11} color="#2563eb"/>{tip.specialty_department || "종합진료"}
                            </span>
                          )}
                          {tip.category === "동물병원" && tip.treatable_animals && (
                            <span style={{ fontSize:11, color:"#1d4ed8", background:"#eff6ff", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}>
                              <PawPrint size={11} color="#2563eb"/>{tip.treatable_animals}
                            </span>
                          )}
                          {tip.memo     && <span style={{ fontSize:11, color:"#555", background:"#f5f6f8", padding:"6px 10px", borderRadius:10, width:"100%", lineHeight:1.6 }}>{tip.memo}</span>}
                        </div>
                      )}

                      {/* 이미지 갤러리 */}
                      {tip.image_urls?.length > 0 && (
                        <div style={{ marginBottom:12 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:"#888", marginBottom:7 }}>
                            <ImageIcon size={11} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />첨부 사진 {tip.image_urls.length}장
                          </div>
                          <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                            {tip.image_urls.map((url: string, idx: number) => (
                              <div key={idx} onClick={() => { setLightboxImages(tip.image_urls); setLightboxIndex(idx); }}
                                style={{ width:76, height:76, borderRadius:10, overflow:"hidden", border:"1px solid #e2e4e8", cursor:"pointer", flexShrink:0, position:"relative" }}>
                                <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                                <div style={{ position:"absolute", bottom:3, left:3, background:"rgba(0,0,0,0.5)", borderRadius:999, padding:"1px 5px", fontSize:9, color:"white", fontWeight:700 }}>
                                  {idx+1}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 제보자 */}
                      <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:12, padding:"6px 10px", background:"#f8fafc", borderRadius:8, border:"1px solid #e8eaed" }}>
                        <User size={12} color="#5C7A4A" />
                        <span style={{ fontSize:10, color:"#888", fontWeight:600 }}>{reporter.label}</span>
                        <span style={{ fontSize:11, color: reporter.isEmail ? "#2563eb" : "#999", fontWeight: reporter.isEmail ? 600 : 400 }}>
                          {reporter.value}
                        </span>
                      </div>

                      {/* ── 액션 버튼 ── */}
                      {tip.status !== "approved" && (
                        <div style={{ display:"flex", gap:8 }}>
                          {/* 보류 버튼 (미처리에서만) */}
                          {tip.status === "pending" && (
                            <button
                              className="action-btn ggk-body"
                              onClick={() => handleHold(tip.id)}
                              style={{
                                flex:1, padding:"10px 12px", borderRadius:11,
                                border:"1.5px solid #fde68a", background:"#fffbeb",
                                color:"#92400e", fontWeight:700, cursor:"pointer", fontSize:12,
                                display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                fontFamily:"'Noto Sans KR', sans-serif",
                              }}
                            >
                              <PauseCircle size={14} color="#f59e0b" />보류
                            </button>
                          )}

                          {/* 승인 버튼 */}
                          <button
                            className="action-btn ggk-body"
                            onClick={() => handleApprove(tip)}
                            style={{
                              flex:1, padding:"10px 14px", borderRadius:11, border:"none",
                              background:"linear-gradient(135deg, #22c55e, #16a34a)",
                              color:"white", fontWeight:700, cursor:"pointer", fontSize:12,
                              display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                              boxShadow:"0 2px 8px rgba(34,197,94,0.35)",
                              fontFamily:"'Noto Sans KR', sans-serif",
                            }}
                          >
                            <MapPinCheckInside size={14} />
                            {tip.proposal_kind === "info_update" ? "정보 반영" : tip.status === "on_hold" ? "장소 등록" : "승인"}
                          </button>

                          {/* 삭제 버튼 */}
                          <button
                            className="action-btn ggk-body"
                            onClick={() => handleDelete(tip.id)}
                            style={{
                              flex:1, padding:"10px 12px", borderRadius:11, border:"none",
                              background:"linear-gradient(135deg, #ef4444, #dc2626)",
                              color:"white", fontWeight:700, cursor:"pointer", fontSize:12,
                              display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                              boxShadow:"0 2px 8px rgba(239,68,68,0.30)",
                              fontFamily:"'Noto Sans KR', sans-serif",
                            }}
                          >
                            <Trash2 size={14} />삭제
                          </button>
                        </div>
                      )}

                      {/* 처리완료 안내 */}
                      {tip.status === "approved" && (
                        <div style={{ padding:"9px 12px", background:"#f0fdf4", borderRadius:10, border:"1px solid #bbf7d0", display:"flex", alignItems:"center", gap:6 }}>
                          <CheckCircle size={14} color="#16a34a" />
                          <span style={{ fontSize:12, color:"#15803d", fontWeight:600 }}>지도에 장소가 등록되었습니다</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── 이미지 라이트박스 ── */}
      {lightboxImages.length > 0 && (
        <div onClick={() => setLightboxImages([])}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position:"relative", display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={() => setLightboxImages([])} style={{ position:"absolute", top:-44, right:0, width:34, height:34, borderRadius:"50%", border:"none", background:"rgba(0,0,0,0.55)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <X size={16} color="white" />
            </button>
            <button onClick={() => setLightboxIndex((lightboxIndex-1+lightboxImages.length)%lightboxImages.length)} style={{ width:40, height:40, borderRadius:"50%", border:"none", background:"rgba(255,255,255,0.15)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <ChevronLeft size={22} color="white" />
            </button>
            <div style={{ position:"relative" }}>
              <img src={lightboxImages[lightboxIndex]} alt="" style={{ maxWidth:"75vw", maxHeight:"82vh", borderRadius:14, objectFit:"contain", display:"block" }} />
              <div style={{ position:"absolute", bottom:12, left:"50%", transform:"translateX(-50%)", background:"rgba(0,0,0,0.5)", color:"white", fontSize:12, fontWeight:600, padding:"4px 12px", borderRadius:999 }}>
                {lightboxIndex+1} / {lightboxImages.length}
              </div>
            </div>
            <button onClick={() => setLightboxIndex((lightboxIndex+1)%lightboxImages.length)} style={{ width:40, height:40, borderRadius:"50%", border:"none", background:"rgba(255,255,255,0.15)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <ChevronRight size={22} color="white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}