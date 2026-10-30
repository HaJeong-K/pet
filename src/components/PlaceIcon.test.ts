import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sprout } from "lucide-react";
import { PARK_ICON_SHAPE, PLACE_ICON_COMPONENTS, PLACE_ICON_SHAPES, placeIconKey, placeIconSvg, type PlaceIconKey } from "./PlaceIcon";

// lucide가 그린 결과에서 도형만 꺼내, 속성 순서·닫는 태그와 무관하게 비교합니다
const shapes = (html: string) => [...html.matchAll(/<(path|circle)\s([^>]*?)\/?>/g)].map((m) => `${m[1]} ${m[2].trim().split(/\s+(?=\w+=)/).sort().join(" ")}`);

describe("장소 아이콘", () => {
  it.each(Object.keys(PLACE_ICON_SHAPES) as PlaceIconKey[])("마커의 %s 그림이 필터 아이콘과 같다", (key) => {
    expect(shapes(PLACE_ICON_SHAPES[key])).toEqual(shapes(renderToStaticMarkup(createElement(PLACE_ICON_COMPONENTS[key]))));
  });
  it("공원 마커도 공원 필터 아이콘과 같다", () => {
    expect(shapes(PARK_ICON_SHAPE)).toEqual(shapes(renderToStaticMarkup(createElement(Sprout))));
  });
  it.each([
    [{ category: "동물병원", pet_zone: "indoor" }, "vet"],
    [{ category: "동물약국" }, "pharmacy"],
    [{ category: "펜션", pet_zone: "both" }, "lodging"],
    [{ category: "카페", pet_zone: "indoor" }, "indoor"],
    [{ category: "카페", pet_zone: "terrace" }, "terrace"],
    [{ category: "카페", pet_zone: "both" }, "both"],
    [{ category: "카페", pet_zone: null }, "default"],
  ])("%o → %s", (place, key) => {
    expect(placeIconKey(place)).toBe(key);
  });
  it("마커 그림에 이모지가 없다", () => {
    expect(placeIconSvg({ category: "동물병원" })).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
