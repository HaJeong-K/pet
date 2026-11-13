"use client";

// 사장님 센터 — 손님이 찾는 해시태그(5개까지)와 받는 주문 방식(포장·매장 식사)을 직접 정합니다.
// 메뉴 이름은 해시태그가 없어도 검색됩니다. 서버는 /api/owner/store-settings.

import { useCallback, useEffect, useState } from "react";
import { Hash, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cleanSearchTags, SEARCH_TAGS_MAX } from "@/lib/talkSearch";
import { cleanStoreInfo, type OrderDay, type StoreInfo } from "@/lib/storeRules";
import TimePicker from "@/components/TimePicker";

const WEEK_DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MODES = [{ id: "pickup", label: "포장 주문" }, { id: "dine_in", label: "매장 식사" }];

export default function OwnerStoreSettings({ placeId, isPreview, canAct, showModes }: { placeId: number; isPreview: boolean; canAct: boolean; showModes: boolean }) {
  const [tags, setTags] = useState<string[]>([]);
  const [modes, setModes] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [hours, setHours] = useState({ open: "", close: "" });
  const [info, setInfo] = useState<StoreInfo>(() => cleanStoreInfo(null));
  const [week, setWeek] = useState<{ open: string; close: string; closed: boolean }[]>(() => WEEK_DAYS.map(() => ({ open: "", close: "", closed: false })));
  const [showWeek, setShowWeek] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const call = useCallback(async (init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch(`/api/owner/store-settings${isPreview ? `?placeId=${placeId}` : ""}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId, isPreview]);

  useEffect(() => {
    call().then((d) => { setTags(d.tags ?? []); setModes(d.orderModes ?? []); setHours({ open: d.orderOpen ?? "", close: d.orderClose ?? "" }); setInfo(cleanStoreInfo(d.storeInfo)); if (d.orderWeek) { setWeek(d.orderWeek.map((x: OrderDay) => x ?? { open: "", close: "", closed: false })); setShowWeek(true); } }).catch((e) => setMessage({ ok: false, text: e.message }));
  }, [call]);

  const save = async (next: { tags?: string[]; orderModes?: string[]; orderOpen?: string; orderClose?: string; storeInfo?: StoreInfo; orderWeek?: unknown }) => {
    setMessage(null);
    try {
      await call({ method: "PATCH", body: JSON.stringify(next) });
      if (next.tags) setTags(next.tags);
      if (next.orderModes) setModes(next.orderModes);
      setMessage({ ok: true, text: "저장했어요." });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했어요." }); }
  };
  const addTag = () => {
    if (!draft.trim()) return;
    save({ tags: cleanSearchTags([...tags, draft]) });
    setDraft("");
  };

  return (
    <div style={{ marginBottom: 16, padding: 16, borderRadius: 16, background: "white", border: "1px solid #E7E6E5" }}>
      {showModes && (
        <div style={{ marginBottom: 16 }}>
          <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>받는 주문 방식</div>
          <div style={{ marginTop: 3, fontSize: 13, color: "#5c5c5c" }}>손님에게는 켠 방식만 보입니다.</div>
          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            {MODES.map((m) => {
              const on = modes.includes(m.id);
              return <button key={m.id} type="button" role="switch" aria-checked={on} disabled={!canAct} onClick={() => save({ orderModes: on ? modes.filter((x) => x !== m.id) : [...modes, m.id] })} style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: `1px solid ${on ? "#3B2A20" : "#DDDCDB"}`, background: on ? "#3B2A20" : "white", color: on ? "white" : "#555", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: canAct ? "pointer" : "default" }}>{m.label}</button>;
            })}
          </div>
        </div>
      )}
      {showModes && (
        <div style={{ marginBottom: 16 }}>
          <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>포장 주문 가능 시간</div>
          <div style={{ marginTop: 3, fontSize: 13, color: "#5c5c5c", lineHeight: 1.6 }}>
            이 시간에만 포장 주문을 받습니다. 비워 두면 제한이 없습니다.<br />
            영업시간·휴무일·주차는 &lsquo;가게 정보&rsquo; 메뉴에서 수정합니다.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9 }}>
            <TimePicker ariaLabel="주문 시작 시간" value={hours.open} disabled={!canAct} onChange={(t) => setHours({ ...hours, open: t })} style={{ flex: 1, minWidth: 0, width: "auto" }} />
            <span style={{ color: "#5c5c5c" }}>~</span>
            <TimePicker ariaLabel="주문 마감 시간" value={hours.close} disabled={!canAct} onChange={(t) => setHours({ ...hours, close: t })} style={{ flex: 1, minWidth: 0, width: "auto" }} />
            {canAct && <button type="button" onClick={() => save({ orderOpen: hours.open, orderClose: hours.close })} style={{ flexShrink: 0, padding: "10px 16px", borderRadius: 10, border: "none", background: "#3B2A20", color: "white", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>저장</button>}
          </div>
          <button type="button" onClick={() => setShowWeek((v) => !v)} aria-expanded={showWeek} style={{ marginTop: 8, padding: 0, border: "none", background: "transparent", color: "#85482A", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>요일별로 다르게 정하기 {showWeek ? "접기" : "열기"}</button>
          {showWeek && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {WEEK_DAYS.map((name, i) => {
                const d = week[i];
                const change = (patch: Partial<typeof d>) => setWeek(week.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                    <b style={{ flexShrink: 0, width: 22 }}>{name}</b>
                    <TimePicker ariaLabel={`${name}요일 시작`} value={d.open} disabled={!canAct || d.closed} onChange={(t) => change({ open: t })} style={{ flex: 1, minWidth: 0, width: "auto" }} />
                    <span>~</span>
                    <TimePicker ariaLabel={`${name}요일 마감`} value={d.close} disabled={!canAct || d.closed} onChange={(t) => change({ close: t })} style={{ flex: 1, minWidth: 0, width: "auto" }} />
                    <label style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3, fontSize: 13 }}><input type="checkbox" checked={d.closed} disabled={!canAct} onChange={(e) => change({ closed: e.target.checked })} />안 받음</label>
                  </div>
                );
              })}
              <div style={{ fontSize: 12.5, color: "#5c5c5c" }}>비워 둔 요일은 위의 시간을 씁니다.</div>
              {canAct && <button type="button" onClick={() => save({ orderWeek: week })} style={{ justifySelf: "start", padding: "9px 16px", borderRadius: 10, border: "none", background: "#3B2A20", color: "white", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>요일별 시간 저장</button>}
            </div>
          )}
        </div>
      )}
      {showModes && (
        <div style={{ marginBottom: 16, display: "grid", gap: 10 }}>
          <div>
            <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>가게 안내</div>
            <div style={{ marginTop: 3, fontSize: 13, color: "#5c5c5c" }}>손님의 가게 화면 위쪽과 가게 정보에 표시됩니다.</div>
          </div>
          {([["intro", "가게 소개", "예: 매일 아침 직접 굽는 강아지 수제 간식 가게입니다"], ["allergyNotice", "알레르기 공통 안내", "예: 모든 제품을 같은 주방에서 만들어 닭·유제품이 섞일 수 있습니다"], ["originNotice", "원산지 표시", "예: 닭가슴살(국내산), 연어(노르웨이산)"]] as const).map(([key, title, placeholder]) => (
            <label key={key} style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
              {title}
              <textarea value={info[key]} disabled={!canAct} onChange={(e) => setInfo({ ...info, [key]: e.target.value })} rows={2} maxLength={key === "originNotice" ? 500 : 300} placeholder={placeholder} style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, padding: 10, borderRadius: 10, border: "1px solid #DDDCDB", fontSize: 14, fontFamily: "inherit", fontWeight: 400, resize: "vertical" }} />
            </label>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "#555" }}>
              포장 준비 시간(분)
              <input value={info.prepMinutes ?? ""} disabled={!canAct} onChange={(e) => setInfo({ ...info, prepMinutes: Number(e.target.value.replace(/\D/g, "")) || null })} inputMode="numeric" placeholder="예: 20" style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, padding: 10, borderRadius: 10, border: "1px solid #DDDCDB", fontSize: 14, fontFamily: "inherit" }} />
            </label>
            <label style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "#555" }}>
              최소 주문 금액(원)
              <input value={info.minOrder || ""} disabled={!canAct} onChange={(e) => setInfo({ ...info, minOrder: Number(e.target.value.replace(/\D/g, "")) || 0 })} inputMode="numeric" placeholder="없으면 비워 두세요" style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, padding: 10, borderRadius: 10, border: "1px solid #DDDCDB", fontSize: 14, fontFamily: "inherit" }} />
            </label>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>사업자 정보 <span style={{ fontWeight: 500, color: "#6e6e6e" }}>(가게 정보에 표시)</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            {([["bizName", "상호"], ["ceoName", "대표자"], ["bizNo", "사업자등록번호"], ["bizAddress", "사업장 주소"]] as const).map(([key, title]) => (
              <input key={key} value={info[key]} disabled={!canAct} onChange={(e) => setInfo({ ...info, [key]: e.target.value })} placeholder={title} aria-label={title} style={{ minWidth: 0, padding: 10, borderRadius: 10, border: "1px solid #DDDCDB", fontSize: 14, fontFamily: "inherit" }} />
            ))}
          </div>
          {canAct && <button type="button" onClick={() => save({ storeInfo: info })} style={{ justifySelf: "start", padding: "10px 18px", borderRadius: 10, border: "none", background: "#3B2A20", color: "white", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>가게 안내 저장</button>}
        </div>
      )}
      <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>검색 해시태그 <span style={{ fontSize: 13, fontWeight: 600, color: "#6e6e6e" }}>{tags.length}/{SEARCH_TAGS_MAX}</span></div>
      <div style={{ marginTop: 3, fontSize: 13, color: "#5c5c5c", lineHeight: 1.6 }}>
        손님이 &ldquo;대구 수제간식&rdquo;, &ldquo;대구 독채&rdquo;처럼 찾을 때 쓰입니다.<br />
        메뉴 이름은 적지 않아도 검색됩니다.
      </div>
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
          {tags.map((t) => <button key={t} type="button" disabled={!canAct} onClick={() => save({ tags: tags.filter((x) => x !== t) })} aria-label={`${t} 지우기`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 999, border: "none", background: "#FBEDE3", color: "#85482A", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>#{t}<X size={12} /></button>)}
        </div>
      )}
      {canAct && tags.length < SEARCH_TAGS_MAX && (
        <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 5, padding: "0 11px", borderRadius: 10, border: "1px solid #DDDCDB" }}>
            <Hash size={14} color="#6B5E55" />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="예: 수제간식, 화식, 독채, 한옥" maxLength={14} style={{ flex: 1, minWidth: 0, padding: "10px 0", border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", background: "transparent" }} />
          </div>
          <button type="button" onClick={addTag} style={{ flexShrink: 0, padding: "0 16px", borderRadius: 10, border: "none", background: "#3B2A20", color: "white", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>추가</button>
        </div>
      )}
      {message && <div role="status" style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: message.ok ? "#85482A" : "#B91C1C" }}>{message.text}</div>}
    </div>
  );
}
