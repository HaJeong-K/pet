"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import PetIllustration from "@/components/illustrations/PetIllustration";
import {
  Crown, MapPin, Clock, AlertCircle, CheckCircle, XCircle,
  User, MessageCircle, CalendarClock,
} from "lucide-react";

// 사장님이 마이페이지에서 신청한 프리미엄 등록(premium_requests)을 관리자가
// 승인/거절하는 페이지입니다. 결제대행(PG) 연동 전이라 무통장입금 확인 후
// 수동 승인하는 흐름을 전제로 합니다 — 승인 시 서버(/api/admin/premium)가
// places.is_premium/premium_expires_at을 갱신합니다.

const STYLES = `
  * { box-sizing: border-box; }
  .premium-card { transition: box-shadow 0.18s ease; }
  .premium-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.10) !important; }
  .action-btn { transition: all 0.15s ease; }
  .action-btn:hover { filter: brightness(0.93); }
  ::-webkit-scrollbar { width:6px; }
  ::-webkit-scrollbar-thumb { background:#d1d5db; border-radius:999px; }
`;

const formatDate = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

type ActiveFilter = "pending" | "approved" | "rejected";

export default function AdminPremiumPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [placeNames, setPlaceNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("pending");
  const [processingId, setProcessingId] = useState<number | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("premium_requests")
      .select("*")
      .order("requested_at", { ascending: false });

    if (error) {
      console.error("[admin/premium] 조회 실패:", error.message);
      setLoading(false);
      return;
    }
    const list = data || [];
    setRequests(list);

    const placeIds = Array.from(new Set(list.map((r) => r.place_id)));
    if (placeIds.length > 0) {
      const { data: places } = await supabase.from("places").select("id, name").in("id", placeIds);
      const map: Record<number, string> = {};
      (places || []).forEach((p: any) => { map[p.id] = p.name; });
      setPlaceNames(map);
    }
    setLoading(false);
  };

  const handleAction = async (request: any, action: "approve" | "reject") => {
    if (action === "reject" && !confirm("이 신청을 거절하시겠습니까?")) return;
    setProcessingId(request.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert("로그인이 필요합니다."); return; }
      const res = await fetch("/api/admin/premium", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ requestId: request.id, action }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`처리 실패: ${data.error || "알 수 없는 오류"}`); return; }
      setRequests((prev) => prev.map((r) => r.id === request.id ? { ...r, status: action === "approve" ? "approved" : "rejected" } : r));
      alert(action === "approve" ? "승인되었습니다. 장소에 프리미엄이 적용됩니다." : "거절 처리되었습니다.");
    } finally {
      setProcessingId(null);
    }
  };

  const pendingList  = requests.filter((r) => r.status === "pending");
  const approvedList = requests.filter((r) => r.status === "approved");
  const rejectedList = requests.filter((r) => r.status === "rejected");
  const displayList =
    activeFilter === "pending"  ? pendingList  :
    activeFilter === "approved" ? approvedList : rejectedList;

  return (
    <>
      <style>{STYLES}</style>

      <div className="ggk-body" style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#F7F3E8", overflow:"hidden", alignItems:"center" }}>
        <AdminNav active="premium" onRefresh={fetchRequests} />
        <div style={{ width:"100%", maxWidth:"1200px", display:"flex", flexDirection:"column", flex:1, minHeight:0, overflow:"hidden" }}>

          <div style={{ padding:"16px 28px 10px", flexShrink:0 }}>
            <div style={{ display:"flex", background:"#e8eaed", borderRadius:12, padding:"3px", gap:"3px" }}>
              {([
                { key:"pending",  label:"심사 대기", count: pendingList.length,  icon: <AlertCircle size={13}/>,  activeColor:"#B8860B", activeBg:"#ffe9c2" },
                { key:"approved", label:"승인 완료", count: approvedList.length, icon: <CheckCircle size={13}/>,  activeColor:"#22c55e", activeBg:"#dcfce7" },
                { key:"rejected", label:"거절",       count: rejectedList.length, icon: <XCircle size={13}/>,     activeColor:"#ef4444", activeBg:"#fee2e2" },
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

          <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"0 28px 60px", scrollbarWidth:"thin" }}>
            {loading ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#bbb", fontSize:13 }}>불러오는 중...</div>
            ) : displayList.length === 0 ? (
              <div style={{ textAlign:"center", padding:"80px 0" }}>
                <div style={{ width:64, height:64, borderRadius:20, background:"#ffe9c2", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
                  <PetIllustration variant="empty" width={44} />
                </div>
                <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#222" }}>
                  {activeFilter === "pending" ? "심사 대기 중인 신청이 없습니다" :
                   activeFilter === "approved" ? "승인 완료 내역이 없습니다" : "거절 내역이 없습니다"}
                </div>
              </div>
            ) : (
              displayList.map((req) => (
                <div key={req.id} className="premium-card" style={{
                  background:"white", borderRadius:20, marginBottom:16, overflow:"hidden",
                  border:`1.5px solid ${req.status === "pending" ? "#f3d9a4" : req.status === "approved" ? "#bbf7d0" : "#fecaca"}`,
                  boxShadow:"0 3px 12px rgba(0,0,0,0.05)",
                }}>
                  <div style={{
                    padding:"11px 16px",
                    background: req.status === "pending" ? "#fff8ec" : req.status === "approved" ? "#f0fdf4" : "#fff5f5",
                    borderBottom:`1px solid ${req.status === "pending" ? "#f3d9a4" : req.status === "approved" ? "#bbf7d0" : "#fecaca"}`,
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                  }}>
                    <span style={{
                      fontSize:10, padding:"3px 10px", borderRadius:999, fontWeight:700,
                      background: req.status === "pending" ? "#ffe9c2" : req.status === "approved" ? "#dcfce7" : "#fee2e2",
                      color: req.status === "pending" ? "#92650a" : req.status === "approved" ? "#15803d" : "#dc2626",
                      display:"flex", alignItems:"center", gap:4,
                    }}>
                      {req.status === "pending"  && <><AlertCircle size={9}/>심사 대기</>}
                      {req.status === "approved" && <><CheckCircle size={9}/>승인 완료</>}
                      {req.status === "rejected" && <><XCircle size={9}/>거절됨</>}
                    </span>
                    <span style={{ fontSize:10, color:"#aaa" }}>{formatDate(req.requested_at)}</span>
                  </div>

                  <div style={{ padding:"14px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                      <div style={{ width:32, height:32, borderRadius:9, background:"#ffe9c2", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <Crown size={15} color="#B8860B" />
                      </div>
                      <div style={{ flex:1 }}>
                        <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#111", display:"flex", alignItems:"center", gap:6 }}>
                          <MapPin size={12} color="#5C7A4A" />{placeNames[req.place_id] || `장소 #${req.place_id}`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
                      <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}>
                        <CalendarClock size={11} color="#5C7A4A"/>{req.months}개월 신청
                      </span>
                      {req.payer_name && (
                        <span style={{ fontSize:11, color:"#444", background:"#f5f6f8", padding:"4px 10px", borderRadius:999, display:"flex", alignItems:"center", gap:4 }}>
                          <User size={11} color="#5C7A4A"/>입금자명: {req.payer_name}
                        </span>
                      )}
                      {req.memo && (
                        <span style={{ fontSize:11, color:"#555", background:"#f5f6f8", padding:"6px 10px", borderRadius:10, width:"100%", lineHeight:1.6, display:"flex", gap:4 }}>
                          <MessageCircle size={11} color="#888" style={{ flexShrink:0, marginTop:2 }}/>{req.memo}
                        </span>
                      )}
                      {req.admin_note && (
                        <span style={{ fontSize:11, color:"#991b1b", background:"#fff5f5", padding:"6px 10px", borderRadius:10, width:"100%", lineHeight:1.6, border:"1px solid #fecaca" }}>
                          관리자 메모: {req.admin_note}
                        </span>
                      )}
                    </div>

                    {req.status === "pending" && (
                      <div style={{ display:"flex", gap:8 }}>
                        <button
                          className="action-btn ggk-body"
                          disabled={processingId === req.id}
                          onClick={() => handleAction(req, "approve")}
                          style={{
                            flex:1, padding:"10px 14px", borderRadius:11, border:"none",
                            background:"linear-gradient(135deg, #D4A24C, #B8860B)",
                            color:"white", fontWeight:700, cursor: processingId === req.id ? "default" : "pointer", fontSize:12,
                            display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                            boxShadow:"0 2px 8px rgba(184,134,11,0.30)",
                            fontFamily:"'Noto Sans KR', sans-serif",
                            opacity: processingId === req.id ? 0.6 : 1,
                          }}
                        >
                          <Crown size={14} />승인(입금 확인됨)
                        </button>
                        <button
                          className="action-btn ggk-body"
                          disabled={processingId === req.id}
                          onClick={() => handleAction(req, "reject")}
                          style={{
                            flex:1, padding:"10px 12px", borderRadius:11,
                            border:"1.5px solid #fecaca", background:"#fff5f5",
                            color:"#dc2626", fontWeight:700, cursor: processingId === req.id ? "default" : "pointer", fontSize:12,
                            display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                            fontFamily:"'Noto Sans KR', sans-serif",
                            opacity: processingId === req.id ? 0.6 : 1,
                          }}
                        >
                          <XCircle size={14} />거절
                        </button>
                      </div>
                    )}

                    {req.status === "approved" && (
                      <div style={{ padding:"9px 12px", background:"#f0fdf4", borderRadius:10, border:"1px solid #bbf7d0", display:"flex", alignItems:"center", gap:6 }}>
                        <CheckCircle size={14} color="#16a34a" />
                        <span style={{ fontSize:12, color:"#15803d", fontWeight:600 }}>프리미엄이 적용되었습니다</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
