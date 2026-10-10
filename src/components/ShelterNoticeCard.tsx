"use client";

import { useState, type CSSProperties } from "react";
import { shelterImageSrc } from "@/lib/shelterImage";
import Link from "next/link";
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

// 클릭하면 우리 사이트의 공고 상세 화면(/shelter-notices/[desertionNo])으로 이동합니다.
// 그 화면에서 보호소 전화·위치·공고 원문으로 바로 입양·임시보호 문의를 할 수 있습니다.
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
  // 사진을 끝내 못 받으면(정부 서버 응답 없음 등) 깨진 그림 표시 대신 발자국 그림으로 바꿉니다.
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div style={cardStyle}>
      <Link
        href={`/shelter-notices/${notice.desertionNo}`}
        // 카드가 화면에 보이기만 해도 상세 화면을 미리 불러오던 것을 끕니다(카드마다 서버 요청이 나가던 원인).
        prefetch={false}
        style={linkStyle}
        title={`${notice.noticeNumber} 자세히 보기 · 입양/임보 문의`}
      >
        {/* 상단 타이틀 바 — 이미지 출력 영역을 살짝 줄이고 그 자리에 문구를 표시합니다 */}
        {/* 입양 문구 — 아이가 직접 쓴 쪽지처럼 보이도록 손글씨 폰트(Gaegu)로, 가운데 정렬 */}
        <div
          style={{
            flexShrink: 0,
            // 초록 대신 따뜻한 살구·크림색 바탕에 갈색 글씨(손편지 느낌)
            background: "linear-gradient(180deg, #FFF3DF, #FFE6C7)",
            color: "#7A4A26",
            borderBottom: "1px solid #F3D3A6",
            fontFamily: "'Gaegu', 'Noto Sans KR', sans-serif",
            fontSize: 19,
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: "0.2px",
            padding: "6px 10px 5px",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {phrase}
        </div>

        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          {notice.imageUrl && !imageFailed ? (
            // 사진은 화면 가까이 왔을 때만 받고(loading="lazy"), 정부 서버의 원본(한 장이 수백 KB) 대신
            // 우리 서버가 작게 줄인 것을 받습니다(src/lib/shelterImage.ts) — 원본은 느리고 가끔 응답이 없었습니다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shelterImageSrc(notice.imageUrl, 480)}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              // 화면이 준비되기 전에 이미 실패한 사진은 onError가 불리지 않으므로 여기서 한 번 더 확인합니다.
              ref={(el) => { if (el && el.complete && el.naturalWidth === 0 && el.getAttribute("src")) setImageFailed(true); }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", background: "#eee", display: "block" }}
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
                {/* 시·군·구가 있으면 그걸 먼저(예: "경주"), 없으면 시·도(예: "경북") */}
                {notice.subRegion || notice.region}
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
      </Link>
    </div>
  );
}
