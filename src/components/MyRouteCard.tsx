"use client";

// 마이페이지 "코스·내 경로"의 내 경로 카드 — 장소 순서 바꾸기(↑ ↓), 빼기, 이름 바꾸기, 순서대로 길찾기.
// 바꿀 때마다 바로 저장하고, 실패하면 원래대로 되돌립니다. 저장·규칙은 src/lib/myRoutes.ts.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, MapPinned, Navigation, Pencil, Trash2, X } from "lucide-react";
import { moveStop, MY_ROUTE_TITLE_MAX, removeStop, routeDistanceKm, saveMyRoute } from "@/lib/myRoutes";
import { openKakaoWalk, openNaverWalk } from "@/lib/directions";
import type { SavedCourse, SavedStop } from "@/lib/savedCourses";

const iconButton: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: "1px solid #e8eaed", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 };

export default function MyRouteCard({ route, onDelete }: { route: SavedCourse; onDelete: (id: number) => void }) {
  const router = useRouter();
  const [stops, setStops] = useState<SavedStop[]>(route.stops);
  const [title, setTitle] = useState(route.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draft, setDraft] = useState(route.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: SavedStop[], nextTitle?: string) => {
    if (busy) return;
    const before = { stops, title };
    setStops(next);
    if (nextTitle !== undefined) setTitle(nextTitle);
    setBusy(true);
    setError(null);
    const result = await saveMyRoute(route.id, next, nextTitle);
    setBusy(false);
    if (!result.ok) { setStops(before.stops); setTitle(before.title); setError(result.error); }
  };
  const points = stops.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name }));
  const km = routeDistanceKm(stops);

  return (
    <div style={{ marginBottom: 12, padding: "14px 15px", background: "white", borderRadius: 18, border: "1px solid #cfdcc3", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#E4EBDC", color: "#48603A" }}><MapPinned size={10} />내 경로</span>
          {editingTitle ? (
            <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, MY_ROUTE_TITLE_MAX))} onKeyDown={(e) => { if (e.key === "Enter") { setEditingTitle(false); save(stops, draft); } }} autoFocus style={{ flex: 1, minWidth: 0, padding: "7px 9px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13.5, fontFamily: "inherit" }} />
              <button onClick={() => { setEditingTitle(false); save(stops, draft); }} aria-label="이름 저장" style={iconButton}><Check size={13} color="#3F6B2B" /></button>
              <button onClick={() => { setEditingTitle(false); setDraft(title); }} aria-label="이름 바꾸기 취소" style={iconButton}><X size={13} color="#999" /></button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#222", wordBreak: "keep-all" }}>{title}</span>
              <button onClick={() => { setDraft(title); setEditingTitle(true); }} aria-label="경로 이름 바꾸기" style={{ ...iconButton, width: 24, height: 24, border: "none" }}><Pencil size={12} color="#999" /></button>
            </div>
          )}
          <div style={{ marginTop: 3, fontSize: 11, color: "#999" }}>{stops.length}곳{stops.length >= 2 ? ` · 순서대로 직선 약 ${km}km` : ""}</div>
        </div>
        <button onClick={() => onDelete(route.id)} aria-label="내 경로 삭제" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: "none", background: "#f5f6f8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Trash2 size={13} color="#999" />
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {stops.map((st, i) => (
          <div key={`${st.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 8px", borderRadius: 11, border: "1px solid #f0f0f0", background: "#fafafa" }}>
            <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", background: "#5C7A4A", color: "white", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
            <button onClick={() => router.push(`/place/${st.id}`)} style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.name}</span>
              {(st.category || st.address) && <span style={{ display: "block", fontSize: 11, color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[st.category, st.address].filter(Boolean).join(" · ")}</span>}
            </button>
            <button onClick={() => save(moveStop(stops, i, -1))} disabled={busy || i === 0} aria-label={`${st.name} 위로`} style={{ ...iconButton, opacity: i === 0 ? 0.35 : 1 }}><ArrowUp size={12} color="#666" /></button>
            <button onClick={() => save(moveStop(stops, i, 1))} disabled={busy || i === stops.length - 1} aria-label={`${st.name} 아래로`} style={{ ...iconButton, opacity: i === stops.length - 1 ? 0.35 : 1 }}><ArrowDown size={12} color="#666" /></button>
            <button onClick={() => save(removeStop(stops, i))} disabled={busy || stops.length <= 1} aria-label={`${st.name} 빼기`} style={{ ...iconButton, borderColor: "#f3c7c5", opacity: stops.length <= 1 ? 0.35 : 1 }}><X size={12} color="#b42318" /></button>
          </div>
        ))}
      </div>
      {error && <div role="status" style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
      <div style={{ marginTop: 8, fontSize: 11.5, color: "#999" }}>장소 상세의 &ldquo;내 경로에 추가&rdquo;로 장소를 더 담을 수 있어요.</div>

      {points.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
          <button onClick={() => (points.length >= 2 ? openKakaoWalk(points) : router.push(`/place/${stops[0].id}`))} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid #cfdcc3", background: "white", color: "#48603A", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Navigation size={12} />카카오맵 길찾기
          </button>
          <button onClick={() => openNaverWalk(points[points.length - 1], points.slice(1, -1), points.length >= 2 ? points[0] : undefined)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid #03C75A", background: "white", color: "#03A24A", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Navigation size={12} />네이버지도
          </button>
        </div>
      )}
    </div>
  );
}
