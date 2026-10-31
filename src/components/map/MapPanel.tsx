// src/components/map/MapPanel.tsx
//
// 지도 위 패널의 공용 부품 — 주변 장소·새로 생긴 곳·취향 추천·산책 코스가 같은 머리줄과 같은 장소 카드를 씁니다.
// 한 곳만 고치면 네 패널이 함께 바뀝니다.

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { Crown, MapPin, type LucideIcon } from "lucide-react";
import { ParkIcon } from "@/components/PlaceIcon";
import { shortAddress } from "@/lib/shortAddress";

export const MAP_PANEL_INK = "#1f1a12";
export const MAP_PANEL_GREEN = "#3F5230";

/** 패널 바깥 틀 — 메인 목록과 같은 색·모서리·그림자 */
export const mapPanelFrame: CSSProperties = {
  background: "#FAF8F3",
  border: "1px solid rgba(60,50,30,0.08)",
  borderRadius: "22px",
  overflow: "hidden",
  boxShadow: "0 18px 44px rgba(40,32,16,0.16), 0 3px 10px rgba(40,32,16,0.06)",
  display: "flex",
  flexDirection: "column",
};

export const mapPanelScroll: CSSProperties = {
  overflowY: "auto",
  flex: 1,
  minHeight: 0,
  padding: "10px 8px 6px 10px",
  scrollbarWidth: "thin",
};

export function MapPanelHeader({ Icon = MapPin, title, count, sub, right }: { Icon?: LucideIcon; title: string; count?: string | null; sub?: string | null; right?: ReactNode }) {
  return (
    <div style={{ padding: "13px 13px 11px", background: "white", borderBottom: "1px solid rgba(60,50,30,0.07)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <div style={{ width: 24, height: 24, borderRadius: 8, background: "linear-gradient(135deg,#5C7A4A,#7F9B67)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={13} color="white" />
        </div>
        <div className="ggk-logo" style={{ fontSize: "13.5px", fontWeight: 800, color: MAP_PANEL_INK, letterSpacing: "-0.2px", whiteSpace: "nowrap" }}>{title}</div>
        {count && <div style={{ fontSize: "10px", color: "#6b6150", fontWeight: 700, flexShrink: 0, background: "#F1ECE1", borderRadius: 999, padding: "2px 7px" }}>{count}</div>}
        {right && <div style={{ marginLeft: "auto", flexShrink: 0 }}>{right}</div>}
      </div>
      {sub && <div style={{ marginTop: 5, fontSize: "11px", color: "#655d4f", lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

export function MapPanelEmpty({ children }: { children: ReactNode }) {
  return <div style={{ textAlign: "center", padding: "34px 12px", color: "#6b6150", fontSize: "12px", lineHeight: 1.7 }}>{children}</div>;
}

export type PlaceRowCardProps = {
  image?: string | null;
  name: string;
  isPark?: boolean;
  /** 광고 표시 */
  ad?: boolean;
  /** TOP·NEW·HOT 등 */
  badge?: { label: string; color: string } | null;
  selected?: boolean;
  /** 이름 아래 분류 칩 */
  chip?: ReactNode;
  /** 주소 — 시·도를 뺀 짧은 주소로 보여 줍니다 */
  address?: string | null;
  /** 주소 대신 또는 아래에 넣는 한 줄(거리·추천 이유·등록일 등) */
  meta?: ReactNode;
  /** 이름 줄 오른쪽(고정 버튼 등) */
  action?: ReactNode;
  /** 카드 아래 칸(길찾기 등) */
  footer?: ReactNode;
  imageSize?: number;
  onClick?: () => void;
  style?: CSSProperties;
};

export function PlaceRowCard({ image, name, isPark, ad, badge, selected, chip, address, meta, action, footer, imageSize = 92, onClick, style }: PlaceRowCardProps) {
  return (
    <div
      className="ggk-list-card"
      onClick={onClick}
      style={{
        marginBottom: "10px",
        background: "white",
        borderRadius: "16px",
        cursor: onClick ? "pointer" : "default",
        border: selected ? "1.5px solid #5C7A4A" : ad ? "1px solid rgba(212,162,76,0.6)" : "1px solid rgba(60,50,30,0.08)",
        boxShadow: selected ? "0 6px 18px rgba(92,122,74,0.22)" : ad ? "0 6px 16px rgba(196,148,60,0.16)" : "0 2px 8px rgba(40,32,16,0.05)",
        overflow: "hidden",
        display: "flex",
        alignItems: "stretch",
        ...style,
      }}
    >
      <div style={{ position: "relative", width: imageSize, minHeight: imageSize, flexShrink: 0 }}>
        {isPark ? (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(145deg,#DCE7CD,#A9C48A)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ParkIcon size={Math.round(imageSize * 0.3)} color={MAP_PANEL_GREEN} />
          </div>
        ) : (
          <Image
            src={image || "/images/default-place.png"}
            alt={name}
            fill
            sizes={`${imageSize}px`}
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = "/images/default-place.png"; }}
            style={{ objectFit: "cover" }}
          />
        )}
        {ad && (
          <span title="프리미엄 등록 업장(광고)" style={{
            position: "absolute", top: "7px", left: "7px", display: "inline-flex", alignItems: "center", gap: 3,
            padding: "3px 8px", borderRadius: "7px", fontSize: "10px", fontWeight: 800, lineHeight: 1.3,
            background: "linear-gradient(135deg,#F3DA9B,#D4A24C)", color: "#4A3405", boxShadow: "0 2px 6px rgba(0,0,0,0.22)",
          }}>
            <Crown size={10} />광고
          </span>
        )}
        {badge && (
          <span style={{
            position: "absolute", top: "7px", right: "7px", padding: "2px 8px", borderRadius: "999px",
            fontSize: "9.5px", fontWeight: 800, background: "rgba(255,255,255,0.96)", color: badge.color, boxShadow: "0 1px 4px rgba(0,0,0,0.18)", lineHeight: 1.4,
          }}>
            {badge.label}
          </span>
        )}
      </div>
      <div style={{ padding: "9px 10px 10px", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: "12.5px", color: MAP_PANEL_INK, letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          {action}
        </div>
        {chip && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: "5px", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap", color: "#5a5141", background: "#F4F0E7", padding: "2px 7px", borderRadius: "999px" }}>{chip}</span>
          </div>
        )}
        {address && (
          <div style={{ fontSize: "10.5px", color: "#655d4f", marginTop: "6px", display: "flex", alignItems: "center", gap: "3px", minWidth: 0 }}>
            <MapPin size={10} color="#b8ad99" style={{ flexShrink: 0 }} />
            <span title={address} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortAddress(address)}</span>
          </div>
        )}
        {meta && <div style={{ fontSize: "10.5px", color: "#48603A", fontWeight: 700, marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
        {footer}
      </div>
    </div>
  );
}
