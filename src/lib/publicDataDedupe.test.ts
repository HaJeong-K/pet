import { describe, expect, it } from "vitest";
import { dedupeAcrossSources } from "./publicDataDedupe";

describe("dedupeAcrossSources", () => {
  const culture = { source_id: "culture-1", name: "올림픽공원", address: "서울 송파구 올림픽로 424", hours: "매일 05:00~22:00", image_url: undefined };
  const tour = { source_id: "tour-9", name: "올림픽 공원", address: "서울 송파구 올림픽로 424 (방이동)", hours: "상시", image_url: "https://x/a.jpg", phone: "02-1", memo: "관광공사" };

  it("같은 장소는 먼저 나온 출처로 하나만 남긴다", () => {
    const out = dedupeAcrossSources([culture], [tour]);
    expect(out).toHaveLength(1);
    expect(out[0].source_id).toBe("culture-1");
  });

  it("비어 있는 칸만 뒤 출처로 채운다", () => {
    const [place] = dedupeAcrossSources([culture], [tour]);
    expect(place.image_url).toBe("https://x/a.jpg");
    expect(place.phone).toBe("02-1");
    expect(place.hours).toBe("매일 05:00~22:00");
    expect(place.memo).toBeUndefined();
  });

  it("원본 목록은 바꾸지 않는다(다음 갱신 때 다시 쓰는 목록)", () => {
    dedupeAcrossSources([culture], [tour]);
    expect(culture.image_url).toBeUndefined();
  });

  it("다른 장소는 합치지 않는다", () => {
    const other = { source_id: "tour-2", name: "다른 곳", address: "부산" };
    expect(dedupeAcrossSources([culture], [other])).toHaveLength(2);
  });
});
