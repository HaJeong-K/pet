"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PawPrint } from "lucide-react";
import ShelterNoticeCard, { type ShelterNoticeLite } from "@/components/ShelterNoticeCard";
import { useUserRegion } from "@/lib/useUserRegion";

// ── 전국 보호소 공고 전체보기 ──
// 예전에는 이 버튼이 animal.go.kr의 검색결과 페이지로 직접 딥링크됐는데, 그 사이트가
// 세션 없이 바로 접근하면 오류 화면을 띄워서(우리 서버는 세션 쿠키를 받아 정상 동작하지만,
// 브라우저로 직접 새 탭을 열면 세션이 없어 실패) 우리 도메인 안에 자체 전체보기 페이지를
// 만들고, 이미 세션 처리가 되어 있는 /api/shelter-notices를 그대로 재사용합니다.
// 시/도를 고르면 그 지역 공고만, 기본값은 사용자의 현재 위치 시/도, 마감임박순 정렬입니다.

const SIDO_LIST = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const PHRASES = ["나의 가족이 되어주세요", "나의 가족을 찾아주세요"];

export default function ShelterNoticesPage() {
  const router = useRouter();
  const detectedRegion = useUserRegion();

  const [sido, setSido] = useState<string>("");
  const [initialized, setInitialized] = useState(false);
  const [notices, setNotices] = useState<ShelterNoticeLite[]>([]);
  const [loading, setLoading] = useState(true);

  // 위치 기반으로 감지된 지역이 오면 그걸 기본 선택값으로 한 번만 반영합니다.
  useEffect(() => {
    if (!initialized && detectedRegion) {
      setSido(detectedRegion);
      setInitialized(true);
    }
  }, [detectedRegion, initialized]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ full: "1", limit: "60" });
    if (sido) params.set("region", sido);
    fetch(`/api/shelter-notices?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setNotices(data.notices || []))
      .catch(() => setNotices([]))
      .finally(() => setLoading(false));
  }, [sido]);

  return (
    <div
      className="ggk-body"
      style={{
        display: "flex", flexDirection: "column", minHeight: "100vh",
        background: "#F7F3E8", alignItems: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: "1200px", display: "flex", flexDirection: "column" }}>
        {/* ── 상단바 ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "16px 20px",
          background: "white", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 5,
        }}>
          <button
            onClick={() => router.back()}
            style={{
              border: "none", background: "#f5f6f8", borderRadius: "50%",
              width: 34, height: 34, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <ArrowLeft size={17} color="#555" />
          </button>
          <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: "#D9534F", flex: 1 }}>
            사지말고 입양하세요
          </div>
        </div>

        {/* ── 안내 + 지역 필터 ── */}
        <div style={{ padding: "18px 20px 4px" }}>
          <p style={{ fontSize: 12.5, color: "#666", lineHeight: 1.6, marginBottom: 14 }}>
            국가동물보호정보시스템(animal.go.kr) 공고를 마감이 임박한 순서로 보여드려요.
            지역을 선택하면 해당 지역 공고만, 선택하지 않으면 전국 공고를 볼 수 있어요.
          </p>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            <button
              onClick={() => setSido("")}
              style={{
                flexShrink: 0, padding: "7px 14px", borderRadius: 999, border: "none",
                background: sido === "" ? "#5C7A4A" : "white",
                color: sido === "" ? "white" : "#555",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
                boxShadow: sido === "" ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              전국
            </button>
            {SIDO_LIST.map((s) => (
              <button
                key={s}
                onClick={() => setSido(s)}
                style={{
                  flexShrink: 0, padding: "7px 14px", borderRadius: 999, border: "none",
                  background: sido === s ? "#5C7A4A" : "white",
                  color: sido === s ? "white" : "#555",
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                  boxShadow: sido === s ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* ── 공고 카드 그리드 ── */}
        <div style={{ padding: "16px 20px 60px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#999", fontSize: 13 }}>
              공고를 불러오는 중...
            </div>
          ) : notices.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "80px 0", background: "white",
              borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)",
            }}>
              <PawPrint size={32} color="#ccc" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 13, color: "#999" }}>
                {sido ? `${sido} 지역에 진행 중인 공고가 없습니다.` : "현재 진행 중인 공고가 없습니다."}
              </div>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 14,
            }}>
              {notices.map((n, i) => (
                <div key={n.desertionNo} style={{ height: 230 }}>
                  <ShelterNoticeCard notice={n} phrase={PHRASES[i % PHRASES.length]} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
