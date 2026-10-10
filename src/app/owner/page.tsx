"use client";

// ── 사장님 페이지(/owner) ──
// 인증된 사장님 전용 화면. 예전에는 마이페이지 "설정" 안에 흩어져 있던 가게 정보 수정·통계·프리미엄 신청을
// 한곳에 모으고, 고객 후기 답글 관리와 성과 보고서를 더했습니다. 하단 탭의 "사장님"으로 들어옵니다.
//   · 대시보드 — 조회·찜·길찾기·전화 등 성과 지표(OwnerStatsPanel)
//   · 후기·답글 — 내 가게 후기와 사장님 답글 여부, 답글 달러 가기
//   · 가게 정보 — 영업시간·동반 조건 등 직접 수정(OwnerPlaceEditPanel)
//   · 광고 상품 — 프리미엄 요금 안내와 신청(결제 연동 전: 신청 → 입금 안내 → 관리자 승인)
//   · 성과 보고서 — 최근 30일 요약(인쇄·PDF 저장)
// 관리자는 등록 장소를 골라 사장님과 똑같은 화면을 모두 볼 수 있습니다. 평소에는 보기만 하고,
// 사장님 요청이 있을 때 "대신 처리" 스위치를 켜면 가게 정보 수정과 광고 상품 신청을 대신 할 수 있습니다
// (실수로 바꾸지 않도록 스위치를 켜야만 수정·신청 버튼이 열립니다).

import LogoLoader from "@/components/LogoLoader";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Store, BarChart3, MessageCircle, Pencil, Crown, FileText, BadgeCheck, Check, Printer, ChevronRight, Search,
} from "lucide-react";
import OwnerStatsPanel, { fetchOwnerStats, type OwnerStats } from "@/components/OwnerStatsPanel";
import OwnerPlaceEditPanel from "@/components/OwnerPlaceEditPanel";
import { OWNER_PLANS, PROMO_STEPS, PREMIUM_MONTHLY_PRICE, quote, won } from "@/lib/ownerPlans";
import { isPlacePremiumNow } from "@/lib/premium";

type TabKey = "dashboard" | "reviews" | "place" | "ads" | "report";
const TABS: { key: TabKey; label: string; Icon: typeof Store }[] = [
  { key: "dashboard", label: "대시보드", Icon: BarChart3 },
  { key: "reviews", label: "후기·답글", Icon: MessageCircle },
  { key: "place", label: "가게 정보", Icon: Pencil },
  { key: "ads", label: "광고 상품", Icon: Crown },
  { key: "report", label: "성과 보고서", Icon: FileText },
];

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "");

