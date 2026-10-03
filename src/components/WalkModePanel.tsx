"use client";

// 산책 모드 — AI 추천 코스를 실제로 걸으면서 따라가는 진행 카드.
//   · 위치를 계속 받아 다음 정거장까지 남은 거리, 걸은 거리, 걸린 시간을 보여 줍니다.
//   · 정거장 근처(60m)에 도착하면 자동으로 다음 정거장으로 넘어가고, 그 장소에 방문 인증을 남깁니다.
//   · 끝내면 요약(시간·거리·들른 곳)을 보여 주고 후기 작성으로 이어 줍니다.
// 계산은 src/lib/walkMode.ts(테스트 있음), 방문 인증은 서버가 거리를 다시 확인합니다.
// ⚠ 지도의 "내 위치"(userLocation) 상태는 건드리지 않습니다 — 그 값이 바뀌면 추천 코스가 다시 계산돼
//    걷는 도중에 코스가 바뀌어 버리기 때문에, 산책 중 위치 점은 여기서 따로 그립니다.

import { useEffect, useRef, useState } from "react";
import { Footprints, Flag, X, Check, Navigation, MapPin } from "lucide-react";
import { advanceWalk, distanceM, initialWalkState, formatWalkDistance, formatElapsed, MAX_USABLE_ACCURACY_M, type GpsFix, type WalkState } from "@/lib/walkMode";
import { requestCheckin } from "@/lib/checkinClient";
import { trackEvent } from "@/lib/analytics";

export type WalkStop = { id: string | number; name: string; lat: number; lng: number };

type Props = {
  stops: WalkStop[];
  /** 카카오 지도 객체 — 산책 중 내 위치 점을 그리고, 정거장으로 화면을 옮길 때 씁니다. */
  map: any;
  isMobile: boolean;
  authUserId?: string | null;
  /** 요약 화면에서 장소를 눌렀을 때(상세 열기 → 후기 작성) */
  onOpenStop: (stop: WalkStop) => void;
  onClose: () => void;
};

