"use client";

// 사장님 가입·전환 화면 맨 위의 "가게 / 숙소" 고르기 버튼(src/lib/ownerKind.ts).
// 고른 유형에 따라 아래 입력칸 이름(가게명 / 숙소명 등)이 바뀌고, 관리자 화면에도 유형이 표시됩니다.

import { BedDouble, Check, Store } from "lucide-react";
import { OWNER_KINDS, type OwnerKind } from "@/lib/ownerKind";

const ICONS: Record<OwnerKind, typeof Store> = { store: Store, lodging: BedDouble };

export default function OwnerKindPicker({ value, onChange }: { value: OwnerKind; onChange: (kind: OwnerKind) => void }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: "#1f1a12", marginBottom: 10 }}>운영하시는 곳</div>
      <div role="radiogroup" aria-label="사장님 유형" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
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
                position: "relative", textAlign: "left", padding: "16px 16px 15px", borderRadius: 16, cursor: "pointer",
                border: `1.5px solid ${on ? k.color : "#E8E3D7"}`, background: on ? k.background : "#FCFBF8",
                boxShadow: on ? `0 8px 20px ${k.color}22` : "none", transition: "all .15s ease", fontFamily: "inherit",
              }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: on ? k.color : "white", border: on ? "none" : "1px solid #E8E3D7", color: on ? "white" : k.color }}>
                <Icon size={19} />
              </span>
              <div style={{ marginTop: 10, fontSize: 15.5, fontWeight: 800, color: on ? k.color : "#2a2620" }}>{k.label}</div>
              <div style={{ fontSize: 12, color: "#625a4c", marginTop: 4, lineHeight: 1.6, whiteSpace: "pre-line" }}>{k.description}</div>
              {on && <span style={{ position: "absolute", top: 12, right: 12, width: 22, height: 22, borderRadius: 999, background: k.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={13} /></span>}
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
