"use client";

// src/components/PlaceRoadview.tsx
//
// 실제 사진이 없는 장소를 위한 "합법적 이미지 확보" 수단 — 카카오 로드뷰.
// 이미 이 앱 전체가 카카오맵 JS SDK를 쓰고 있어서(layout.tsx에서 로드), 그 SDK가
// 공식으로 제공하는 로드뷰 기능을 그대로 쓰면 별도 라이선스 문제 없이 건물 외관
// 실사진을 보여줄 수 있습니다. 카카오맵 SDK를 쓰는 서비스에 한해 공식 제공되는
// 기능이라(추가 API 키/약관 동의 불필요) 저작권 리스크가 없습니다.
//
// ⚠ 실내/메뉴 사진까지는 아니고 "건물 바깥 모습"만 보여줄 수 있습니다 — 실제
// 사진(업주/제보자 업로드)이 있으면 그게 항상 우선이고, 로드뷰는 그게 없을 때만
// 보조 수단으로 씁니다(호출부에서 그 판단을 하고, 이 컴포넌트는 "이 좌표에 로드뷰가
// 있으면 보여주고, 없으면 조용히 아무것도 렌더링하지 않는" 역할만 합니다).
//
// ⚠ 성능: 로드뷰 뷰어(kakao.maps.Roadview)는 파노라마 타일을 그때그때 불러오는
// 무거운 컴포넌트라, 지도 위 마커나 리스트 카드 수백~수천 개에 동시에 띄우면 안
// 됩니다. 장소 상세페이지(한 번에 장소 하나만 보임)에서만 씁니다.

import { useEffect, useRef, useState } from "react";

interface PlaceRoadviewProps {
  lat: number;
  lng: number;
  /** 이 반경(m) 안에 로드뷰 파노라마가 없으면 "없음"으로 처리 */
  radiusM?: number;
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
}

export default function PlaceRoadview({
  lat,
  lng,
  radiusM = 50,
  width = "100%",
  height = "160px",
  borderRadius = 12,
}: PlaceRoadviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "available" | "unavailable">("loading");

  useEffect(() => {
    if (isNaN(lat) || isNaN(lng)) {
      setStatus("unavailable");
      return;
    }

    let cancelled = false;

    const tryInit = () => {
      if (cancelled) return;
      const kakao = (window as any).kakao;
      if (!kakao?.maps) {
        setTimeout(tryInit, 150);
        return;
      }
      kakao.maps.load(() => {
        if (cancelled || !containerRef.current) return;
        const position = new kakao.maps.LatLng(lat, lng);
        const rvClient = new kakao.maps.RoadviewClient();
        // 반경 내 가장 가까운 파노라마 ID를 찾습니다 — 없으면 panoId가 null로 옵니다.
        rvClient.getNearestPanoId(position, radiusM, (panoId: string | null) => {
          if (cancelled) return;
          if (!panoId || !containerRef.current) {
            setStatus("unavailable");
            return;
          }
          const roadview = new kakao.maps.Roadview(containerRef.current);
          roadview.setPanoId(panoId, position);
          setStatus("available");
        });
      });
    };

    tryInit();
    return () => { cancelled = true; };
  }, [lat, lng, radiusM]);

  if (status === "unavailable") return null;

  return (
    <div style={{ position: "relative", width, height, borderRadius, overflow: "hidden", background: "#f5f6f8", flexShrink: 0 }}>
      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#aaa" }}>
          로드뷰 확인 중...
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {status === "available" && (
        <div
          style={{
            position: "absolute", bottom: 6, left: 8,
            fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.95)",
            background: "rgba(0,0,0,0.45)", padding: "2px 7px", borderRadius: 6,
            pointerEvents: "none",
          }}
        >
          카카오 로드뷰
        </div>
      )}
    </div>
  );
}
