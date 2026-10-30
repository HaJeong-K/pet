"use client";

// 사장님 센터의 "상품" 화면 — 배달 앱에 메뉴를 올리듯 상품을 자세히 올립니다.
//   · 꼭 적는 것: 이름, 가격
//   · 선택(해당 없으면 비워 둠 — 장난감에는 재료·알레르기가 없으니까요):
//       사진, 분류, 한 줄 설명, 용량·크기, 재료·소재, 알레르기 정보, 원산지·제조, 주의사항·보관 방법
//   · 상태: 대표 상품(맨 앞에 표시), 품절(보이지만 예약 못 함), 판매 중지(손님에게 숨김)
//   · 순서: ↑ ↓ 로 손님에게 보이는 순서를 바꿉니다
// 올린 상품은 쇼핑 탭(/shop)과 가게 상세 화면에 진열되고, 손님이 거기서 직접 예약 주문을 넣습니다.
// 손님에게 보이는 것은 '프리미엄 스토어' 이상일 때입니다(미리 올려 두는 것은 언제든 가능). 결제는 가게에서 받습니다.
// 규칙(글자 수·다듬기)은 src/lib/storeRules.ts, 서버는 /api/owner/products.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ImagePlus, Package, Pencil, Plus, Star, Trash2 } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import {
  PRODUCT_CATEGORY_MAX, PRODUCT_CATEGORY_SUGGESTIONS, PRODUCT_DESC_MAX, PRODUCT_DETAIL_MAX, PRODUCT_NAME_MAX, PRODUCT_UNIT_MAX, PRODUCTS_PER_PLACE_MAX,
} from "@/lib/storeRules";

