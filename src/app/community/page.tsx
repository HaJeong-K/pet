"use client";

import { useRouter } from "next/navigation";
import { Users, ArrowLeft } from "lucide-react";

export default function CommunityPage() {
  const router = useRouter();

  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .ggk-logo { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
        .ggk-body  { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      <div
        className="ggk-body"
        style={{
          minHeight: "100vh",
          background: "#f5f6f8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          paddingBottom: "80px",
        }}
      >
        {/* 뒤로가기 */}
        <button
          onClick={() => router.push("/")}
          style={{
            position: "fixed",
            top: "20px",
            left: "20px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "1px solid #e8eaed",
            background: "white",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            zIndex: 10,
          }}
        >
          <ArrowLeft size={18} color="#444" />
        </button>

        {/* 아이콘 */}
        <div style={{ position: "relative", marginBottom: "28px" }}>
          {/* 펄스 링 */}
          <div
            style={{
              position: "absolute",
              inset: "-12px",
              borderRadius: "50%",
              border: "2px solid #111",
              animation: "pulse-ring 2s ease-out infinite",
            }}
          />
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background: "linear-gradient(145deg, #2a2a2a, #111)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              animation: "float 3s ease-in-out infinite",
            }}
          >
            <Users size={36} color="white" strokeWidth={1.5} />
          </div>
        </div>

        {/* 텍스트 */}
        <div
          className="ggk-logo"
          style={{
            fontSize: "26px",
            fontWeight: 800,
            color: "#111",
            letterSpacing: "-0.5px",
            marginBottom: "12px",
            textAlign: "center",
          }}
        >
          커뮤니티
        </div>

        <div
          className="ggk-body"
          style={{
            fontSize: "15px",
            color: "#555",
            fontWeight: 600,
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          준비 중입니다 🐾
        </div>

        <div
          className="ggk-body"
          style={{
            fontSize: "13px",
            color: "#999",
            textAlign: "center",
            lineHeight: 1.7,
            maxWidth: "260px",
          }}
        >
          반려동물 친구들과 함께하는<br />
          커뮤니티 기능을 준비하고 있어요.<br />
          조금만 기다려주세요!
        </div>

        {/* 뱃지 */}
        <div
          style={{
            marginTop: "28px",
            padding: "8px 18px",
            borderRadius: "999px",
            background: "linear-gradient(145deg, #2a2a2a, #111)",
            color: "white",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.3px",
          }}
        >
          Coming Soon
        </div>
      </div>
    </>
  );
}