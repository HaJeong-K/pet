import { describe, it, expect } from "vitest";
import { advanceWalk, distanceM, initialWalkState, formatWalkDistance, formatElapsed, ARRIVE_RADIUS_M, type GpsFix, type LatLng } from "./walkMode";

// 위도 0.0001도 ≈ 11m
const at = (lat: number, lng: number, sec: number, accuracy = 10): GpsFix => ({ lat, lng, accuracy, at: sec * 1000 });
const stops: LatLng[] = [{ lat: 35.001, lng: 128 }, { lat: 35.002, lng: 128 }];

describe("산책 모드 계산", () => {
  it("두 좌표 사이 거리를 미터로 계산한다", () => {
    expect(Math.round(distanceM({ lat: 35, lng: 128 }, { lat: 35.001, lng: 128 }))).toBe(111);
  });

  it("정거장 반경 안에 들어오면 도착 처리하고 다음 정거장으로 넘어간다", () => {
    let s = initialWalkState();
    let r = advanceWalk(s, stops, at(35.0, 128, 0));
    expect(r.arrived).toBeNull();
    s = r.state;
    r = advanceWalk(s, stops, at(35.0006, 128, 60)); // 정거장까지 약 44m
    expect(distanceM(stops[0], { lat: 35.0006, lng: 128 })).toBeLessThan(ARRIVE_RADIUS_M);
    expect(r.arrived).toBe(0);
    expect(r.state.nextIndex).toBe(1);
    expect(r.state.visited).toEqual([0]);
  });

  it("같은 정거장을 두 번 도착 처리하지 않는다", () => {
    let s = advanceWalk(initialWalkState(), stops, at(35.001, 128, 0)).state;
    const r = advanceWalk(s, stops, at(35.001, 128, 30));
    expect(r.arrived).toBeNull();
    expect(r.state.visited).toEqual([0]);
  });

  it("가만히 있을 때의 GPS 흔들림은 걸은 거리에 더하지 않는다", () => {
    let s = advanceWalk(initialWalkState(), [], at(35, 128, 0)).state;
    for (let i = 1; i <= 20; i++) s = advanceWalk(s, [], at(35 + (i % 2) * 0.00003, 128, i * 5)).state; // 약 3m 흔들림
    expect(s.walkedM).toBe(0);
  });

  it("실제로 걸은 구간은 더한다", () => {
    let s = advanceWalk(initialWalkState(), [], at(35, 128, 0)).state;
    s = advanceWalk(s, [], at(35.0005, 128, 60)).state; // 약 55m를 1분에
    s = advanceWalk(s, [], at(35.001, 128, 120)).state;
    expect(Math.round(s.walkedM)).toBeGreaterThan(100);
    expect(Math.round(s.walkedM)).toBeLessThan(120);
  });

  it("위치가 순간이동한 값(비현실적 속도)은 거리에 더하지 않는다", () => {
    let s = advanceWalk(initialWalkState(), [], at(35, 128, 0)).state;
    s = advanceWalk(s, [], at(35.01, 128, 5)).state; // 5초에 1.1km
    expect(s.walkedM).toBe(0);
  });

  it("정확도가 나쁜 위치로는 도착 처리하지 않는다", () => {
    const r = advanceWalk(initialWalkState(), stops, at(35.001, 128, 0, 800));
    expect(r.arrived).toBeNull();
  });

  it("거리·시간을 읽기 쉽게 표시한다", () => {
    expect(formatWalkDistance(347)).toBe("350m");
    expect(formatWalkDistance(1840)).toBe("1.8km");
    expect(formatElapsed(47 * 60000)).toBe("47분");
    expect(formatElapsed(95 * 60000)).toBe("1시간 35분");
  });
});
