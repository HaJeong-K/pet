"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, FileText, CheckCircle, MapPin,
  Clock, PawPrint, RefreshCw, AlertCircle, ChevronRight,
} from "lucide-react";

const STYLES = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  .ggk-logo { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
  .ggk-body  { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }
  .tip-card { transition: box-shadow 0.18s ease, transform 0.18s ease; }
  .tip-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.10) !important; transform: translateY(-1px); }
  .action-btn { transition: all 0.15s ease; }
  .action-btn:hover { filter: brightness(0.94); }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 999px; }
  ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
`;

const PET_ZONE_LABEL: Record<string, string> = {
  indoor:  "실내 가능",
  terrace: "테라스 가능",
  both:    "실내외 가능",
};

const formatDate = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

export default function AdminTipsPage() {
  const router = useRouter();
  const [isChecking,    setIsChecking]    = useState(true);
  const [tips,          setTips]          = useState<any[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [activeFilter,  setActiveFilter]  = useState<"pending"|"done">("pending");

  /* ── 관리자 인증 ── */
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login?redirect=/admin/tips"); return; }
      const { data: profile } = await supabase
        .from("users").select("is_admin").eq("auth_user_id", session.user.id).single();
      if (!profile?.is_admin) { router.push("/"); return; }
      setIsChecking(false);
      fetchTips();
    };
    checkAdmin();
  }, []);

  const fetchTips = async () => {
    setLoading(true);
    // "tip" 타입 제보를 reports 테이블에서 가져옴
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("type", "tip")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("제보 불러오기 오류:", error);
      setLoading(false);
      return;
    }
    setTips(data || []);
    setLoading(false);
  };

  const handleMarkDone = async (tipId: number) => {
    await supabase.from("reports").update({ is_resolved: true }).eq("id", tipId);
    fetchTips();
  };

  const handleMarkPending = async (tipId: number) => {
    await supabase.from("reports").update({ is_resolved: false }).eq("id", tipId);
    fetchTips();
  };

  const pendingTips = tips.filter((t) => !t.is_resolved);
  const doneTips    = tips.filter((t) =>  t.is_resolved);
  const displayTips = activeFilter === "pending" ? pendingTips : doneTips;

  if (isChecking) {
    return (
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f0f2f5" }}>
        <div className="ggk-body" style={{ fontSize:13, color:"#888" }}>권한 확인 중...</div>
      </div>
    );
  }

  return (
    <>
      <style>{STYLES}</style>

      <div className="ggk-body" style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#f0f2f5", overflow:"hidden", alignItems:"center" }}>

        {/* ── 내부 콘텐츠 래퍼 ── */}
        <div style={{ width:"100%", maxWidth:"480px", display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

          {/* ── 헤더 ── */}
          <div style={{
            background:"white", borderBottom:"1px solid #e8eaed",
            padding:"14px 20px", display:"flex", alignItems:"center", gap:"12px",
            flexShrink:0, boxShadow:"0 1px 6px rgba(0,0,0,0.05)", zIndex:10,
          }}>
            <button onClick={() => router.push("/")} style={{ border:"none", background:"transparent", cursor:"pointer", padding:4, borderRadius:8, display:"flex" }}>
              <ArrowLeft size={20} color="#444" />
            </button>

            <div style={{ display:"flex", alignItems:"center", gap:"8px", flex:1 }}>
              <div style={{ width:32, height:32, borderRadius:10, background:"#ede9fe", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <FileText size={16} color="#8b5cf6" />
              </div>
              <div className="ggk-logo" style={{ fontSize:16, fontWeight:800, color:"#111" }}>제보 관리</div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {pendingTips.length > 0 && (
                <div style={{ background:"#8b5cf6", color:"white", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999 }}>
                  미처리 {pendingTips.length}건
                </div>
              )}
              <button
                onClick={fetchTips}
                style={{ border:"none", background:"#f5f6f8", borderRadius:8, padding:"6px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:11, fontWeight:600, color:"#555" }}
              >
                <RefreshCw size={13} color="#888" />
                새로고침
              </button>
            </div>
          </div>

          {/* ── 필터 탭 ── */}
          <div style={{ padding:"14px 16px 10px", flexShrink:0 }}>
            <div style={{ display:"flex", background:"#e8eaed", borderRadius:12, padding:"3px", gap:"3px" }}>
              {([
                { key:"pending", label:"미처리",  count: pendingTips.length, icon: AlertCircle, color:"#8b5cf6" },
                { key:"done",    label:"처리완료", count: doneTips.length,   icon: CheckCircle, color:"#22c55e" },
              ] as const).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className="ggk-body"
                    style={{
                      flex:1, padding:"9px 14px", borderRadius:10, border:"none",
                      background: isActive ? "white" : "transparent",
                      fontWeight:700, fontSize:12, color: isActive ? "#111" : "#888",
                      cursor:"pointer",
                      boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                      transition:"all 0.15s ease",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                    }}
                  >
                    <Icon size={13} color={isActive ? tab.color : "#aaa"} />
                    {tab.label}
                    <span style={{
                      fontSize:10, fontWeight:800, padding:"1px 7px", borderRadius:999,
                      background: isActive
                        ? (tab.key === "pending" ? "#f3e8ff" : "#dcfce7")
                        : "#f0f2f5",
                      color: isActive
                        ? (tab.key === "pending" ? "#7c3aed" : "#16a34a")
                        : "#999",
                    }}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 리스트 영역 (스크롤 가능) ── */}
          <div style={{
            flex:1, minHeight:0, overflowY:"auto",
            padding:"0 16px 100px",
            scrollbarWidth:"thin",
            scrollbarColor:"#d1d5db transparent",
          }}>
            {loading ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#bbb", fontSize:13 }}>불러오는 중...</div>
            ) : displayTips.length === 0 ? (
              <div style={{ textAlign:"center", padding:"80px 0" }}>
                <div style={{ width:64, height:64, borderRadius:20, background:"#f3e8ff", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                  {activeFilter === "pending"
                    ? <FileText size={28} color="#d1d5db" />
                    : <CheckCircle size={28} color="#22c55e" />}
                </div>
                <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#222", marginBottom:6 }}>
                  {activeFilter === "pending" ? "미처리 제보가 없습니다" : "처리완료 제보가 없습니다"}
                </div>
                <div style={{ fontSize:12, color:"#999" }}>
                  {activeFilter === "pending" ? "들어온 제보가 없거나 모두 처리되었습니다" : "처리된 제보가 여기에 표시됩니다"}
                </div>
              </div>
            ) : (
              displayTips.map((tip) => (
                <div
                  key={tip.id}
                  className="tip-card"
                  style={{
                    background:"white",
                    borderRadius:20,
                    border:`1.5px solid ${tip.is_resolved ? "#e8eaed" : "#ddd6fe"}`,
                    marginBottom:12,
                    overflow:"hidden",
                    boxShadow:"0 3px 12px rgba(0,0,0,0.05)",
                    opacity: tip.is_resolved ? 0.8 : 1,
                  }}
                >
                  {/* 카드 헤더 */}
                  <div style={{
                    padding:"12px 16px",
                    background: tip.is_resolved ? "#f8fafc" : "#f5f3ff",
                    borderBottom:`1px solid ${tip.is_resolved ? "#e8eaed" : "#ddd6fe"}`,
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{
                        fontSize:10, padding:"3px 9px", borderRadius:999, fontWeight:700,
                        background: tip.is_resolved ? "#dcfce7" : "#ede9fe",
                        color: tip.is_resolved ? "#15803d" : "#6d28d9",
                        display:"flex", alignItems:"center", gap:3,
                      }}>
                        {tip.is_resolved ? <><CheckCircle size={9}/>처리완료</> : "📋 처리 대기"}
                      </span>
                    </div>
                    <span style={{ fontSize:10, color:"#aaa" }}>{formatDate(tip.created_at)}</span>
                  </div>

                  <div style={{ padding:"14px 16px" }}>
                    {tip.place_name && (
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                        <div style={{ width:28, height:28, borderRadius:8, background:"#f3e8ff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <MapPin size={13} color="#8b5cf6" />
                        </div>
                        <div>
                          <div className="ggk-logo" style={{ fontSize:14, fontWeight:700, color:"#111" }}>{tip.place_name}</div>
                          {tip.address && <div style={{ fontSize:11, color:"#888", marginTop:1 }}>{tip.address}</div>}
                        </div>
                      </div>
                    )}

                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: (tip.content || tip.report_reason) ? 10 : 0 }}>
                      {tip.category && (
                        <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"#666", background:"#f5f6f8", padding:"4px 9px", borderRadius:999, fontWeight:500 }}>
                          <PawPrint size={11} color="#8b5cf6" />{tip.category}
                        </span>
                      )}
                      {tip.hours && (
                        <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"#666", background:"#f5f6f8", padding:"4px 9px", borderRadius:999, fontWeight:500 }}>
                          <Clock size={11} color="#888" />{tip.hours}
                        </span>
                      )}
                      {tip.pet_zone && (
                        <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"#666", background:"#f5f6f8", padding:"4px 9px", borderRadius:999, fontWeight:500 }}>
                          🐾 {PET_ZONE_LABEL[tip.pet_zone] || tip.pet_zone}
                        </span>
                      )}
                    </div>

                    {(tip.content || tip.report_reason || tip.description) && (
                      <div style={{ padding:"10px 13px", background:"#fafafa", borderRadius:10, border:"1px solid #eee", marginBottom:12 }}>
                        <div style={{ fontSize:10, color:"#aaa", fontWeight:700, letterSpacing:"0.3px", marginBottom:5 }}>제보 내용</div>
                        <div style={{ fontSize:13, color:"#333", lineHeight:1.7 }}>
                          {tip.content || tip.report_reason || tip.description}
                        </div>
                      </div>
                    )}

                    {(tip.nickname || tip.reporter_key) && (
                      <div style={{ fontSize:11, color:"#bbb", marginBottom:12 }}>
                        제보자: {tip.nickname || (tip.reporter_key?.slice(0,8) + "...")}
                      </div>
                    )}

                    {!tip.is_resolved ? (
                      <button
                        className="action-btn ggk-body"
                        onClick={() => handleMarkDone(tip.id)}
                        style={{
                          width:"100%", padding:"10px 14px", borderRadius:11, border:"none",
                          background:"linear-gradient(135deg, #8b5cf6, #7c3aed)",
                          color:"white", fontWeight:700, cursor:"pointer", fontSize:12,
                          display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                          boxShadow:"0 2px 8px rgba(139,92,246,0.30)",
                          fontFamily:"'Noto Sans KR', sans-serif",
                        }}
                      >
                        <CheckCircle size={14} />
                        처리완료 표시
                      </button>
                    ) : (
                      <button
                        className="action-btn ggk-body"
                        onClick={() => handleMarkPending(tip.id)}
                        style={{
                          width:"100%", padding:"9px 14px", borderRadius:11,
                          border:"1px solid #e8eaed", background:"white",
                          color:"#888", fontWeight:600, cursor:"pointer", fontSize:12,
                          display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                          fontFamily:"'Noto Sans KR', sans-serif",
                        }}
                      >
                        미처리로 되돌리기
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

        </div>{/* 내부 콘텐츠 래퍼 끝 */}
      </div>{/* 전체 페이지 끝 */}
    </>
  );
}