"use client";

// 관리자 "유입 경로"(/admin/traffic) — 사람들이 어디서 들어왔는지(네이버 블로그·인스타·검색·직접 방문 등),
// 다시 왔는지, 회원이 됐는지를 채널별로 봅니다. 채널마다 다른 홍보 링크도 여기서 만듭니다.
// 예전엔 "통계 분석" 맨 아래에만 있어서 찾기 어려웠습니다 — 같은 칸(TrafficCard)을 따로 꺼낸 화면입니다.

import { Route } from "lucide-react";
import AdminNav from "@/components/AdminNav";
import TrafficCard from "@/components/admin/TrafficCard";

export default function AdminTrafficPage() {
  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="traffic" />
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)", display: "grid", gap: 14, wordBreak: "keep-all" }}>
        <div>
          <h1 className="ggk-logo" style={{ display: "flex", alignItems: "center", gap: 7, margin: 0, fontSize: 21, fontWeight: 800, color: "#3d3122" }}><Route size={20} />유입 경로</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#555", lineHeight: 1.7 }}>
            채널별로 몇 명이 들어와서, 다시 오고, 회원이 됐는지 봅니다.<br />
            홍보할 때는 아래 &ldquo;홍보 링크 만들기&rdquo;로 채널마다 다른 링크를 붙이면 그 채널 성과로 셉니다.
          </p>
        </div>
        <TrafficCard />
      </div>
    </div>
  );
}
