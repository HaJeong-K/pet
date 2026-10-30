// src/components/PlaceIcon.tsx
//
// 장소 종류 아이콘을 한 곳에서 정합니다 — 지도 위쪽 필터, 지도 마커, 목록 카드, 미리보기 카드가 같은 그림을 씁니다.
//   · 화면(React)은 <PlaceIcon /> / <ParkIcon />
//   · 지도 마커는 카카오맵에 글자(HTML)로 넘겨야 해서 placeIconSvg() / parkIconSvg()
// 마커용 그림은 lucide-react의 같은 아이콘을 옮겨 적은 것입니다(PlaceIcon.test.tsx가 어긋나지 않는지 확인).

import { BedDouble, Home, HousePlus, PawPrint, Pill, Sprout, Stethoscope, Trees, type LucideIcon } from "lucide-react";
import { isLodgingCategory } from "@/lib/ownerKind";

export type PlaceIconKey = "indoor" | "terrace" | "both" | "lodging" | "vet" | "pharmacy" | "default";

type PlaceLike = { category?: string | null; pet_zone?: string | null } | null | undefined;

/** 동물병원·동물약국·숙소는 분류로, 나머지는 동반 범위로 정합니다 */
export function placeIconKey(place: PlaceLike): PlaceIconKey {
  if (place?.category === "동물병원") return "vet";
  if (place?.category === "동물약국") return "pharmacy";
  if (isLodgingCategory(place?.category)) return "lodging";
  const zone = place?.pet_zone;
  return zone === "indoor" || zone === "terrace" || zone === "both" ? zone : "default";
}

export const PLACE_ICON_COMPONENTS: Record<PlaceIconKey, LucideIcon> = {
  indoor: Home, terrace: Trees, both: HousePlus, lodging: BedDouble, vet: Stethoscope, pharmacy: Pill, default: PawPrint,
};
const PLACE_ICON_COLORS: Record<PlaceIconKey, string> = {
  indoor: "#3F5230", terrace: "#3F5230", both: "#3F5230", lodging: "#1D4F91", vet: "#B42318", pharmacy: "#B4532A", default: "#7A6F5C",
};
export const PARK_ICON_COLOR = "#2B5E29";

export function PlaceIcon({ place, size = 12, color }: { place: PlaceLike; size?: number; color?: string }) {
  const key = placeIconKey(place);
  const Icon = PLACE_ICON_COMPONENTS[key];
  return <Icon size={size} color={color ?? PLACE_ICON_COLORS[key]} style={{ flexShrink: 0 }} aria-hidden />;
}

export function ParkIcon({ size = 12, color = PARK_ICON_COLOR }: { size?: number; color?: string }) {
  return <Sprout size={size} color={color} style={{ flexShrink: 0 }} aria-hidden />;
}

// ── 지도 마커용(글자로 된 그림) ──

export const PLACE_ICON_SHAPES: Record<PlaceIconKey, string> = {
  indoor: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  terrace: '<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>',
  both: '<path d="M12.35 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v2.35"/><path d="M14.8 12.4A1 1 0 0 0 14 12h-4a1 1 0 0 0-1 1v8"/><path d="M15 18h6"/><path d="M18 15v6"/>',
  lodging: '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>',
  vet: '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
  pharmacy: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  default: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
};
export const PARK_ICON_SHAPE = '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>';

const svg = (shape: string, color: string, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0" aria-hidden="true">${shape}</svg>`;

export function placeIconSvg(place: PlaceLike, size = 13): string {
  const key = placeIconKey(place);
  return svg(PLACE_ICON_SHAPES[key], PLACE_ICON_COLORS[key], size);
}
export const parkIconSvg = (size = 13): string => svg(PARK_ICON_SHAPE, PARK_ICON_COLOR, size);