export default function OwnerPage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "guest" | "none" | "pending" | "ready">("loading");
  const [profile, setProfile] = useState<any>(null);
  const [tab, setTab] = useState<TabKey>("dashboard");
  // 관리자 미리보기용으로 고른 장소
  const [preview, setPreview] = useState<{ id: number; name: string } | null>(null);
  const [previewQuery, setPreviewQuery] = useState("");
  const [previewResults, setPreviewResults] = useState<{ id: number; name: string; address: string | null }[]>([]);
  // 관리자 "대신 처리" 스위치 — 꺼져 있으면 보기 전용
  const [actForOwner, setActForOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) { setState("guest"); return; }
      const { data } = await supabase.from("users").select("is_admin, owner_status, owner_place_id, owner_business_name").eq("auth_user_id", session.user.id).maybeSingle();
      if (cancelled) return;
      setProfile(data);
      if (data?.owner_status === "verified" && data?.owner_place_id != null) setState("ready");
      else if (data?.is_admin) setState("ready");
      else if (data?.owner_status === "pending") setState("pending");
      else setState("none");
    })();
    return () => { cancelled = true; };
  }, []);

  const isVerifiedOwner = profile?.owner_status === "verified" && profile?.owner_place_id != null;
  const isPreview = !isVerifiedOwner && !!profile?.is_admin;
  const placeId: number | null = isVerifiedOwner ? Number(profile.owner_place_id) : preview?.id ?? null;

  // 관리자 미리보기: 장소 이름으로 검색
  useEffect(() => {
    if (!isPreview) return;
    const term = previewQuery.trim();
    const timer = setTimeout(async () => {
      let q = supabase.from("places").select("id, name, address").order("id", { ascending: false }).limit(8);
      if (term) q = q.ilike("name", `%${term.replace(/[%_]/g, "")}%`);
      const { data } = await q;
      setPreviewResults(data || []);
    }, 250);
    return () => clearTimeout(timer);
  }, [previewQuery, isPreview]);

  if (state === "loading") return <Shell><div style={{ textAlign: "center", padding: "80px 0", color: "#999", fontSize: 13 }}><LogoLoader /></div></Shell>;

  if (state !== "ready") {
    const message = state === "guest"
      ? { title: "사장님 페이지는 로그인 후 이용할 수 있어요", text: "가게를 직접 관리하고 고객 후기에 답글을 달아 보세요.", cta: "로그인", href: "/login" }
      : state === "pending"
        ? { title: "사장님 인증을 확인하고 있어요", text: "사업자 정보를 확인하는 중이에요. 승인되면 이 페이지에서 가게를 관리할 수 있어요.", cta: "지도로 돌아가기", href: "/" }
        : { title: "아직 사장님 인증 전이에요", text: "사업자 인증을 마치면 가게 정보 관리, 사장님 답글, 통계를 이용할 수 있어요.", cta: "사장님 등록하기", href: "/signup-owner" };
    return (
      <Shell>
        <div style={{ ...card, textAlign: "center", padding: "48px 22px", marginTop: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Store size={26} color="#B45309" /></div>
          <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: "#222" }}>{message.title}</div>
          <div style={{ fontSize: 13.5, color: "#777", marginTop: 8, lineHeight: 1.7 }}>{message.text}</div>
          <button onClick={() => router.push(message.href)} style={{ marginTop: 18, padding: "12px 22px", borderRadius: 999, border: "none", background: "#B45309", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{message.cta}</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* 머리말 */}
      <div style={{ borderRadius: 20, background: "linear-gradient(135deg,#B45309,#D97706)", color: "white", padding: "20px 20px", marginTop: 16 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.2)", fontSize: 11.5, fontWeight: 800 }}>
          <BadgeCheck size={12} />{isPreview ? "관리자 모드" : "인증된 사장님"}
        </div>
        <div className="ggk-logo" style={{ fontSize: 21, fontWeight: 800, marginTop: 8 }}>
          {isPreview ? preview?.name ?? "가게를 골라 주세요" : profile?.owner_business_name || "내 가게"}
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 3 }}>가게 성과를 확인하고, 고객과 직접 이야기해 보세요.</div>
      </div>

      {isPreview && (
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#555", marginBottom: 8 }}>가게 고르기(관리자 전용) — 사장님이 보는 화면 그대로 확인할 수 있어요</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10, border: "1px solid #e2e4e8", background: "#f8fafc" }}>
            <Search size={14} color="#999" />
            <input value={previewQuery} onChange={(e) => setPreviewQuery(e.target.value)} placeholder="등록 장소 이름으로 검색" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13 }} />
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {previewResults.map((p) => (
              <button key={p.id} onClick={() => { setPreview({ id: p.id, name: p.name }); setActForOwner(false); }} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 9, border: "none", background: preview?.id === p.id ? "#FEF3C7" : "transparent", cursor: "pointer", fontSize: 12.5 }}>
                <b>{p.name}</b> <span style={{ color: "#999" }}>{p.address}</span>
              </button>
            ))}
          </div>
          {preview && (
            <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 12, padding: "11px 12px", borderRadius: 12, background: actForOwner ? "#FEF2F2" : "#f8fafc", border: `1px solid ${actForOwner ? "#FECACA" : "#e2e4e8"}`, cursor: "pointer" }}>
              <input type="checkbox" checked={actForOwner} onChange={(e) => setActForOwner(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 12.5, lineHeight: 1.6, color: actForOwner ? "#991b1b" : "#555" }}>
                <b>사장님 요청으로 대신 처리하기</b><br />
                켜면 이 가게의 정보 수정과 광고 상품 신청을 대신 할 수 있어요. 꺼 두면 보기만 해요.
              </span>
            </label>
          )}
        </div>
      )}

      {/* 탭 */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", margin: "14px 0 12px" }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined} style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 11,
            border: tab === key ? "none" : "1px solid #e8e2d2", background: tab === key ? "#B45309" : "white", color: tab === key ? "white" : "#555",
            fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {placeId == null ? (
        <div style={{ ...card, textAlign: "center", color: "#999", fontSize: 13, padding: "40px 0" }}>위에서 가게를 골라 주세요.</div>
      ) : (
        <>
          {tab === "dashboard" && <div style={card}><OwnerStatsPanel previewPlaceId={isPreview ? placeId : undefined} /></div>}
          {tab === "reviews" && <ReviewsTab placeId={placeId} isPreview={isPreview} />}
          {tab === "place" && <PlaceTab placeId={placeId} isPreview={isPreview} canAct={!isPreview || actForOwner} />}
          {tab === "ads" && <AdsTab placeId={placeId} isPreview={isPreview} canAct={!isPreview || actForOwner} />}
          {tab === "report" && <ReportTab placeId={placeId} isPreview={isPreview} />}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // 사이트 전체의 body가 overflow:hidden(지도 화면용)이라, 페이지 자체를 스크롤 영역으로 둡니다.
  return (
    <div className="ggk-body owner-page" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <style>{`
        @media print {
          body { overflow: visible !important; }
          .owner-page { height: auto !important; overflow: visible !important; background: white !important; }
          .owner-no-print, [data-guide="tabbar"] { display: none !important; }
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: 760, margin: "0 auto", padding: "0 16px var(--ggk-tabbar-space)", boxSizing: "border-box" }}>{children}</div>
    </div>
  );
}

/* ── 후기·답글 ── */
function ReviewsTab({ placeId, isPreview }: { placeId: number; isPreview: boolean }) {
  const router = useRouter();
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchOwnerStats(isPreview ? placeId : undefined).then((r) => { if (!cancelled) { setStats(r.stats); setError(r.error); } });
    return () => { cancelled = true; };
  }, [placeId, isPreview]);

  if (error) return <div style={{ ...card, color: "#999", fontSize: 13 }}>{error}</div>;
  if (!stats) return <div style={{ ...card, color: "#999", fontSize: 13, textAlign: "center" }}><LogoLoader /></div>;
  const reviews = stats.recentReviews ?? [];
  const waiting = reviews.filter((r) => !r.ownerReplied).length;

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>고객 후기 {reviews.length}건</div>
        {waiting > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>답글 대기 {waiting}건</span>}
      </div>
      <div style={{ fontSize: 12.5, color: "#888", marginTop: 4, lineHeight: 1.6 }}>
        내 가게 후기에 답글을 달면 고객에게 <b style={{ color: "#B45309" }}>사장님</b> 배지와 함께 보여요. 답글은 가게 상세 화면에서 달 수 있어요.
      </div>
      <button onClick={() => router.push(`/place/${placeId}`)} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 10, border: "none", background: "#B45309", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        내 가게 상세에서 답글 달기
      </button>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {reviews.length === 0 && <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: "24px 0" }}>아직 후기가 없어요.</div>}
        {reviews.map((r) => (
          <button key={r.id} onClick={() => router.push(`/place/${placeId}`)} style={{ textAlign: "left", padding: "11px 12px", borderRadius: 12, border: "1px solid #f0ece0", background: r.ownerReplied ? "#fafafa" : "#FFFBEB", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#999" }}>
                <b style={{ color: "#444" }}>{r.nickname}</b>
                <span>{fmtDate(r.created_at)}</span>
                <span style={{ fontWeight: 800, color: r.ownerReplied ? "#15803d" : "#B45309" }}>{r.ownerReplied ? "답글 완료" : "답글 대기"}</span>
              </div>
              <div style={{ marginTop: 3, fontSize: 13, color: "#333", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{r.content}</div>
            </div>
            <ChevronRight size={14} color="#ccc" style={{ flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── 가게 정보 ── */
function PlaceTab({ placeId, isPreview, canAct }: { placeId: number; isPreview: boolean; canAct: boolean }) {
  const [place, setPlace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from("places").select("id, name, address, hours, phone, closed_days, pet_zone, parking, entry_fee, website, memo").eq("id", placeId).maybeSingle()
      .then(({ data }) => { if (!cancelled) { setPlace(data || null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [placeId]);

  if (loading) return <div style={{ ...card, color: "#999", fontSize: 13, textAlign: "center" }}><LogoLoader /></div>;
  if (!place) return <div style={{ ...card, color: "#999", fontSize: 13 }}>가게 정보를 찾을 수 없어요.</div>;
  const rows: [string, string | null][] = [["주소", place.address], ["영업시간", place.hours], ["휴무일", place.closed_days], ["전화번호", place.phone], ["주차", place.parking], ["입장료", place.entry_fee], ["홈페이지", place.website], ["메모", place.memo]];
  return (
    <div style={card}>
      <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>{place.name}</div>
      <div style={{ fontSize: 12.5, color: "#888", margin: "4px 0 12px", lineHeight: 1.6 }}>고객이 가장 먼저 확인하는 정보예요. 영업시간과 동반 조건을 최신으로 유지해 주세요.</div>
      <div style={{ border: "1px solid #f0ece0", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
        {rows.map(([label, value], i) => (
          <div key={label} style={{ display: "flex", gap: 10, padding: "9px 12px", borderTop: i ? "1px solid #f5f1e6" : "none", fontSize: 13 }}>
            <div style={{ width: 64, flexShrink: 0, color: "#999", fontWeight: 700 }}>{label}</div>
            <div style={{ flex: 1, minWidth: 0, color: value ? "#333" : "#c9c4b5", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{value || "아직 입력하지 않았어요"}</div>
          </div>
        ))}
      </div>
      {canAct
        ? (
          <>
            {isPreview && <div style={{ fontSize: 12, fontWeight: 700, color: "#991b1b", marginBottom: 8 }}>관리자가 사장님 요청으로 대신 수정하는 중이에요. 저장하면 바로 지도에 반영돼요.</div>}
            <OwnerPlaceEditPanel place={place} onUpdated={(fields) => setPlace((prev: any) => ({ ...prev, ...fields }))} />
          </>
        )
        : <div style={{ fontSize: 12, color: "#999" }}>보기 전용이에요. 대신 수정하려면 위의 "사장님 요청으로 대신 처리하기"를 켜 주세요.</div>}
    </div>
  );
}

/* ── 광고 상품 ── */
function AdsTab({ placeId, isPreview, canAct }: { placeId: number; isPreview: boolean; canAct: boolean }) {
  const [place, setPlace] = useState<any>(null);
  const [latest, setLatest] = useState<any>(null);
  const [usedMonths, setUsedMonths] = useState(0);
  const [months, setMonths] = useState(3);
  const [payerName, setPayerName] = useState("");
  const [memo, setMemo] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const [{ data: p }, { data: reqs }] = await Promise.all([
      supabase.from("places").select("is_premium, premium_expires_at").eq("id", placeId).maybeSingle(),
      supabase.from("premium_requests").select("status, months, requested_at, admin_note").eq("place_id", placeId).order("requested_at", { ascending: false }).limit(50),
    ]);
    setPlace(p || null);
    setLatest(reqs?.[0] ?? null);
    // 지금까지 승인된 개월 수 — 할인 구간(첫 달 무료·2~3개월째 반값)을 이어서 계산하는 데 씁니다.
    setUsedMonths((reqs || []).filter((r: any) => r.status === "approved").reduce((sum: number, r: any) => sum + (Number(r.months) || 0), 0));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [placeId]);

  const active = isPlacePremiumNow(place);
  const q = useMemo(() => quote(months, usedMonths), [months, usedMonths]);
  const pending = latest?.status === "pending";

  const apply = async () => {
    if (busy || !canAct || !agree) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setMessage({ ok: false, text: "로그인이 필요해요." }); return; }
      const res = await fetch("/api/owner/apply-premium", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        // 관리자가 대신 신청할 때만 대상 업장을 함께 보냅니다(사장님 본인은 서버가 본인 업장으로 고정).
        body: JSON.stringify({ months, payerName, memo, ...(isPreview ? { placeId } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ ok: false, text: json.error || "신청하지 못했어요." }); return; }
      setMessage({ ok: true, text: q.total === 0 ? "신청이 접수됐어요. 확인 후 바로 적용해 드릴게요." : "신청이 접수됐어요. 입금 안내를 보내 드리고, 확인 후 적용해 드릴게요." });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* 현재 상태 */}
      <div style={{ ...card, background: active ? "#FFFBEB" : "white", borderColor: active ? "#FDE68A" : "#ece6d6" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Crown size={18} color={active ? "#B45309" : "#bbb"} />
          <div className="ggk-logo" style={{ fontSize: 15.5, fontWeight: 800, color: "#222" }}>{active ? "프리미엄 이용 중" : "지금은 기본 요금제예요"}</div>
        </div>
        <div style={{ fontSize: 12.5, color: "#777", marginTop: 5, lineHeight: 1.6 }}>
          {active ? `${fmtDate(place.premium_expires_at)}까지 적용돼요. 끝나기 전에 미리 알려 드리고, 자동으로 결제되지 않아요.` : "프리미엄을 신청하면 추천 목록과 AI 코스에서 우리 가게가 먼저 보여요."}
        </div>
      </div>

      {/* 요금제 비교 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {OWNER_PLANS.map((plan) => {
          const premium = plan.id === "premium";
          return (
            <div key={plan.id} style={{ ...card, borderColor: premium ? "#F59E0B" : "#ece6d6", borderWidth: premium ? 2 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: premium ? "#B45309" : "#333" }}>{plan.name}</div>
                {premium && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#F59E0B", color: "white" }}>첫 달 무료</span>}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{plan.tagline}</div>
              <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, color: "#222", marginTop: 10 }}>
                {plan.monthlyPrice === 0 ? "무료" : <>월 {won(plan.monthlyPrice)}<span style={{ fontSize: 11.5, fontWeight: 600, color: "#999" }}> · 부가세 포함</span></>}
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", gap: 6, fontSize: 12.5, color: "#444", lineHeight: 1.5 }}><Check size={13} color={premium ? "#B45309" : "#5C7A4A"} style={{ flexShrink: 0, marginTop: 3 }} />{f}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 단계 요금 안내 */}
      <div style={card}>
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>시범 운영 요금 — 부담 없이 먼저 써 보세요</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 10 }}>
          {PROMO_STEPS.map((s) => (
            <div key={s.label} style={{ padding: "11px 12px", borderRadius: 12, background: "#F7F3E8", border: "1px solid #ece6d6" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7a6a3a" }}>{s.label}</div>
              <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#222", marginTop: 3 }}>{s.discount === 1 ? "0원" : `월 ${won(Math.floor((PREMIUM_MONTHLY_PRICE * (1 - s.discount)) / 100) * 100)}`}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: "#999", marginTop: 10, lineHeight: 1.7 }}>
          · 시범 운영 기간의 요금이며, 바뀔 때는 적용 전에 미리 알려 드려요.<br />
          · 의무 이용 기간과 해지 위약금이 없어요. 기간이 끝나면 자동으로 기본 요금제로 돌아가고, 자동 결제는 하지 않아요.<br />
          · 광고 효과(조회·방문 증가)는 가게와 지역에 따라 달라 보장되지는 않아요. 성과는 대시보드와 보고서에서 직접 확인할 수 있어요.
        </div>
      </div>

      {/* 신청 */}
      <div style={card}>
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>{usedMonths > 0 ? "프리미엄 연장 신청" : "프리미엄 신청"}</div>
        {pending ? (
          <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "#EFF6FF", color: "#1d4ed8", fontSize: 13, lineHeight: 1.6 }}>
            {latest.months}개월 신청이 접수돼 확인 중이에요({fmtDate(latest.requested_at)} 신청).
          </div>
        ) : (
          <>
            {latest?.status === "rejected" && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", color: "#b91c1c", fontSize: 12.5 }}>지난 신청이 반려됐어요{latest.admin_note ? ` (사유: ${latest.admin_note})` : ""}. 다시 신청할 수 있어요.</div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {[1, 3, 6, 12].map((m) => (
                <button key={m} onClick={() => setMonths(m)} style={{ padding: "9px 16px", borderRadius: 10, border: months === m ? "2px solid #B45309" : "1px solid #e2e4e8", background: months === m ? "#FFFBEB" : "white", color: months === m ? "#92400E" : "#555", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{m}개월</button>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "#F7F3E8" }}>
              <div style={{ fontSize: 12, color: "#7a6a3a", lineHeight: 1.7 }}>
                {q.perMonth.slice(0, 6).map((p, i) => `${usedMonths + i + 1}개월째 ${p === 0 ? "무료" : won(p)}`).join(" · ")}{q.perMonth.length > 6 ? " · 이후 정가" : ""}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                <span className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, color: "#222" }}>합계 {won(q.total)}</span>
                {q.total < q.listTotal && <span style={{ fontSize: 12.5, color: "#aaa", textDecoration: "line-through" }}>{won(q.listTotal)}</span>}
              </div>
            </div>
            <input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="입금자명(유료 기간이 있을 때 입금 확인용)" style={inputStyle} />
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="세금계산서·현금영수증 등 요청 사항(선택)" style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} />
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, fontSize: 12.5, color: "#555", lineHeight: 1.6, cursor: "pointer" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
              <span>{isPreview ? "사장님에게 위 요금과 기간을 안내했고, 사장님 요청에 따라 대신 신청해요." : "위 요금과 기간을 확인했고, 유료 기간의 금액은 안내받은 계좌로 입금한 뒤 적용된다는 점에 동의해요."}</span>
            </label>
            {message && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: message.ok ? "#15803d" : "#b91c1c" }}>{message.text}</div>}
            <button onClick={apply} disabled={busy || !canAct || !agree} style={{ marginTop: 12, width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: busy || !canAct || !agree ? "#d6d3c9" : "#B45309", color: "white", fontSize: 14, fontWeight: 800, cursor: busy || !canAct || !agree ? "default" : "pointer" }}>
              {busy ? "신청 중…" : !canAct ? "보기 전용 — 대신 신청하려면 위 스위치를 켜 주세요" : isPreview ? `사장님 대신 ${months}개월 신청하기` : `${months}개월 신청하기`}
            </button>
            {isPreview && canAct && <div style={{ fontSize: 11.5, color: "#991b1b", marginTop: 6, lineHeight: 1.6 }}>대신 신청한 건은 관리자 → 프리미엄 화면에서 입금 확인 후 승인해야 적용돼요.</div>}
            <div style={{ fontSize: 11.5, color: "#999", marginTop: 8, lineHeight: 1.6 }}>카드 결제는 준비 중이에요. 지금은 신청 후 계좌 입금으로 진행하고, 세금계산서·현금영수증을 발행해 드려요.</div>
          </>
        )}
      </div>
    </div>
  );
}
const inputStyle: React.CSSProperties = { width: "100%", marginTop: 10, padding: "11px 13px", borderRadius: 10, border: "1px solid #e2e4e8", background: "#f8fafc", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };

/* ── 성과 보고서(최근 30일) ── */
function ReportTab({ placeId, isPreview }: { placeId: number; isPreview: boolean }) {
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchOwnerStats(isPreview ? placeId : undefined).then((r) => { if (!cancelled) { setStats(r.stats); setError(r.error); } });
    return () => { cancelled = true; };
  }, [placeId, isPreview]);

  if (error) return <div style={{ ...card, color: "#999", fontSize: 13 }}>{error}</div>;
  if (!stats) return <div style={{ ...card, color: "#999", fontSize: 13, textAlign: "center" }}><LogoLoader /></div>;

  const l = stats.last30;
  const exposure = l.courseIncluded + (l.recommendImpressions ?? 0);
  const clicks = l.courseClicks + l.recommendClicks;
  const directions = (l.directions ?? 0) + l.courseDirections;
  const actions = directions + (l.calls ?? 0) + (l.website ?? 0);
  const rate = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
  const today = new Date();
  const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  const rows: [string, number, string][] = [
    ["노출", exposure, "AI 코스에 포함 + 추천 목록에 보인 횟수"],
    ["클릭", clicks, "코스·추천 목록에서 우리 가게를 눌러 본 횟수"],
    ["상세 조회", stats.views.last30, "우리 가게 상세 화면이 열린 횟수"],
    ["길찾기", directions, "우리 가게로 길찾기를 연 횟수"],
    ["전화", l.calls ?? 0, "전화번호를 누른 횟수"],
    ["홈페이지", l.website ?? 0, "홈페이지 링크를 누른 횟수"],
  ];
  const best = [...stats.daily].sort((a, b) => b.views - a.views)[0];

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#B45309" }}>같이가개 성과 보고서</div>
          <div className="ggk-logo" style={{ fontSize: 19, fontWeight: 800, color: "#222", marginTop: 3 }}>{stats.placeName ?? "내 가게"}</div>
          <div style={{ fontSize: 12.5, color: "#888", marginTop: 3 }}>{fmtDate(from.toISOString())} ~ {fmtDate(today.toISOString())} (최근 30일)</div>
        </div>
        <button className="owner-no-print" onClick={() => window.print()} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "9px 13px", borderRadius: 10, border: "1px solid #e2e4e8", background: "white", color: "#555", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <Printer size={13} />인쇄 · PDF 저장
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginTop: 16 }}>
        {[["노출", exposure], ["상세 조회", stats.views.last30], ["방문·문의 행동", actions]].map(([label, value]) => (
          <div key={label as string} style={{ padding: "13px 12px", borderRadius: 13, background: "#FFFBEB", border: "1px solid #FDE68A", textAlign: "center" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#92400E" }}>{label}</div>
            <div className="ggk-logo" style={{ fontSize: 24, fontWeight: 800, color: "#78350F", marginTop: 3 }}>{Number(value).toLocaleString("ko-KR")}</div>
          </div>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#999", fontSize: 11.5 }}>
            <th style={th}>지표</th><th style={{ ...th, textAlign: "right" }}>최근 30일</th><th style={th}>설명</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value, desc]) => (
            <tr key={label} style={{ borderTop: "1px solid #f3efe3" }}>
              <td style={{ ...td, fontWeight: 700, color: "#333", whiteSpace: "nowrap" }}>{label}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, color: "#222" }}>{value.toLocaleString("ko-KR")}</td>
              <td style={{ ...td, color: "#888", fontSize: 12 }}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, padding: "13px 14px", borderRadius: 13, background: "#F7F3E8", fontSize: 13, color: "#55604a", lineHeight: 1.8 }}>
        <b style={{ color: "#333" }}>한눈에 보기</b><br />
        · 노출 대비 클릭률 {rate(clicks, exposure)} · 상세 조회 대비 방문·문의 행동 {rate(actions, stats.views.last30)}<br />
        · 가장 많이 본 날: {best && best.views > 0 ? `${best.day.slice(5).replace("-", "월 ")}일 (${best.views}회)` : "아직 조회가 없어요"}<br />
        · 누적 찜 {stats.bookmarks.toLocaleString("ko-KR")} · 추천 {stats.likes.toLocaleString("ko-KR")} · 후기 {stats.reviews.toLocaleString("ko-KR")}건
      </div>

      <div style={{ fontSize: 11, color: "#aaa", marginTop: 12, lineHeight: 1.7 }}>
        · 같은 사람이 여러 번 보면 여러 번 세는 횟수 기준이에요. 개인을 알 수 있는 정보는 포함되지 않아요.<br />
        · 길찾기·전화·홈페이지 횟수는 2026년 10월 5일부터 집계됐어요.<br />
        · 실제 매장 방문·매출과는 차이가 있을 수 있어요.
      </div>
    </div>
  );
}
const th: React.CSSProperties = { padding: "7px 8px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "9px 8px", verticalAlign: "top" };
