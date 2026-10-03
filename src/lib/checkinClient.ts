// src/lib/checkinClient.ts
//
// 방문 체크인(방문 인증) 요청 — 브라우저용.
// 장소 상세의 "방문 인증" 버튼과 산책 모드의 자동 도착 인증이 함께 씁니다.
// 실제 거리 확인은 서버(/api/checkin)가 합니다.

import { supabase } from "@/lib/supabase";
import { getUserKey } from "@/lib/analytics";
import type { GpsFix } from "@/lib/walkMode";

export type CheckinResult =
  | { ok: true; already: boolean }
  | { ok: false; error: string };

/** 현재 위치를 한 번 읽습니다(GPS 우선). */
export function readCurrentFix(): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("이 브라우저에서는 위치를 확인할 수 없어요."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp }),
      (err) => reject(new Error(
        err.code === err.PERMISSION_DENIED
          ? "위치 권한이 꺼져 있어요. 브라우저 주소창의 자물쇠 아이콘에서 위치를 허용해 주세요."
          : "현재 위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
      )),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  });
}

/** fix를 주면 그 위치로, 안 주면 지금 위치를 읽어서 방문 인증을 요청합니다. */
export async function requestCheckin(placeId: number, source: "manual" | "walk", fix?: GpsFix): Promise<CheckinResult> {
  try {
    const at = fix ?? (await readCurrentFix());
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ placeId, lat: at.lat, lng: at.lng, accuracy: at.accuracy, userKey: getUserKey(), source }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) return { ok: false, error: json.error || "방문 인증에 실패했어요." };
    return { ok: true, already: !!json.already };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "방문 인증에 실패했어요." };
  }
}

export async function fetchCheckinSummary(placeId: number): Promise<{ count: number; verifiedReviewIds: number[] }> {
  try {
    const res = await fetch(`/api/checkin?placeId=${placeId}`);
    if (!res.ok) return { count: 0, verifiedReviewIds: [] };
    const json = await res.json();
    return { count: Number(json.count) || 0, verifiedReviewIds: Array.isArray(json.verifiedReviewIds) ? json.verifiedReviewIds : [] };
  } catch {
    return { count: 0, verifiedReviewIds: [] };
  }
}
