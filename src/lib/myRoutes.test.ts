import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { appendStop, moveStop, removeStop, routeDistanceKm } from "./myRoutes";

const a = { id: 1, name: "A", lat: 37.5, lng: 127.0 };
const b = { id: 2, name: "B", lat: 37.51, lng: 127.0 };
const c = { id: 3, name: "C", lat: 37.52, lng: 127.0 };

describe("내 경로 순서", () => {
  it("끝에 붙이고, 이미 있으면 그대로", () => {
    expect(appendStop([a], b)).toEqual({ stops: [a, b], added: true });
    expect(appendStop([a, b], a)).toEqual({ stops: [a, b], added: false });
  });
  it("위·아래로 옮기기(끝에서는 그대로)", () => {
    expect(moveStop([a, b, c], 2, -1)).toEqual([a, c, b]);
    expect(moveStop([a, b, c], 0, 1)).toEqual([b, a, c]);
    expect(moveStop([a, b, c], 0, -1)).toEqual([a, b, c]);
    expect(moveStop([a, b, c], 2, 1)).toEqual([a, b, c]);
  });
  it("빼기", () => {
    expect(removeStop([a, b, c], 1)).toEqual([a, c]);
  });
  it("순서대로 이은 직선거리", () => {
    expect(routeDistanceKm([a])).toBe(0);
    expect(routeDistanceKm([a, b, c])).toBeCloseTo(2.2, 1);
    expect(routeDistanceKm([a, c, b])).toBeGreaterThan(routeDistanceKm([a, b, c]));
  });
});
