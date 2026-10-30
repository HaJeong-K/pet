"use client";
// src/components/stamps/MemoryStampsCard.tsx
//
// 마이페이지 "추억 스탬프" — 모은 스탬프, 쓸 수 있는 개수·할인액, 저장한 코스의 완주 진행 상황.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SchnauzerHead } from "@/components/brand/SchnauzerPeek";
import { STAMP_KIND_LABEL, STAMP_MAX_RATE, STAMP_VALUE_WON, type StampKind } from "@/lib/memoryStamps";

type StampRow = { id: number; kind: StampKind; title: string; issued_on: string; spent_booking_id: number | null };
type CourseRow = { id: string; title: string; total: number; done: number; completed: boolean };
type Data = { ready: boolean; available: number; stamps: StampRow[]; courses: CourseRow[] };

export default function MemoryStampsCard() {
  const [data, setData] = useState<Data | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/me/stamps", { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      const json = res && res.ok ? await res.json().catch(() => null) : null;
      if (!cancelled && json?.ready) setData(json);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;
  const shown = showAll ? data.stamps : data.stamps.slice(0, 8);
  const courses = data.courses.filter((c) => c.total >= 2);
  return (
    <section aria-label="추억 스탬프" style={{ margin: "12px 16px 0", padding: "16px", borderRadius: 16, background: "white", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", wordBreak: "keep-all" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>추억 스탬프</div>
        <div style={{ fontSize: 13, color: "#6B5525", fontWeight: 700 }}>
          쓸 수 있는 스탬프 <b>{data.available}개</b> · {(data.available * STAMP_VALUE_WON).toLocaleString("ko-KR")}원 할인
        </div>
      </div>

      {data.stamps.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 13, color: "#5c5c5c", lineHeight: 1.7 }}>
          반려동물과 다녀온 곳의 장소 화면에서<br />&lsquo;다녀왔어요&rsquo;를 누르면 스탬프를 받아요.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8, marginTop: 12 }}>
            {shown.map((s) => (
              <div key={s.id} title={`${s.title} · ${s.issued_on}`} style={{ padding: "9px 5px 8px", borderRadius: 12, border: `1.5px dashed ${s.spent_booking_id ? "#ddd" : "#C9A95C"}`, background: s.spent_booking_id ? "#FAFAF8" : "#FFFBEF", textAlign: "center", opacity: s.spent_booking_id ? 0.55 : 1 }}>
                <div style={{ display: "flex", justifyContent: "center", height: 40, overflow: "hidden" }}><SchnauzerHead width={30} /></div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#444", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                <div style={{ fontSize: 10.5, color: "#666", marginTop: 1 }}>{s.spent_booking_id ? "사용함" : STAMP_KIND_LABEL[s.kind]}</div>
              </div>
            ))}
          </div>
          {data.stamps.length > 8 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} style={{ width: "100%", marginTop: 8, padding: 8, border: "none", background: "transparent", color: "#6B5525", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {showAll ? "접기" : `전체 ${data.stamps.length}개 보기`}
            </button>
          )}
        </>
      )}

      {courses.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#444" }}>코스 완주</div>
          {courses.slice(0, 4).map((c) => (
            <div key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, color: "#555" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                <b style={{ flexShrink: 0, color: c.completed ? "#48603A" : "#6B5525" }}>{c.completed ? "완주" : `${c.done}/${c.total}`}</b>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "#F1ECE0", marginTop: 4, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((c.done / c.total) * 100)}%`, height: "100%", background: c.completed ? "#5C7A4A" : "#C9A95C" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11.5, color: "#666", lineHeight: 1.7 }}>
        숙소를 예약할 때 1개당 {STAMP_VALUE_WON}원씩, 예약 금액의 {Math.round(STAMP_MAX_RATE * 100)}%까지 할인받아요.<br />
        숙박을 마치거나 저장한 코스의 모든 장소를 다녀오면 스탬프를 더 받아요. 현금으로 바꿀 수 없어요.
      </div>
    </section>
  );
}
