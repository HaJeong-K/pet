"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    kakao: any;
    selectPlace: (id: number) => void;
  }
}

export default function KakaoMap() {
  const router = useRouter();

  const [places, setPlaces] = useState<any[]>([]);
  const [selectedPetZone, setSelectedPetZone] = useState("all");
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);

  const getButtonStyle = (type: string) => ({
    padding: "10px 14px",
    borderRadius: "999px",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    background: selectedPetZone === type ? "#000" : "white",
    color: selectedPetZone === type ? "white" : "black",
  });

  const petZoneEmojiMap: any = {
    indoor: "🏠",
    terrace: "🌿",
    both: "🏡",
  };

  // 데이터
  useEffect(() => {
    const fetchPlaces = async () => {
      const { data, error } = await supabase
        .from("places")
        .select("*");

      if (error) {
        console.error(error);
        return;
      }

      setPlaces(data || []);
    };

    fetchPlaces();
  }, []);

  // 필터
  const filteredPlaces =
    selectedPetZone === "all"
      ? places
      : places.filter((p) => p.pet_zone === selectedPetZone);

  // 지도
  useEffect(() => {
    const script = document.createElement("script");

    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.async = true;

    document.head.appendChild(script);

    script.onload = () => {
      window.kakao.maps.load(() => {
        const container = document.getElementById("map");

        const map = new window.kakao.maps.Map(container, {
          center: new window.kakao.maps.LatLng(37.5665, 126.978),
          level: 4,
        });

        window.selectPlace = (id: number) => {
          setSelectedPlaceId(id);
          router.push(`/place/${id}`);
        };

        filteredPlaces.forEach((place) => {
          const position = new window.kakao.maps.LatLng(
            place.lat,
            place.lng
          );

          const emoji =
            petZoneEmojiMap[place.pet_zone] || "🐾";

          const overlay = new window.kakao.maps.CustomOverlay({
            position,
            content: `
              <div
                onclick="window.selectPlace(${place.id})"
                style="
                  background:white;
                  border-radius:999px;
                  padding:8px 14px;
                  font-size:13px;
                  font-weight:bold;
                  box-shadow:0 2px 8px rgba(0,0,0,0.15);
                  cursor:pointer;
                  white-space:nowrap;
                "
              >
                ${emoji} ${place.name}
              </div>
            `,
          });

          overlay.setMap(map);
        });
      });
    };
  }, [filteredPlaces]);

  return (
    <>
      {/* 필터 */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "10px",
          zIndex: 999,
        }}
      >
          <button
            onClick={() => setSelectedPetZone("all")}
            style={getButtonStyle("all")}
          >
            전체
          </button>

          <button
            onClick={() => setSelectedPetZone("indoor")}
            style={getButtonStyle("indoor")}
          >
            🏠 실내 가능
          </button>

          <button
            onClick={() => setSelectedPetZone("terrace")}
            style={getButtonStyle("terrace")}
          >
            🌿 테라스만 가능
          </button>

          <button
            onClick={() => setSelectedPetZone("both")}
            style={getButtonStyle("both")}
          >
            🏡 실내외 전부 가능
          </button>
      </div>

      {/* 레이아웃 */}
      <div
        style={{
          display: "flex",
          width: "100vw",
          height: "100vh",
          background: "#f5f6f8",
        }}
      >
        {/* 리스트 */}
        <div
          style={{
            width: "380px",
            background: "#fff",
            borderRight: "1px solid #eee",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "18px",
              position: "sticky",
              top: 0,
              background: "white",
              borderBottom: "1px solid #eee",
              zIndex: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>
              🐾 같이 추억을 나눌 장소 찾기
            </h2>
          </div>

          <div style={{ padding: "12px" }}>
            {filteredPlaces.map((place) => (
              <div
                key={place.id}
                onClick={() => router.push(`/place/${place.id}`)}
                style={{
                  padding: "14px",
                  marginTop: "12px",
                  background:
                    selectedPlaceId === place.id ? "#eef6ff" : "white",
                  borderRadius: "14px",
                  cursor: "pointer",
                  border:
                    selectedPlaceId === place.id
                      ? "1px solid #4da3ff"
                      : "1px solid #eee",
                }}
              >
                <div style={{ fontWeight: "bold" }}>
                  {petZoneEmojiMap[place.pet_zone] || "🐾"} {place.name}
                </div>
                <div style={{ fontSize: "13px", color: "#666" }}>
                  {place.pet_info}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 지도 */}
        <div id="map" style={{ flex: 1 }} />
      </div>
    </>
  );
}