// src/lib/walkMode.ts
//
// 산책 모드 핵심 계산(화면과 분리해 테스트하기 쉽게 둔 순수 함수).
//   - 정거장 도착 판정: 다음 정거장 반경(ARRIVE_RADIUS_M) 안에 들어오면 도착
//   - 걸은 거리 누적: GPS는 가만히 있어도 몇 m씩 흔들리므로, 정확도가 나쁜 값·너무 작은 이동·순간이동
//     (비현실적 속도)은 버리고 실제로 움직인 구간만 더합니다.
// 방문 체크인(서버 /api/checkin)도 같은 거리 함수를 씁니다.

export type LatLng = { lat: number; lng: number };
export type GpsFix = LatLng & { accuracy: number; at: number };

/** 정거장에 이만큼 가까워지면 도착으로 봅니다. */
export const ARRIVE_RADIUS_M = 60;
/** 방문 체크인 허용 거리 — 건물 크기·GPS 오차를 감안한 값 */
export const CHECKIN_RADIUS_M = 150;
/** 이보다 정확도가 나쁜 위치는 체크인·도착 판정에 쓰지 않습니다(와이파이·IP 기반 추정 등). */
export const MAX_USABLE_ACCURACY_M = 100;
/** 이보다 작은 이동은 GPS 흔들림으로 보고 거리에 더하지 않습니다. */
const MIN_STEP_M = 8;
/** 사람+반려견 산책으로는 나올 수 없는 속도(시속 약 22km) — 넘으면 위치 튐으로 봅니다. */
const MAX_SPEED_MPS = 6;

export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export type WalkState = {
  /** 다음에 갈 정거장 순서(0부터). 정거장 수와 같아지면 모두 방문한 것 */
  nextIndex: number;
  /** 도착 처리된 정거장 순서 목록 */
  visited: number[];
  /** 실제로 걸은 거리(m) */
  walkedM: number;
  /** 마지막으로 거리 계산에 쓴 위치 */
  lastFix: GpsFix | null;
};

export const initialWalkState = (): WalkState => ({ nextIndex: 0, visited: [], walkedM: 0, lastFix: null });

/**
 * 새 위치를 반영한 산책 상태를 돌려줍니다.
 * arrived: 이번 위치로 새로 도착 처리된 정거장 순서(없으면 null)
 */
export function advanceWalk(state: WalkState, stops: LatLng[], fix: GpsFix): { state: WalkState; arrived: number | null } {
  if (fix.accuracy > MAX_USABLE_ACCURACY_M) return { state, arrived: null };

  let walkedM = state.walkedM;
  let lastFix = state.lastFix;
  if (!lastFix) {
    lastFix = fix;
  } else {
    const step = distanceM(lastFix, fix);
    const seconds = Math.max(1, (fix.at - lastFix.at) / 1000);
    if (step / seconds > MAX_SPEED_MPS) {
      // 위치가 튄 값 — 거리에 더하지 않되, 기준점은 옮겨 다음 계산이 계속 튀지 않게 합니다.
      lastFix = fix;
    } else if (step >= Math.max(MIN_STEP_M, fix.accuracy / 2)) {
      walkedM += step;
      lastFix = fix;
    }
  }

  let nextIndex = state.nextIndex;
  let visited = state.visited;
  let arrived: number | null = null;
  if (nextIndex < stops.length && distanceM(stops[nextIndex], fix) <= ARRIVE_RADIUS_M) {
    arrived = nextIndex;
    visited = [...visited, nextIndex];
    nextIndex += 1;
  }
  return { state: { nextIndex, visited, walkedM, lastFix }, arrived };
}

export function formatWalkDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
}

export function formatElapsed(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
}
