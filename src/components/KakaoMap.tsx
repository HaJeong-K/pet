"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import {
  LocateFixed,
  Share,
  MapPin,
  MapPinPlus,
  Pencil,
  ZoomIn,
  ZoomOut,
  Link,
  Upload,
  MessageCircle,
  PawPrint,
  X,
} from "lucide-react";

declare global {
  interface Window {
    kakao: any;
    selectPlace: (id: number) => void;
  }
}

const PET_ZONE_EMOJI: Record<string, string> = {
  indoor: "🏠",
  terrace: "🌿",
  both: "🏡",
};

const PET_ZONE_LABEL: Record<string, string> = {
  indoor: "실내 가능",
  terrace: "테라스 가능",
  both: "실내외 가능",
};

export default function KakaoMap() {
  const router = useRouter();
  const pathname = usePathname();
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);
  const [session, setSession] = useState<any>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const [wideView, setWideView] = useState(false);
  const savedLevelRef = useRef<number>(4);
  const markersRef = useRef<any[]>([]);

  const getActiveTab = () => {
    if (pathname === "/" || pathname === "") return "map";
    if (pathname.startsWith("/community")) return "community";
    if (pathname.startsWith("/admin/reports")) return "reports";
    if (pathname.startsWith("/admin/tips")) return "tips";
    if (pathname.startsWith("/mypage")) return "mypage";
    if (pathname.startsWith("/login")) return "login";
    return "map";
  };

  const createUserProfile = async (user: any) => {
    if (!user) return;
    const { data: existingUser } = await supabase
      .from("users").select("*").eq("auth_user_id", user.id).maybeSingle();
    if (existingUser) {
      const avatarUrl =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        user.user_metadata?.profile_image || null;
      await supabase.from("users").update({ avatar_url: avatarUrl }).eq("auth_user_id", user.id);
      return;
    }
    const nickname =
      user.user_metadata?.full_name ||
      user.user_metadata?.preferred_username ||
      user.user_metadata?.nickname ||
      user.user_metadata?.name ||
      user.identities?.[0]?.identity_data?.name ||
      user.email?.split("@")[0] || "사용자";
    const avatarUrl =
      user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      user.user_metadata?.profile_image || null;
    const { error } = await supabase.from("users").upsert([
      { auth_user_id: user.id, email: user.email || "", nickname, avatar_url: avatarUrl },
    ], { onConflict: "auth_user_id" });
    if (error) console.error("유저 프로필 생성 오류:", JSON.stringify(error));
  };

  const selectPlaceRef = useRef<(id: number) => void>(() => {});
  const [places, setPlaces] = useState<any[]>([]);
  const [selectedPetZone, setSelectedPetZone] = useState("all");
  const [selectedPlace, setSelectedPlace] = useState<any | null>(null);
  const [showRecentPanel, setShowRecentPanel] = useState(false);

  selectPlaceRef.current = (id: number) => {
    const found = places.find((p) => p.id === id);
    if (found) setSelectedPlace(found);
  };

  const getButtonStyle = (type: string) => ({
    padding: "4px 9px",
    fontSize: "11px",
    borderRadius: "999px",
    border: "none",
    fontWeight: "600" as const,
    cursor: "pointer",
    background:
      selectedPetZone === type
        ? "linear-gradient(135deg, #1a1a1a, #333)"
        : "rgba(245,246,248,0.95)",
    color: selectedPetZone === type ? "white" : "#444",
    boxShadow:
      selectedPetZone === type
        ? "0 1px 6px rgba(0,0,0,0.22)"
        : "0 1px 3px rgba(0,0,0,0.07)",
    whiteSpace: "nowrap" as const,
    transition: "all 0.15s ease",
    fontFamily: "'Noto Sans KR', sans-serif",
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) await createUserProfile(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        // console.log 제거
      }
    );

    if ((window as any).Kakao && !(window as any).Kakao.isInitialized()) {
      (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
    }
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const fetchPlaces = async () => {
      const { data, error } = await supabase
        .from("places")
        .select("id, name, lat, lng, pet_zone, address, image_url, created_at");
      if (error) { console.error(error); return; }
      setPlaces(data || []);
    };
    fetchPlaces();
  }, [session]); // ← [] 대신 [session]으로 변경

  const filteredPlaces = useMemo(
    () =>
      selectedPetZone === "all"
        ? places
        : places.filter((p) => p.pet_zone === selectedPetZone),
    [places, selectedPetZone]
  );

  useEffect(() => {
    window.selectPlace = (id: number) => selectPlaceRef.current(id);
    const initializeMap = () => {
      const container = document.getElementById("map");
      if (!container) return;
      mapRef.current = new window.kakao.maps.Map(container, {
        center: new window.kakao.maps.LatLng(37.5665, 126.978),
        level: 4,
        scrollwheel: true,
        disableDoubleClickZoom: false,
      });
      mapRef.current.setZoomable(true);
      setMapReady(true);
    };
    if (window.kakao && window.kakao.maps) { initializeMap(); return; }
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.async = true;
    document.head.appendChild(script);
    script.onload = () => { window.kakao.maps.load(() => { initializeMap(); }); };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    filteredPlaces.forEach((place) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      const position = new window.kakao.maps.LatLng(lat, lng);
      const emoji = PET_ZONE_EMOJI[place.pet_zone] || "🐾";
      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content: `<div onclick="window.selectPlace(${place.id})" style="background:white;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:600;font-family:'Noto Sans KR',sans-serif;box-shadow:0 2px 6px rgba(0,0,0,0.13);cursor:pointer;white-space:nowrap;user-select:none;border:1px solid rgba(0,0,0,0.06);">${emoji} ${place.name}</div>`,
        yAnchor: 1,
        zIndex: 3,
      });
      overlay.setMap(map);
      markersRef.current.push(overlay);
    });
  }, [filteredPlaces, mapReady]);

  const moveToMyLocation = () => {
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 서비스를 지원하지 않습니다.");
      return;
    }
    if (!mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current.setCenter(new window.kakao.maps.LatLng(latitude, longitude));
        mapRef.current.setLevel(3);
      },
      () => { alert("위치 정보를 가져올 수 없습니다.\n브라우저 위치 권한을 확인해주세요."); }
    );
  };

  const handleWideView = () => {
    if (!mapRef.current || !window.kakao?.maps) return;
    if (!wideView) {
      savedLevelRef.current = mapRef.current.getLevel();
      mapRef.current.setLevel(Math.min(savedLevelRef.current + 2, 14));
      setWideView(true);
    } else {
      mapRef.current.setLevel(savedLevelRef.current);
      setWideView(false);
    }
  };

  const handleKakaoShare = () => {
    if (!(window as any).Kakao) { alert("카카오톡 공유를 사용할 수 없습니다."); return; }
    (window as any).Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: "같이가개",
        description: "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",
        imageUrl: "",
        link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
      },
    });
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    alert("링크가 복사되었습니다.");
    setShowShareModal(false);
  };

  const handleSnsShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "같이가개",
        text: "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",
        url: window.location.href,
      });
    } else {
      alert("SNS 공유가 지원되지 않는 브라우저입니다.");
    }
    setShowShareModal(false);
  };

  return (
    <>
      {/* ── 폰트 로드 */}
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .ggk-logo { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
        .ggk-body { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }
        @keyframes tabPop {
          0% { transform: scale(1); }
          50% { transform: scale(0.88); }
          100% { transform: scale(1); }
        }
        .tab-item:active { animation: tabPop 0.18s ease; }
      `}</style>

      {/* ── 지도 영역 (가장 아래 레이어) */}
      <div style={{ position: "fixed", inset: 0, width: "100%", height: "100vh", zIndex: 0 }}>
        <div id="map" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

        {/* 이 지역 더보기 버튼 */}
        {mapReady && (
          <button
            onClick={handleWideView}
            className="ggk-body"
            style={{
              position: "absolute",
              top: "122px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 5,
              padding: "6px 14px",
              borderRadius: "999px",
              background: wideView ? "linear-gradient(135deg, #2a2a2a, #111)" : "white",
              color: wideView ? "white" : "#111",
              border: wideView ? "none" : "1px solid rgba(0,0,0,0.09)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: 600,
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.18s ease",
            }}
          >
            {wideView ? <><ZoomOut size={13} /> 돌아가기</> : <><ZoomIn size={13} /> 넓게 둘러보기</>}
          </button>
        )}

        {/* 공유 버튼 */}
        <button
          onClick={() => setShowShareModal(true)}
          title="공유하기"
          style={{
            position: "absolute",
            bottom: "96px",
            right: "20px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "none",
            background: "white",
            boxShadow: "0 2px 8px rgba(0,0,0,0.16)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
          }}
        >
          <Share size={17} color="#444" />
        </button>

        {/* 내 위치 버튼 */}
        <button
          onClick={moveToMyLocation}
          title="내 위치로 이동"
          style={{
            position: "absolute",
            bottom: "42px",
            right: "20px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "none",
            background: "white",
            boxShadow: "0 2px 8px rgba(0,0,0,0.16)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 3px 12px rgba(0,0,0,0.24)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.16)")}
        >
          <LocateFixed size={18} color="#444" />
        </button>

        {/* 마커 클릭 팝업 */}
        {selectedPlace && (
          <div
            className="ggk-body"
            style={{
              position: "absolute",
              left: "50%",
              bottom: "80px",
              transform: "translateX(-50%)",
              width: "290px",
              background: "#ffffff",
              borderRadius: "18px",
              boxShadow: "0 6px 24px rgba(0,0,0,0.16)",
              zIndex: 10,
              overflow: "hidden",
              animation: "fadeUp 0.2s ease",
              border: "1px solid #e8eaed",
            }}
          >
            <style>{`
              @keyframes fadeUp {
                from { opacity: 0; transform: translateX(-50%) translateY(8px); }
                to   { opacity: 1; transform: translateX(-50%) translateY(0); }
              }
            `}</style>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setSelectedPlace(null)}
                style={{
                  position: "absolute", top: "8px", right: "8px",
                  width: "26px", height: "26px", borderRadius: "50%",
                  border: "none", background: "rgba(0,0,0,0.45)", color: "white",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", zIndex: 1, fontSize: "13px", lineHeight: 1,
                }}
              >
                <X size={12} color="white" />
              </button>
            </div>
            <div style={{ padding: "13px" }}>
              <div className="ggk-logo" style={{ fontWeight: 700, fontSize: "13px", color: "#111" }}>
                {selectedPlace.name}
              </div>
              <div style={{ fontSize: "11px", color: "#666", marginTop: "3px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  {selectedPlace.pet_zone
                    ? PET_ZONE_EMOJI[selectedPlace.pet_zone]
                    : <PawPrint size={11} color="#888" />}
                </span>{" "}
                {PET_ZONE_LABEL[selectedPlace.pet_zone] || selectedPlace.pet_zone}
              </div>
              <div style={{ fontSize: "11px", color: "#999", marginTop: "1px", display: "flex", alignItems: "center", gap: "3px" }}>
                <MapPin size={10} color="#bbb" />
                {selectedPlace.address}
              </div>
              <button
                onClick={() => { setSelectedPlace(null); router.push(`/place/${selectedPlace.id}`); }}
                className="ggk-body"
                style={{
                  marginTop: "10px", width: "100%", padding: "9px",
                  background: "linear-gradient(145deg, #2a2a2a, #111)",
                  color: "white", border: "none", borderRadius: "10px",
                  fontWeight: 600, fontSize: "12px", cursor: "pointer",
                }}
              >
                자세히 보기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 플로팅 헤더 (지도 위) */}
      {!pathname.includes("login") && !pathname.includes("signup") && (
        <div
          className="ggk-body"
          style={{
            position: "fixed",
            top: "10px",
            left: "10px",
            right: "10px",
            zIndex: 999,
            padding: "10px 16px",
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e8eaed",
            boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* ── 좌측: 로고 + 소개문구 */}
          <div style={{ flexShrink: 0, lineHeight: 1 }}>
            <img
              src="/icons/header_logo_final.png"
              alt="같이가개"
              style={{ height: "60px", display: "block", objectFit: "contain" }}
            />
            <div
              className="ggk-body"
              style={{ fontSize: "10px", color: "#888", fontWeight: 400, marginTop: "6px", letterSpacing: "-0.1px", whiteSpace: "nowrap" }}
            >
              나의 가족인 반려동물과 함께 맛있는 추억을 나눌 장소 찾기
            </div>
          </div>

          {/* ── 중앙 필터 버튼 */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              gap: "4px",
              alignItems: "center",
            }}
          >
            <button onClick={() => setSelectedPetZone("all")} style={getButtonStyle("all")}>전체</button>
            <button onClick={() => setSelectedPetZone("indoor")} style={getButtonStyle("indoor")}>🏠 실내</button>
            <button onClick={() => setSelectedPetZone("terrace")} style={getButtonStyle("terrace")}>🌿 테라스</button>
            <button onClick={() => setSelectedPetZone("both")} style={getButtonStyle("both")}>🏡 실내외</button>
          </div>

          {/* ── 우측: 신규 장소 + 제보하기 */}
          <div style={{ display: "flex", gap: "5px", flexShrink: 0, alignItems: "center" }}>
            <button
              onClick={() => setShowRecentPanel(!showRecentPanel)}
              className="ggk-body"
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                borderRadius: "8px",
                border: "1px solid rgba(210,160,45,0.4)",
                background: "linear-gradient(145deg, #FCEDB0, #F5C840)",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "#7A5300",
                boxShadow: "0 1px 5px rgba(240,195,60,0.22)",
                whiteSpace: "nowrap",
              }}
            >
              <MapPinPlus size={11} />
              신규 장소
            </button>

            <button
              onClick={() => router.push("/report")}
              className="ggk-body"
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                borderRadius: "8px",
                border: "1px solid rgba(0,0,0,0.08)",
                background: "#f5f6f8",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "#444",
                whiteSpace: "nowrap",
              }}
            >
              <Pencil size={11} />
              제보하기
            </button>
          </div>
        </div>
      )}

      {/* ── 리스트 패널 (지도 위, 헤더 아래) */}
      <div
        className="ggk-body"
        style={{
          position: "fixed",
          top: "122px",
          left: "14px",
          width: "210px",
          height: "50vh",
          background: "#ffffff",
          border: "1px solid #e8eaed",
          borderRadius: "20px",
          overflow: "hidden",
          zIndex: 20,
          boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
          display: "flex",
          flexDirection: "column",
          padding: "14px 0",
        }}
      >
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            height: "100%",
            marginTop: "6px",
            marginBottom: "6px",
            paddingLeft: "10px",
            paddingRight: "4px",
            scrollbarWidth: "thin",
          }}
        >
          <div style={{ height: "8px" }} />
          {filteredPlaces.map((place) => (
            <div key={place.id}>
              <div
                onClick={() => {
                  setSelectedPlace(null);
                  router.push(`/place/${place.id}`);
                }}
                style={{
                  marginBottom: "6px",
                  background: selectedPlace?.id === place.id ? "#eef6ff" : "white",
                  borderRadius: "12px",
                  cursor: "pointer",
                  border:
                    selectedPlace?.id === place.id
                      ? "1.5px solid #93c5fd"
                      : "1px solid #eee",
                  overflow: "hidden",
                }}
              >
                <img
                  src={place.image_url}
                  alt={place.name}
                  style={{ width: "100%", height: "85px", objectFit: "cover", display: "block" }}
                />
                <div style={{ padding: "6px 9px" }}>
                  <div style={{ fontWeight: 700, fontSize: "11px", color: "#111" }}>{place.name}</div>
                  <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      {place.pet_zone
                        ? <span>{PET_ZONE_EMOJI[place.pet_zone]}</span>
                        : <PawPrint size={10} color="#888" />}
                      {PET_ZONE_LABEL[place.pet_zone] || place.pet_zone}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#999",
                      marginTop: "1px",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                  >
                    <MapPin size={10} color="#bbb" />
                    {place.address}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ height: "8px" }} />
        </div>
      </div>

      {/* ── 신규 장소 패널 */}
      {showRecentPanel && (
        <div
          className="ggk-body"
          style={{
            position: "fixed",
            top: "122px",
            right: "14px",
            width: "280px",
            maxHeight: "64vh",
            background: "#ffffff",
            borderRadius: "22px",
            overflow: "hidden",
            zIndex: 30,
            boxShadow: "0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 헤더 */}
          <div
            style={{
              background: "linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 100%)",
              padding: "16px 18px 14px",
              flexShrink: 0,
              borderBottom: "1px solid rgba(99,102,241,0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div
                  className="ggk-logo"
                  style={{ fontSize: "15px", fontWeight: 800, color: "#1e1b4b", letterSpacing: "-0.2px" }}
                >
                  신규 장소
                </div>
                <div style={{ fontSize: "10px", color: "#4338ca", marginTop: "3px", fontWeight: 500 }}>
                  최근 등록된 장소 순서
                </div>
              </div>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: "rgba(99,102,241,0.18)",
                  color: "#3730a3",
                  letterSpacing: "0.5px",
                }}
              >
                NEW
              </div>
            </div>
          </div>

          {/* 리스트 */}
          <div
            style={{
              overflowY: "auto",
              flex: 1,
              padding: "10px 10px",
              scrollbarWidth: "thin",
              scrollbarColor: "#ddd transparent",
            }}
          >
            {[...places]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 10)
              .map((place, idx) => (
                <div
                  key={place.id}
                  onClick={() => router.push(`/place/${place.id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "11px",
                    padding: "10px 11px",
                    borderRadius: "14px",
                    marginBottom: "6px",
                    cursor: "pointer",
                    border: "1px solid rgba(0,0,0,0.05)",
                    background: "#f8f9fb",
                    transition: "background 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#eef2ff";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 10px rgba(99,102,241,0.10)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#f8f9fb";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "9px",
                      background: "rgba(99,102,241,0.18)",
                      color: "#3730a3",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="ggk-logo"
                      style={{
                        fontWeight: 700,
                        fontSize: "13px",
                        color: "#111",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        letterSpacing: "-0.1px",
                      }}
                    >
                      {place.name}
                    </div>
                    <div style={{ fontSize: "10px", color: "#777", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span>
                        {place.pet_zone
                          ? PET_ZONE_EMOJI[place.pet_zone]
                          : <PawPrint size={10} color="#777" />}
                      </span>
                      <span>{PET_ZONE_LABEL[place.pet_zone] || place.pet_zone}</span>
                    </div>
                    {place.address && (
                      <div style={{
                        fontSize: "10px",
                        color: "#aaa",
                        marginTop: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {place.address}
                      </div>
                    )}
                  </div>

                  <div style={{ color: "#c8ccd4", fontSize: "16px", flexShrink: 0, lineHeight: 1 }}>›</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── 공유 모달 */}
      {showShareModal && (
        <>
          <div
            onClick={() => setShowShareModal(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 100 }}
          />
          <div
            className="ggk-body"
            style={{
              position: "fixed",
              bottom: "50%",
              left: "50%",
              transform: "translate(-50%, 50%)",
              background: "white",
              borderRadius: "20px",
              padding: "22px 20px",
              zIndex: 101,
              boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
              width: "320px",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "16px", marginBottom: "18px" }}>공유하기</div>
            <div onClick={handleCopyLink} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px", borderRadius: "13px", cursor: "pointer", marginBottom: "7px", border: "1px solid #eee" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Link size={16} color="#444" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>링크 복사하기</div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "1px" }}>클립보드에 링크를 복사합니다</div>
              </div>
            </div>
            <div onClick={handleSnsShare} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px", borderRadius: "13px", cursor: "pointer", marginBottom: "7px", border: "1px solid #eee" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Upload size={16} color="#444" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>SNS로 공유하기</div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "1px" }}>인스타그램, X, Thread 등으로 공유합니다</div>
              </div>
            </div>
            <div onClick={() => { handleKakaoShare(); setShowShareModal(false); }} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px", borderRadius: "13px", cursor: "pointer", border: "1px solid #eee", background: "#FEE500" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle size={16} color="#7a6000" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>카카오톡으로 공유하기</div>
                <div style={{ fontSize: "11px", color: "#7a6000", marginTop: "1px" }}>카카오톡 친구에게 공유합니다</div>
              </div>
            </div>
            <button onClick={() => setShowShareModal(false)} style={{ marginTop: "16px", width: "100%", padding: "12px", background: "#f5f5f5", border: "none", borderRadius: "12px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
              닫기
            </button>
          </div>
        </>
      )}
    </>
  );
}