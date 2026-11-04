"use client";

// 장소 상세 — "○○님이 제보한 장소예요" 한 줄. 제보형 지도의 보상(내 이름이 지도에 남음)입니다.
// 인증된 사장님이 정보를 직접 고치거나 확인했으면 "사장님이 직접 관리" 표시를 맨 위에 붙여 신뢰를 줍니다.
// 서버는 /api/place-tippers(승인된 제보만, 닉네임만).

import { useEffect, useState } from "react";
import { BadgeCheck, MapPinPlus } from "lucide-react";

type Tipper = { name: string; kind: "new_place" | "info_update" };

export default function PlaceTippers({ placeId }: { placeId: number }) {
  const [tippers, setTippers] = useState<Tipper[]>([]);
  const [ownerAt, setOwnerAt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/place-tippers?placeId=${placeId}`).then((r) => r.json()).then((d) => { if (alive) { setTippers(d.tippers ?? []); setOwnerAt(d.ownerAt ?? null); } }).catch(() => {});
    return () => { alive = false; };
  }, [placeId]);
  if (tippers.length === 0 && !ownerAt) return null;

  const first = tippers.find((t) => t.kind === "new_place");
  const helpers = tippers.filter((t) => t.kind === "info_update").map((t) => t.name);
  return (
    <div className="ggk-body" style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 12, background: "#FBEDE3", color: "#3B2A20", fontSize: 12.5, lineHeight: 1.6 }}>
      {ownerAt ? <BadgeCheck size={15} color="#A05A32" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden /> : <MapPinPlus size={15} color="#A05A32" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />}
      <div>
        {ownerAt && <div><b>사장님이 직접 정보를 관리하는 곳이에요</b> · {new Date(ownerAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" })} 확인</div>}
        {first && <div><b>{first.name}</b>님이 제보해 지도에 올라온 장소예요.</div>}
        {helpers.length > 0 && <div><b>{helpers.slice(0, 3).join(", ")}</b>{helpers.length > 3 ? ` 외 ${helpers.length - 3}명` : ""}님이 정보를 보태 주셨어요.</div>}
      </div>
    </div>
  );
}
