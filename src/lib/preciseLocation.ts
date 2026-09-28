// src/lib/preciseLocation.ts
//
// 현재 위치를 "한 번"이 아니라 짧은 시간 동안 여러 번 받아서, 점점 정확한 값으로 좁혀갑니다.
//
// ⚠ getCurrentPosition 한 번만 쓰면 휴대폰은 GPS가 잡히기 전의 대략적인 위치(와이파이·기지국
// 기반, 오차 수십~수백 m)를 먼저 돌려주는 경우가 많고, maximumAge를 주면 몇 분 전 위치를
// 재사용하기도 합니다 — 위치가 "매번 조금씩 어긋나던" 원인입니다. watchPosition으로 최대
// maxWaitMs 동안 새 측정값을 받아, 오차(accuracy)가 눈에 띄게 줄 때마다 onImprove로 알리고,
// 충분히 정확해지면(goodEnoughM 이하) 바로 멈춥니다.

export interface LocationFix {
  lat: number;
  lng: number;
  /** 오차 반경(m) */
  accuracy: number;
}

export interface WatchBestOptions {
  /** 이 오차(m) 이하가 되면 더 기다리지 않고 끝냅니다. */
  goodEnoughM?: number;
  /** 최대 대기 시간(ms). 이 시간이 지나면 그때까지의 최선값으로 끝냅니다. */
  maxWaitMs?: number;
  /** 새 값이 이 비율 이상 정확해져야(오차가 줄어야) 교체합니다 — 잦은 재계산 방지 */
  minImprovementRatio?: number;
}

/**
 * @param onImprove 더 정확한 위치를 받을 때마다 호출. final=true는 마지막 호출(측정 종료).
 * @param onFail    위치를 하나도 못 받고 끝났을 때(권한 거부·시간 초과)
 * @returns 측정을 중단하는 함수(컴포넌트 언마운트 시 호출)
 */
export function watchBestPosition(
  onImprove: (fix: LocationFix, final: boolean) => void,
  onFail: (reason: "denied" | "unavailable") => void,
  { goodEnoughM = 25, maxWaitMs = 12_000, minImprovementRatio = 0.7 }: WatchBestOptions = {}
): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onFail("unavailable");
    return () => {};
  }

  let best: LocationFix | null = null;
  let done = false;
  let watchId: number | null = null;

  const finish = (reason?: "denied" | "unavailable") => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (best) onImprove(best, true);
    else onFail(reason ?? "unavailable");
  };

  const timer = setTimeout(() => finish(), maxWaitMs);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (done) return;
      const fix: LocationFix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : Infinity,
      };
      if (best && fix.accuracy > best.accuracy * minImprovementRatio) {
        // 충분히 나아지지 않은 값은 버립니다(단, 이미 목표 정확도면 종료)
        if (best.accuracy <= goodEnoughM) finish();
        return;
      }
      best = fix;
      if (fix.accuracy <= goodEnoughM) {
        finish();
        return;
      }
      onImprove(fix, false);
    },
    (err) => {
      // 권한 거부는 더 기다려도 소용없어서 바로 끝냅니다. 일시적 실패는 남은 시간 동안 계속 기다립니다.
      if (err.code === err.PERMISSION_DENIED) finish("denied");
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs }
  );

  return () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  };
}
