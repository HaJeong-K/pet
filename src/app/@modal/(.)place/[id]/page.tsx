"use client";

import { useRouter } from "next/navigation";
import PlaceDetail from "@/app/place/[id]/page";

export default function ModalPage() {
  const router = useRouter();

  return (
    <div
      onClick={() => router.back()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",        // ← 바깥 여백
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "800px",
          height: "90vh",        // ← maxHeight → height 고정
          background: "white",
          borderRadius: "20px",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",    // ← 바깥으로 스크롤 절대 안 나오게
        }}
      >
        {/* 닫기 버튼 — 고정 헤더 */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "14px 20px",
          borderBottom: "1px solid #eee",
          flexShrink: 0,           // ← 헤더 높이 고정
        }}>
          <button
            onClick={() => router.back()}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "22px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* 스크롤 영역 — 여기서만 스크롤 */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "20px 24px",    // ← 내부 여백
        }}>
          <PlaceDetail />
        </div>
      </div>
    </div>
  );
}