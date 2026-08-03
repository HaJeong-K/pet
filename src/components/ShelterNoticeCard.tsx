"use client";

import type { CSSProperties } from "react";
import { PawPrint } from "lucide-react";

export type ShelterNoticeLite = {
  desertionNo: string;
  noticeNumber: string;
  region: string;
  subRegion: string;
  breed: string;
  imageUrl: string;
  daysLeft: number;
};

// 클릭하면 국가동물보호정보시스템의 실제 공고 상세페이지가 새 탭으로 열립니다.
// 그 사이트는 세션 쿠키가 있어야 상세페이지 POST가 통과되는데, 사용자의 브라우저는
// animal.go.kr 세션이 없으므로 우리 서버(세션 보유)가 대신 요청해서 원문 HTML을
// 그대로 내려주는 프록시 라우트(/api/shelter-notice-view)를 거칩니다.
export default function ShelterNoticeCard({
  notice,
  phrase,
}: {
  notice: ShelterNoticeLite;
  phrase: string;
}) {
  const cardStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    borderRadius: "16px",
    overflow: "hidden",
    border: "1px solid rgba(0,0,0,0.08)",
  };

  const linkStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    textDecoration: "none",
    cursor: "pointer",
  };

  const urgent = notice.daysLeft <= 2;

  return (
    <div style={cardStyle}>
      <a
        href={`/api/shelter-notice-view?desertionNo=${notice.desertionNo}`}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        title={`${notice.noticeNumber} 자세히 보기 (animal.go.kr)`}
      >
        {/* 상단 타이틀 바 — 이미지 출력 영역을 살짝 줄이고 그 자리에 문구를 표시합니다 */}
        <div
          className="ggk-logo"
          style={{
            flexShrink: 0,
            background: "#5C7A4A",
            color: "white",
            fontSize: 14.5,
            fontWeight: 800,
            padding: "7px 10px",
            lineHeight: 1.25,
          }}
        >
          {phrase}
        </div>

        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          {notice.imageUrl ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `url(${notice.imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundColor: "#eee",
              }}
            />
          ) : (
            // 사진 파싱이 실패한 공고도 정보 자체는 값이 있으니 버리지 않고, 사진 대신
            // 아이콘 + 텍스트 정보만으로 카드를 채웁니다.
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(160deg,#E4EBDC,#CFE0C4)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 10,
                textAlign: "center",
              }}
            >
              <PawPrint size={26} color="#5C7A4A" />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#48603A" }}>
                {notice.breed || "보호동물 공고"}
              </span>
            </div>
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.72) 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 10,
              right: 10,
              bottom: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0 }}>
              <span
                style={{
                  background: "rgba(255,255,255,0.92)",
                  color: "#48603A",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 7px",
                  borderRadius: 999,
                  flexShrink: 0,
                }}
              >
                {notice.region}
              </span>
              <span
                style={{
                  color: "white",
                  fontSize: 10.5,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {notice.breed}
              </span>
            </div>
            <span
              style={{
                background: urgent ? "#D9534F" : "rgba(0,0,0,0.55)",
                color: "white",
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 7px",
                borderRadius: 999,
                flexShrink: 0,
              }}
            >
              {notice.daysLeft <= 0 ? "오늘마감" : `D-${notice.daysLeft}`}
            </span>
          </div>
        </div>
      </a>
    </div>
  );
}
