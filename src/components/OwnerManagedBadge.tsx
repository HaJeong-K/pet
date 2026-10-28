"use client";

// 장소 상세의 "사장님 인증" 표시 — 사업자 인증을 마친 사장님이 직접 관리하는 가게면 이름 아래에 보입니다.
//   [✓ 사장님 인증] 사장님이 직접 관리하는 가게 정보예요 · 10/20 확인
// 손님이 "이 정보는 가게가 직접 확인했다"는 걸 알 수 있게 하는 신뢰 표시입니다. 서버는 /api/place-owner.

import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";

const fmt = (iso: string) => { const d = new Date(new Date(iso).getTime() + 9 * 3_600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

export default function OwnerManagedBadge({ placeId }: { placeId: number }) {
  const [info, setInfo] = useState<{ managed: boolean; verifiedAt: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/place-owner?placeId=${placeId}`).then((r) => r.json()).then((d) => { if (!cancelled) setInfo(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [placeId]);

  if (!info?.managed) return null;
  return (
    <div title="사업자 인증을 마친 사장님이 직접 관리하는 가게예요" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "2px 0 8px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 999, background: "#E8F5E9", border: "1px solid #B7DFB9", color: "#1B5E20", fontSize: 11, fontWeight: 800 }}>
        <BadgeCheck size={12} />사장님 인증
      </span>
      <span style={{ fontSize: 11, color: "#4b6b4d" }}>
        사장님이 직접 관리하는 가게 정보예요{info.verifiedAt ? ` · ${fmt(info.verifiedAt)} 확인` : ""}
      </span>
    </div>
  );
}