/** 방문 인증을 남길 수 있는 장소 번호(공원 등 장소 표에 없는 정거장은 null) */
const checkinPlaceId = (stop: WalkStop): number | null => {
  const id = Number(stop.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export default function WalkModePanel({ stops, map, isMobile, authUserId, onOpenStop, onClose }: Props) {
  const [walk, setWalk] = useState<WalkState>(initialWalkState);
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [verified, setVerified] = useState<Set<number>>(new Set()); // 방문 인증된 정거장 순서
  const startedAtRef = useRef(Date.now());
  const endedAtRef = useRef<number | null>(null);
  const walkRef = useRef(walk);
  const finishedRef = useRef(false);
  const dotRef = useRef<any>(null);

  // 정거장 도착 처리(자동 도착·"도착했어요" 버튼 공통)
  const handleArrived = (idx: number, at: GpsFix | null) => {
    const stop = stops[idx];
    if (!stop) return;
    setNotice(`${idx + 1}번 ${stop.name}에 도착했어요!`);
    try { navigator.vibrate?.(200); } catch { /* 진동 미지원 */ }
    trackEvent("walk_arrive", { authUserId: authUserId ?? null, placeId: String(stop.id), placeName: stop.name, meta: { pos: idx + 1, total: stops.length } });
    const placeId = checkinPlaceId(stop);
    if (placeId && at) {
      requestCheckin(placeId, "walk", at).then((r) => {
        if (r.ok) setVerified((prev) => new Set(prev).add(idx));
      });
    }
  };
  const handleArrivedRef = useRef(handleArrived);
  handleArrivedRef.current = handleArrived;

  // 위치 추적
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError("이 브라우저에서는 위치를 확인할 수 없어요."); return; }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (finishedRef.current) return;
        const next: GpsFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp || Date.now() };
        setGpsError(null);
        setFix(next);
        const result = advanceWalk(walkRef.current, stops, next);
        walkRef.current = result.state;
        setWalk(result.state);
        if (result.arrived !== null) handleArrivedRef.current(result.arrived, next);
      },
      (err) => setGpsError(
        err.code === err.PERMISSION_DENIED
          ? "위치 권한이 꺼져 있어요. 주소창의 자물쇠 아이콘에서 위치를 허용해 주세요."
          : "위치를 확인하지 못하고 있어요. 하늘이 보이는 곳에서 잠시 기다려 주세요."
      ),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [stops]);

  // 걸린 시간 표시 갱신 + 화면 꺼짐 방지(지원하는 브라우저만)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    let lock: any = null;
    let released = false;
    const acquire = () => {
      (navigator as any).wakeLock?.request("screen").then((l: any) => { if (released) l.release().catch(() => {}); else lock = l; }).catch(() => {});
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  // 산책 중 내 위치 점
  useEffect(() => {
    const kakao = (window as any).kakao;
    if (!map || !fix || !kakao?.maps) return;
    const position = new kakao.maps.LatLng(fix.lat, fix.lng);
    if (!dotRef.current) {
      dotRef.current = new kakao.maps.CustomOverlay({
        position,
        content: '<div style="width:18px;height:18px;border-radius:50%;background:#7c3aed;border:3px solid white;box-shadow:0 0 0 6px rgba(124,58,237,0.22),0 2px 6px rgba(0,0,0,0.3);"></div>',
        zIndex: 20,
      });
      dotRef.current.setMap(map);
    } else {
      dotRef.current.setPosition(position);
    }
  }, [map, fix]);
  useEffect(() => () => { dotRef.current?.setMap(null); dotRef.current = null; }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    endedAtRef.current = Date.now();
    setFinished(true);
    trackEvent("walk_finish", {
      authUserId: authUserId ?? null,
      meta: { visited: walkRef.current.visited.length, total: stops.length, walkedM: Math.round(walkRef.current.walkedM), minutes: Math.round((Date.now() - startedAtRef.current) / 60000) },
    });
  };

  // 마지막 정거장까지 도착하면 자동으로 요약으로
  useEffect(() => {
    if (stops.length > 0 && walk.nextIndex >= stops.length) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk.nextIndex, stops.length]);

  const nextStop = stops[walk.nextIndex];
  const usableFix = fix && fix.accuracy <= MAX_USABLE_ACCURACY_M ? fix : null;
  const distToNext = nextStop && usableFix ? distanceM(usableFix, nextStop) : null;
  const elapsed = (endedAtRef.current ?? now) - startedAtRef.current;

  const panTo = (stop: WalkStop) => {
    const kakao = (window as any).kakao;
    if (map && kakao?.maps) map.panTo(new kakao.maps.LatLng(stop.lat, stop.lng));
  };

  // GPS가 안 잡히거나 실내라 자동 도착이 안 될 때 직접 넘기기
  const markArrivedManually = () => {
    const idx = walkRef.current.nextIndex;
    if (idx >= stops.length) return;
    const state = { ...walkRef.current, nextIndex: idx + 1, visited: [...walkRef.current.visited, idx] };
    walkRef.current = state;
    setWalk(state);
    handleArrived(idx, usableFix); // 방문 인증은 서버가 거리를 다시 확인하므로, 멀리서 눌러도 인증은 남지 않습니다.
  };

  const cardStyle: React.CSSProperties = {
    position: "fixed", zIndex: 90, left: "50%", translate: "-50% 0",
    top: isMobile ? "112px" : "118px",
    width: isMobile ? "calc(100vw - 20px)" : "380px", maxWidth: "calc(100vw - 20px)",
    background: "white", borderRadius: "16px", boxShadow: "0 8px 28px rgba(60,20,120,0.25)",
    border: "1px solid rgba(124,58,237,0.25)", overflow: "hidden",
  };

  if (finished) {
    const visitedStops = walk.visited.map((i) => ({ stop: stops[i], idx: i })).filter((v) => v.stop);
    return (
      <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 89 }} onClick={onClose} />
        <div className="ggk-body" style={{ ...cardStyle, top: "50%", translate: "-50% -50%", maxHeight: "80dvh", display: "flex", flexDirection: "column" }} role="dialog" aria-label="산책 요약">
          <div style={{ padding: "16px 16px 12px", background: "linear-gradient(135deg,#7c3aed,#5b21b6)", color: "white" }}>
            <div className="ggk-title" style={{ fontSize: "16px", fontWeight: 800, display: "flex", alignItems: "center", gap: "6px" }}>
              <Flag size={16} />산책 끝! 수고했어요
            </div>
            <div style={{ display: "flex", gap: "14px", marginTop: "10px", fontSize: "12px", fontWeight: 700 }}>
              <span>걸은 시간 {formatElapsed(elapsed)}</span>
              <span>걸은 거리 {formatWalkDistance(walk.walkedM)}</span>
              <span>들른 곳 {visitedStops.length}/{stops.length}</span>
            </div>
          </div>
          <div style={{ padding: "12px 14px", overflowY: "auto" }}>
            {visitedStops.length === 0 ? (
              <div style={{ fontSize: "12px", color: "#888", padding: "8px 0" }}>이번엔 들른 곳이 없어요. 다음 산책에서 다시 도전해 봐요!</div>
            ) : (
              <>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "8px" }}>다녀온 곳은 어땠나요? 후기를 남기면 다른 보호자에게 큰 도움이 돼요.</div>
                {visitedStops.map(({ stop, idx }) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderTop: "1px solid #f3f3f3" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{idx + 1}. {stop.name}</div>
                      {verified.has(idx) && (
                        <div style={{ fontSize: "10px", color: "#059669", fontWeight: 700, display: "flex", alignItems: "center", gap: "2px", marginTop: "2px" }}><Check size={10} />방문 인증 완료</div>
                      )}
                    </div>
                    {checkinPlaceId(stop) && (
                      <button onClick={() => { onOpenStop(stop); onClose(); }} style={{ flexShrink: 0, padding: "6px 10px", borderRadius: "999px", border: "1px solid rgba(124,58,237,0.4)", background: "#f5f0ff", color: "#5b21b6", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                        후기 쓰기
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
          <div style={{ padding: "10px 14px 14px" }}>
            <button onClick={onClose} style={{ width: "100%", padding: "11px 0", borderRadius: "12px", border: "none", background: "#5b21b6", color: "white", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>닫기</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="ggk-body" style={cardStyle} role="status" aria-label="산책 모드">
      <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", background: "linear-gradient(135deg,#7c3aed,#5b21b6)", color: "white" }}>
        <Footprints size={14} />
        <span className="ggk-title" style={{ fontSize: "12.5px", fontWeight: 800 }}>산책 중</span>
        <span style={{ fontSize: "11px", opacity: 0.9 }}>{formatElapsed(elapsed)} · {formatWalkDistance(walk.walkedM)}</span>
        <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 700 }}>{walk.visited.length}/{stops.length}곳</span>
        <button onClick={finish} aria-label="산책 끝내기" style={{ marginLeft: "4px", padding: "4px 9px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.15)", color: "white", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}>
          <X size={11} />끝내기
        </button>
      </div>

      <div style={{ padding: "10px 12px" }}>
        {notice && (
          <div style={{ marginBottom: "8px", padding: "7px 10px", borderRadius: "10px", background: "#ecfdf5", color: "#047857", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "5px" }}>
            <Check size={13} />{notice}
          </div>
        )}
        {nextStop && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={() => panTo(nextStop)} title="지도에서 보기" style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              <div style={{ fontSize: "10.5px", color: "#7c3aed", fontWeight: 700, display: "flex", alignItems: "center", gap: "3px" }}>
                <MapPin size={10} />다음 {walk.nextIndex + 1}번째
              </div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#1f1235", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nextStop.name}</div>
            </button>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#5b21b6", lineHeight: 1.1 }}>{distToNext != null ? formatWalkDistance(distToNext) : "—"}</div>
              <div style={{ fontSize: "10px", color: "#999" }}>{distToNext != null ? `도보 약 ${Math.max(1, Math.round(distToNext / 67))}분` : "위치 확인 중"}</div>
            </div>
          </div>
        )}
        {gpsError ? (
          <div style={{ marginTop: "8px", fontSize: "11px", color: "#b45309", lineHeight: 1.5 }}>{gpsError}</div>
        ) : fix && !usableFix ? (
          <div style={{ marginTop: "8px", fontSize: "11px", color: "#b45309", lineHeight: 1.5 }}>위치가 아직 정확하지 않아요(오차 약 {formatWalkDistance(fix.accuracy)}). 밖으로 나가면 정확해져요.</div>
        ) : null}
        {nextStop && (
          <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
            <button onClick={markArrivedManually} style={{ flex: 1, padding: "8px 0", borderRadius: "10px", border: "1px solid rgba(124,58,237,0.4)", background: "#f5f0ff", color: "#5b21b6", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
              <Check size={12} />도착했어요
            </button>
            {usableFix && (
              <button onClick={() => { const kakao = (window as any).kakao; if (map && kakao?.maps) map.panTo(new kakao.maps.LatLng(usableFix.lat, usableFix.lng)); }} style={{ flex: 1, padding: "8px 0", borderRadius: "10px", border: "1px solid #e5e7eb", background: "white", color: "#555", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                <Navigation size={12} />내 위치 보기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