type Product = {
  id: number; name: string; description: string | null; price: number; is_active: boolean;
  category: string | null; image_url: string | null; unit: string | null; ingredients: string | null; allergy: string | null;
  origin: string | null; caution: string | null; is_featured: boolean; sold_out: boolean;
};
type Form = { name: string; price: string; description: string; category: string; imageUrl: string | null; unit: string; ingredients: string; allergy: string; origin: string; caution: string; is_featured: boolean; sold_out: boolean };
const EMPTY: Form = { name: "", price: "", description: "", category: "", imageUrl: null, unit: "", ingredients: "", allergy: "", origin: "", caution: "", is_featured: false, sold_out: false };
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const label: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: "#444", marginBottom: 6 };
const optional: React.CSSProperties = { fontWeight: 600, color: "#6e6e6e" };
const primaryButton = (disabled: boolean): React.CSSProperties => ({ padding: "10px 16px", borderRadius: 10, border: "none", background: disabled ? "#d6d3c9" : "#B45309", color: disabled ? "#4f4a3f" : "white", fontSize: 13, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit" });
const iconButton: React.CSSProperties = { width: 32, height: 32, borderRadius: 9, border: "1px solid #e2e4e8", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
const tag = (bg: string, color: string): React.CSSProperties => ({ fontSize: 10.5, fontWeight: 800, padding: "1px 7px", borderRadius: 999, background: bg, color, flexShrink: 0 });

export default function ProductsTab({ placeId, isPreview, canAct, onGoAds }: { placeId: number; isPreview: boolean; canAct: boolean; onGoAds: () => void }) {
  const [state, setState] = useState<{ ready: boolean; detailReady: boolean; enabled: boolean; products: Product[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "upload" | "list">("");
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const call = useCallback(async (path: string, init: RequestInit = {}, extra = "") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    // 관리자가 다른 가게를 볼 때만 주소에 가게 번호를 붙입니다(사장님 본인은 서버가 본인 가게로 고정).
    const query = [isPreview ? `placeId=${placeId}` : "", extra].filter(Boolean).join("&");
    const res = await fetch(`${path}${query ? `?${query}` : ""}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId, isPreview]);
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const load = useCallback(async () => {
    try { setState(await call("/api/owner/products")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
  }, [call]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  const open = (target: Product | "new") => {
    setEditing(target);
    const next: Form = target === "new" ? EMPTY : {
      name: target.name, price: String(target.price), description: target.description ?? "", category: target.category ?? "", imageUrl: target.image_url,
      unit: target.unit ?? "", ingredients: target.ingredients ?? "", allergy: target.allergy ?? "", origin: target.origin ?? "", caution: target.caution ?? "",
      is_featured: target.is_featured, sold_out: target.sold_out,
    };
    setForm(next);
    // 이미 적어 둔 자세한 정보가 있으면 펼쳐서 보여 줍니다.
    setShowMore(!!(next.ingredients || next.allergy || next.origin || next.caution));
    setError(null);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!IMAGE_TYPES.includes(file.type)) { setError("JPG·PNG·WEBP 사진만 올릴 수 있어요."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("사진은 5MB까지 올릴 수 있어요."); return; }
    setBusy("upload");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await call("/api/owner/products/image", { method: "POST", body });
      setForm((prev) => ({ ...prev, imageUrl: result.url }));
    } catch (e) { setError(e instanceof Error ? e.message : "사진을 올리지 못했어요."); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = async () => {
    if (!editing || busy) return;
    setBusy("save");
    setError(null);
    try {
      const payload = { ...form, price: form.price === "" ? "" : Number(form.price) };
      if (editing === "new") await call("/api/owner/products", json("POST", payload));
      else await call("/api/owner/products", json("PATCH", { id: editing.id, ...payload }));
      setEditing(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요."); }
    finally { setBusy(""); }
  };
  const quick = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy("list");
    try { await call("/api/owner/products", json("PATCH", body)); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "바꾸지 못했어요."); }
    finally { setBusy(""); }
  };
  const remove = async (product: Product) => {
    if (busy || !window.confirm(`"${product.name}"을(를) 삭제할까요?`)) return;
    setBusy("list");
    try { await call("/api/owner/products", { method: "DELETE" }, `id=${product.id}`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "삭제하지 못했어요."); }
    finally { setBusy(""); }
  };

  if (!state) return <div style={{ ...card, textAlign: "center" }}>{error ? <span style={{ fontSize: 13, color: "#666" }}>{error}</span> : <LogoLoader />}</div>;
  if (!state.ready) {
    return (
      <div style={{ ...card, fontSize: 13, color: "#9a3412", background: "#fff7ed", borderColor: "#fed7aa", lineHeight: 1.7 }}>
        상품·예약 기능을 준비하고 있어요.
        {isPreview && <> Supabase SQL 편집기에서 <b>scripts/sql/owner-store.sql</b>을 한 번 실행하면 열려요.</>}
      </div>
    );
  }

  const categories = [...new Set([...state.products.map((p) => p.category).filter((c): c is string => !!c), ...PRODUCT_CATEGORY_SUGGESTIONS])];
  const canSave = form.name.trim() !== "" && form.price !== "" && busy === "";
  const detail = state.detailReady;
  const set = (patch: Partial<Form>) => setForm((prev) => ({ ...prev, ...patch }));
  const area = (key: "ingredients" | "allergy" | "origin" | "caution", title: string, placeholder: string) => (
    <div>
      <div style={label}>{title} <span style={optional}>(선택) {form[key].length}/{PRODUCT_DETAIL_MAX}</span></div>
      <textarea value={form[key]} onChange={(e) => set({ [key]: e.target.value })} maxLength={PRODUCT_DETAIL_MAX} rows={2} placeholder={placeholder} style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!state.enabled && (
        <div style={{ ...card, background: "#FFFBEB", borderColor: "#FDE68A", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px", fontSize: 13, color: "#78350F", lineHeight: 1.65 }}><b>프리미엄 스토어</b> 요금제부터 상품이 쇼핑 탭에 진열되고, 손님이 직접 예약 주문을 넣을 수 있어요.<br />상품은 지금 미리 올려 둘 수 있어요.</div>
          <button onClick={onGoAds} style={primaryButton(false)}>요금제 보기</button>
        </div>
      )}
      {!detail && (
        <div style={{ ...card, fontSize: 12.5, color: "#9a3412", background: "#fff7ed", borderColor: "#fed7aa", lineHeight: 1.7 }}>
          지금은 이름·설명·가격만 올릴 수 있어요. 사진·분류·재료·알레르기 정보는 준비하고 있어요.
          {isPreview && <> Supabase SQL 편집기에서 <b>scripts/sql/owner-products-detail.sql</b>을 한 번 실행하면 열려요.</>}
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>우리 가게 상품 {state.products.length}개</div>
          {canAct && state.products.length < PRODUCTS_PER_PLACE_MAX && <button onClick={() => open("new")} style={{ ...primaryButton(false), marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}><Plus size={14} />상품 추가</button>}
        </div>
        <div style={{ fontSize: 12.5, color: "#5c5c5c", marginTop: 4, lineHeight: 1.7 }}>
          올린 상품은 <b style={{ color: "#555" }}>쇼핑 탭</b>과 우리 가게 상세 화면에 진열돼요.<br />
          손님이 직접 예약 주문을 넣으면 &ldquo;예약&rdquo; 메뉴에서 확정해 주세요.<br />
          결제는 가게에서 받아요(건당 수수료 없음).
        </div>
        {state.enabled && (
          <a href="/shop" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 9, padding: "7px 12px", borderRadius: 9, background: "#E4EBDC", fontSize: 12, fontWeight: 800, color: "#3F5230", textDecoration: "none" }}>손님이 보는 쇼핑 탭 열어 보기 →</a>
        )}
        {!canAct && <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>보기 전용이에요. 대신 수정하려면 위의 &quot;사장님 요청으로 대신 처리하기&quot;를 켜 주세요.</div>}
        {error && !editing && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}

        {editing && (
          <div ref={formRef} style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "#F7F3E8", display: "grid", gap: 14, scrollMarginTop: 12 }}>
            <div className="ggk-logo" style={{ fontSize: 14.5, fontWeight: 800, color: "#333" }}>{editing === "new" ? "새 상품 올리기" : "상품 수정"}</div>

            {/* 사진 + 이름·가격 */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              {detail && (
                <div style={{ flex: "0 0 112px" }}>
                  <div style={label}>사진 <span style={optional}>(선택)</span></div>
                  <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(",")} onChange={(e) => upload(e.target.files?.[0])} style={{ display: "none" }} />
                  <button onClick={() => fileRef.current?.click()} disabled={busy !== ""} aria-label="상품 사진 올리기" style={{ width: 112, height: 112, borderRadius: 14, border: form.imageUrl ? "1px solid #e2dcc8" : "1.5px dashed #c9b98a", background: form.imageUrl ? `url("${form.imageUrl}") center/cover no-repeat` : "#FFFBEB", color: "#8a6d1f", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 11.5, fontWeight: 700, fontFamily: "inherit", padding: 0 }}>
                    {!form.imageUrl && <><ImagePlus size={20} />{busy === "upload" ? "올리는 중…" : "사진 올리기"}</>}
                  </button>
                  {form.imageUrl && (
                    <div style={{ display: "flex", gap: 8, marginTop: 5, justifyContent: "center" }}>
                      <button onClick={() => fileRef.current?.click()} style={{ border: "none", background: "transparent", padding: 0, fontSize: 11.5, fontWeight: 700, color: "#7a5a12", cursor: "pointer", fontFamily: "inherit" }}>{busy === "upload" ? "올리는 중…" : "바꾸기"}</button>
                      <button onClick={() => set({ imageUrl: null })} style={{ border: "none", background: "transparent", padding: 0, fontSize: 11.5, fontWeight: 700, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>빼기</button>
                    </div>
                  )}
                </div>
              )}
              <div style={{ flex: "1 1 240px", minWidth: 0, display: "grid", gap: 12 }}>
                <div>
                  <div style={label}>상품 이름 <span style={optional}>{form.name.length}/{PRODUCT_NAME_MAX}</span></div>
                  <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="예: 수제 닭가슴살 육포" maxLength={PRODUCT_NAME_MAX} style={input} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: detail ? "1fr 1fr" : "1fr", gap: 10 }}>
                  <div>
                    <div style={label}>가격</div>
                    <div style={{ position: "relative" }}>
                      <input value={form.price ? Number(form.price).toLocaleString("ko-KR") : ""} onChange={(e) => set({ price: e.target.value.replace(/[^\d]/g, "").slice(0, 8) })} placeholder="0" inputMode="numeric" style={{ ...input, paddingRight: 34, textAlign: "right", fontWeight: 700 }} />
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#5c5c5c" }}>원</span>
                    </div>
                  </div>
                  {detail && (
                    <div>
                      <div style={label}>용량·크기 <span style={optional}>(선택)</span></div>
                      <input value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="예: 100g / S·M·L / 3개입" maxLength={PRODUCT_UNIT_MAX} style={input} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {detail && (
              <div>
                <div style={label}>분류 <span style={optional}>(선택) 같은 분류끼리 묶여서 보여요</span></div>
                <input value={form.category} onChange={(e) => set({ category: e.target.value })} placeholder="직접 적거나 아래에서 골라 주세요" maxLength={PRODUCT_CATEGORY_MAX} style={input} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                  {categories.map((name) => {
                    const active = form.category.trim() === name;
                    return <button key={name} onClick={() => set({ category: active ? "" : name })} style={{ padding: "6px 11px", borderRadius: 999, border: `1px solid ${active ? "#B45309" : "#e2dcc8"}`, background: active ? "#FEF3C7" : "white", color: active ? "#92400E" : "#666", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{name}</button>;
                  })}
                </div>
              </div>
            )}

            <div>
              <div style={label}>한 줄 설명 <span style={optional}>(선택) {form.description.length}/{PRODUCT_DESC_MAX}</span></div>
              <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="예: 국내산 닭가슴살만 저온에서 말린 간식이에요" maxLength={PRODUCT_DESC_MAX} rows={2} style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
            </div>

            {detail && (
              <div style={{ borderRadius: 12, background: "white", border: "1px solid #e8e2d2" }}>
                <button onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 13px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#444" }}>자세한 정보 <span style={optional}>(선택)</span></span>
                    <span style={{ display: "block", fontSize: 11.5, color: "#666", marginTop: 2 }}>재료·알레르기·원산지·주의사항 — 간식·사료라면 적어 주세요. 장난감·용품은 비워 둬도 돼요.</span>
                  </span>
                  {showMore ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
                </button>
                {showMore && (
                  <div style={{ padding: "2px 13px 14px", display: "grid", gap: 12 }}>
                    {area("ingredients", "재료·소재", "예: 닭가슴살 100% (먹는 것) / 면 100%, 솜 (용품)")}
                    {area("allergy", "알레르기 정보", "예: 닭고기 포함. 같은 시설에서 소고기·연어 제품을 만들어요")}
                    {area("origin", "원산지·제조", "예: 닭가슴살(국내산) / 제조: 우리 가게에서 직접 만듦")}
                    {area("caution", "주의사항·보관 방법", "예: 냉장 보관, 개봉 후 3일 안에 급여 / 3개월 미만 강아지는 피해 주세요")}
                  </div>
                )}
              </div>
            )}

            {detail && (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#444", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.is_featured} onChange={(e) => set({ is_featured: e.target.checked })} style={{ width: 17, height: 17 }} />대표 상품 <span style={optional}>맨 앞에 보여요</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#444", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.sold_out} onChange={(e) => set({ sold_out: e.target.checked })} style={{ width: 17, height: 17 }} />품절 <span style={optional}>보이지만 예약은 안 받아요</span>
                </label>
              </div>
            )}

            {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setEditing(null); setError(null); }} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #ddd", background: "white", fontSize: 13, fontWeight: 700, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>취소</button>
              <button onClick={save} disabled={!canSave} style={{ ...primaryButton(!canSave), flex: 2, padding: "11px 0" }}>{busy === "save" ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {state.products.length === 0 && !editing && <div style={{ fontSize: 13, color: "#6e6e6e", textAlign: "center", padding: "24px 0" }}>아직 올린 상품이 없어요. &ldquo;상품 추가&rdquo;로 첫 상품을 올려 보세요.</div>}
          {state.products.map((p, index) => {
            const facts = [p.ingredients && "재료", p.allergy && "알레르기", p.origin && "원산지", p.caution && "주의사항"].filter(Boolean);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 12px", borderRadius: 12, border: "1px solid #f0ece0", background: p.is_active ? "white" : "#fafafa", opacity: p.is_active ? 1 : 0.7 }}>
                {p.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 56, height: 56, borderRadius: 11, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Package size={20} color="#B45309" /></div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: "#222", wordBreak: "break-word" }}>{p.name}</span>
                    {p.is_featured && <span style={{ ...tag("#FEF3C7", "#92400E"), display: "inline-flex", alignItems: "center", gap: 2 }}><Star size={9} fill="#92400E" />대표</span>}
                    {p.sold_out && <span style={tag("#FEE2E2", "#B91C1C")}>품절</span>}
                    {!p.is_active && <span style={tag("#f1f2f4", "#777")}>판매 중지</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#666", marginTop: 2 }}>{[p.category, p.unit].filter(Boolean).join(" · ")}</div>
                  {p.description && <div style={{ fontSize: 12, color: "#555", marginTop: 2, lineHeight: 1.5, wordBreak: "break-word" }}>{p.description}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: "#B45309" }}>{won(p.price)}</span>
                    {facts.length > 0 && <span style={{ fontSize: 11, color: "#6e6e6e" }}>{facts.join("·")} 적음</span>}
                  </div>
                  {canAct && (
                    <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                      {detail && <button onClick={() => quick({ id: p.id, sold_out: !p.sold_out })} disabled={busy !== ""} style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid #e2e4e8", background: "white", fontSize: 11.5, fontWeight: 700, color: p.sold_out ? "#15803D" : "#B91C1C", cursor: "pointer", fontFamily: "inherit" }}>{p.sold_out ? "품절 풀기" : "품절"}</button>}
                      <button onClick={() => quick({ id: p.id, is_active: !p.is_active })} disabled={busy !== ""} style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid #e2e4e8", background: "white", fontSize: 11.5, fontWeight: 700, color: "#555", cursor: "pointer", fontFamily: "inherit" }}>{p.is_active ? "판매 중지" : "다시 판매"}</button>
                    </div>
                  )}
                </div>
                {canAct && (
                  <div style={{ display: "grid", gridTemplateColumns: "32px 32px", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => quick({ id: p.id, move: "up" })} disabled={busy !== "" || index === 0} aria-label={`${p.name} 위로`} style={{ ...iconButton, opacity: index === 0 ? 0.35 : 1 }}><ArrowUp size={13} color="#666" /></button>
                    <button onClick={() => quick({ id: p.id, move: "down" })} disabled={busy !== "" || index === state.products.length - 1} aria-label={`${p.name} 아래로`} style={{ ...iconButton, opacity: index === state.products.length - 1 ? 0.35 : 1 }}><ArrowDown size={13} color="#666" /></button>
                    <button onClick={() => open(p)} aria-label={`${p.name} 수정`} style={iconButton}><Pencil size={13} color="#666" /></button>
                    <button onClick={() => remove(p)} aria-label={`${p.name} 삭제`} style={{ ...iconButton, borderColor: "#f3c7c5" }}><Trash2 size={13} color="#b42318" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
