"use client";

// 사장님 가입·전환 화면 맨 위의 "가게 / 숙소" 고르기 버튼(src/lib/ownerKind.ts).
// 고른 유형에 따라 아래 입력칸 이름(가게명 / 숙소명 등)이 바뀌고, 관리자 화면에도 유형이 표시됩니다.

import { BedDouble, Check, Store } from "lucide-react";
import { OWNER_KINDS, type OwnerKind } from "@/lib/ownerKind";

const ICONS: Record<OwnerKind, typeof Store> = { store: Store, lodging: BedDouble };

export default function OwnerKindPicker({ value, onChange }: { value: OwnerKind; onChange: (kind: OwnerKind) => void }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: "#222", marginBottom: 8 }}>운영하시는 곳</div>
      <div role="radiogroup" aria-label="사장님 유형" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {OWNER_KINDS.map((k) => {
          const Icon = ICONS[k.id];
          const on = value === k.id;
          return (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(k.id)}
              style={{
                position: "relative", textAlign: "left", padding: "13px 14px", borderRadius: 12, cursor: "pointer",
                border: `1.5px solid ${on ? k.color : "#e2e2e2"}`, background: on ? k.background : "white",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14.5, fontWeight: 800, color: on ? k.color : "#333" }}>
                <Icon size={17} />{k.label}
                {on && <Check size={15} style={{ marginLeft: "auto" }} />}
              </div>
              <div style={{ fontSize: 11.5, color: "#777", marginTop: 5, lineHeight: 1.55, whiteSpace: "pre-line" }}>{k.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 관리자 화면 등에서 쓰는 작은 유형 배지 */
export function OwnerKindBadge({ kind }: { kind: OwnerKind }) {
  const k = OWNER_KINDS.find((x) => x.id === kind)!;
  const Icon = ICONS[kind];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: k.background, color: k.color, whiteSpace: "nowrap" }}>
      <Icon size={10} />{k.label}
    </span>
  );
}
