"use client";

// 장소 상세의 "내 경로에 추가" 창 — 내가 만든 경로 중 하나를 골라 이 장소를 끝에 붙이거나, 새 경로를 만듭니다.
// 순서 바꾸기·빼기·이름 바꾸기는 마이페이지 "코스·내 경로"에서 합니다. 저장·규칙은 src/lib/myRoutes.ts.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, MapPinned, Plus, X } from "lucide-react";
import { addStopToMyRoute, createMyRoute, listMyRoutes, MY_ROUTE_STOPS_MAX, MY_ROUTE_TITLE_MAX } from "@/lib/myRoutes";
import type { SavedCourse, SavedStop } from "@/lib/savedCourses";

export default function AddToRouteSheet({ stop, onClose }: { stop: SavedStop; onClose: () => void }) {
  const [routes, setRoutes] = useState<SavedCourse[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { let off = false; listMyRoutes().then((r) => { if (!off) setRoutes(r); }); return () => { off = true; }; }, []);

  const add = async (route: SavedCourse) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await addStopToMyRoute(route, stop);
    setBusy(false);
    if (!result.ok) { setMessage({ ok: false, text: result.error }); return; }
    setMessage({ ok: true, text: result.added ? `"${route.title}" ${route.stops.length + 1}번째로 담았어요.` : `이미 "${route.title}"에 있는 장소예요.` });
    if (result.added) setRoutes((list) => list?.map((r) => (r.id === route.id ? { ...r, stops: [...r.stops, stop] } : r)) ?? null);
  };
  const create = async () => {
    if (busy || !newName.trim()) return;
    setBusy(true);
    setMessage(null);
    const result = await createMyRoute(newName, stop);
    setBusy(false);
    if (!result.ok) { setMessage({ ok: false, text: result.error }); return; }
    setRoutes((list) => [result.route, ...(list ?? [])]);
    setNewName("");
    setMessage({ ok: true, text: `"${result.route.title}" 경로를 만들고 담았어요.` });
  };

  // ⚠ 장소 상세 창(모달) 안에서 열면 그 창의 틀에 갇혀 아래쪽이 잘려 보였습니다 — 화면(body)에 바로 띄웁니다.
  //    휴대폰 아래쪽 홈 바(safe area)만큼 여백도 둡니다.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="내 경로에 추가" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "85dvh", overflowY: "auto", background: "white", borderRadius: "20px 20px 0 0", padding: "18px 18px calc(28px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box", wordBreak: "keep-all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MapPinned size={18} color="#5C7A4A" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#222" }}>내 경로에 추가</div>
            <div style={{ fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stop.name}</div>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#f3f3f3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: "#777", marginTop: 8, lineHeight: 1.6 }}>
          고른 경로의 맨 끝에 담겨요.<br />
          순서는 마이페이지 &ldquo;코스·내 경로&rdquo;에서 바꿀 수 있어요.
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
          {routes === null && <div style={{ fontSize: 13, color: "#aaa", padding: "10px 0" }}>불러오는 중…</div>}
          {routes?.map((r) => {
            const has = r.stops.some((s) => s.id === stop.id);
            const full = r.stops.length >= MY_ROUTE_STOPS_MAX;
            return (
              <button key={r.id} onClick={() => add(r)} disabled={busy || has || full} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 12, border: "1px solid #e8eaed", background: has ? "#F0F7EC" : "white", cursor: has || full ? "default" : "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "#333" }}>{r.title}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "#999", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.stops.length}곳 · {r.stops.map((s) => s.name).join(" → ")}</span>
                </span>
                {has ? <Check size={16} color="#3F6B2B" /> : full ? <span style={{ fontSize: 11, color: "#aaa" }}>가득 참</span> : <Plus size={16} color="#5C7A4A" />}
              </button>
            );
          })}
          {routes?.length === 0 && <div style={{ fontSize: 12.5, color: "#999" }}>아직 만든 경로가 없어요. 아래에서 첫 경로를 만들어 보세요.</div>}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value.slice(0, MY_ROUTE_TITLE_MAX))} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="새 경로 이름 — 예: 강릉 1박 2일 댕댕 여행" style={{ flex: 1, minWidth: 0, padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13.5, fontFamily: "inherit" }} />
          <button onClick={create} disabled={busy || !newName.trim()} style={{ padding: "0 14px", borderRadius: 10, border: "none", background: busy || !newName.trim() ? "#d6d3c9" : "#5C7A4A", color: "white", fontSize: 13, fontWeight: 800, cursor: busy || !newName.trim() ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>만들고 담기</button>
        </div>
        {message && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}{message.ok && <> <a href="/mypage#routes" style={{ color: "#48603A" }}>마이페이지에서 보기</a></>}</div>}
      </div>
    </div>,
    document.body,
  );
}
