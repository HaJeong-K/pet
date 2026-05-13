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
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "900px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "white",
          borderRadius: "20px",
          position: "relative",
          padding: "20px",
        }}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={() => router.back()}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            border: "none",
            background: "transparent",
            fontSize: "28px",
            cursor: "pointer",
          }}
        >
          ✕
        </button>

        <PlaceDetail />
      </div>
    </div>
  );
}