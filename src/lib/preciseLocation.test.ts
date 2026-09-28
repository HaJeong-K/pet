import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchBestPosition, type LocationFix } from "./preciseLocation";

type Success = (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Failure = (err: { code: number; PERMISSION_DENIED: number }) => void;

let success: Success;
let failure: Failure;
const clearWatch = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  clearWatch.mockReset();
  vi.stubGlobal("navigator", {
    geolocation: {
      watchPosition: (s: Success, f: Failure) => {
        success = s;
        failure = f;
        return 7;
      },
      clearWatch,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const fix = (accuracy: number, lat = 35.1) => ({ coords: { latitude: lat, longitude: 129, accuracy } });

describe("watchBestPosition", () => {
  it("오차가 줄어들 때마다 알리고, 목표 정확도에 닿으면 멈춘다", () => {
    const calls: [LocationFix, boolean][] = [];
    watchBestPosition((f, final) => calls.push([f, final]), () => {});
    success(fix(800));
    success(fix(120, 35.2));
    success(fix(15, 35.3));
    expect(calls.map(([f, final]) => [f.accuracy, final])).toEqual([[800, false], [120, false], [15, true]]);
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it("더 부정확하거나 거의 같은 값은 무시한다", () => {
    const calls: number[] = [];
    watchBestPosition((f) => calls.push(f.accuracy), () => {});
    success(fix(100));
    success(fix(900)); // 더 나쁨
    success(fix(90)); // 10%만 개선 — 무시
    expect(calls).toEqual([100]);
  });

  it("시간이 다 되면 그때까지의 최선값으로 끝낸다", () => {
    const calls: [number, boolean][] = [];
    watchBestPosition((f, final) => calls.push([f.accuracy, final]), () => {}, { maxWaitMs: 5000 });
    success(fix(300));
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual([[300, false], [300, true]]);
  });

  it("권한이 거부되면 바로 실패로 끝낸다", () => {
    const onFail = vi.fn();
    watchBestPosition(() => {}, onFail);
    failure({ code: 1, PERMISSION_DENIED: 1 });
    expect(onFail).toHaveBeenCalledWith("denied");
  });

  it("중단 함수를 부르면 더 이상 알리지 않는다", () => {
    const onImprove = vi.fn();
    const stop = watchBestPosition(onImprove, () => {});
    stop();
    success(fix(50));
    vi.advanceTimersByTime(20_000);
    expect(onImprove).not.toHaveBeenCalled();
  });
});
