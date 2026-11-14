"use client";

// "최근 본 숙소 / 최근 본 곳" 가로 목록 — 이 기기에 남은 기록(src/lib/recentViews.ts)이 있을 때만 보입니다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BedDouble, MapPin } from "lucide-react";
import { clearRecentViews, readRecentViews, type RecentView } from "@/lib/recentViews";

export default function RecentViews({ kind, title, style }: { kind?: RecentView["kind"]; title: string; style?: React.CSSProperties }) {
  const [items, setItems] = useState<RecentView[]>([]);
  useEffect(() => { setItems(readRecentViews(kind).slice(0, 10)); }, [kind]);
  if (items.length === 0) return null;
  return (
    <section style={style}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <h2 className="ggk-logo" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#222" }}>{title}</h2>
        <button onClick={() => { clearRecentViews(); setItems([]); }} style={{ border: "none", background: "transparent", color: "#5c5c5c", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>기록 지우기</button>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", marginTop: 10, paddingBottom: 2 }}>
        {items.map((v) => (
          <Link key={`${v.kind}-${v.id}`} href={v.kind === "stay" ? `/stay/${v.id}` : `/place/${v.id}`} style={{ flex: "0 0 132px", textDecoration: "none", color: "#222" }}>
            <span style={{ display: "flex", width: 132, height: 88, borderRadius: 12, overflow: "hidden", background: "#FCF1E9", alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {v.image ? <img src={v.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : v.kind === "stay" ? <BedDouble size={22} color="#A05A32" /> : <MapPin size={22} color="#A05A32" />}
            </span>
            <span style={{ display: "block", marginTop: 6, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
            {v.sub && <span style={{ display: "block", fontSize: 11.5, color: "#5c5c5c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.sub}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
