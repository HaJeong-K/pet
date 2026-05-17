"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import { LocateFixed, Share } from "lucide-react";

declare global {
  interface Window {
    kakao: any;
    selectPlace: (id: number) => void;
  }
}

// ✅ 상수를 컴포넌트 밖으로 — 매 렌더마다 재생성되지 않도록
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
  const markersRef = useRef<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const checkLogin = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setIsLoggedIn(!!session);
    };

    checkLogin();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  const handleLogout = async () => {
    await supabase.auth.signOut({
      scope: "global",
    });
    window.location.href =
      `https://kauth.kakao.com/oauth/logout?client_id=${process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY}&logout_redirect_uri=http://localhost:3000`;
  };

  const createUserProfile = async (user: any) => {
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (existingUser) return;

    const nickname =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "사용자";

    await supabase.from("users").insert([
      {
        auth_user_id: user.id,
        email: user.email,
        nickname,
      },
    ]);
  };

  // ✅ window.selectPlace가 stale closure를 갖지 않도록 ref로 최신 함수를 유지
  const selectPlaceRef = useRef<(id: number) => void>(() => {});

  const [places, setPlaces] = useState<any[]>([]);
  const [selectedPetZone, setSelectedPetZone] = useState("all");

  // ✅ 마커 클릭 시 팝업으로 보여줄 장소 상태
  const [selectedPlace, setSelectedPlace] = useState<any | null>(null);

  const [showRecentPanel, setShowRecentPanel] = useState(false);

  // 매 렌더마다 selectPlaceRef를 최신 상태로 갱신
  selectPlaceRef.current = (id: number) => {
    const found = places.find((p) => p.id === id);
    if (found) setSelectedPlace(found);
  };

  const getButtonStyle = (type: string) => ({
    padding: "7px 10px",
    fontSize: "12px",
    borderRadius: "999px",
    border: "none",
    fontWeight: "bold" as const,
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    background: selectedPetZone === type ? "#000" : "white",
    color: selectedPetZone === type ? "white" : "black",
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);

      if (session?.user) {
        await createUserProfile(session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);

      if (session?.user) {
        await createUserProfile(session.user);
      }
    });

    // ✅ 카카오 SDK 초기화
    if ((window as any).Kakao && !(window as any).Kakao.isInitialized()) {
      (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
    }

    return () => subscription.unsubscribe();
  }, []);

  // ================= 데이터 로딩 =================
  useEffect(() => {
    const fetchPlaces = async () => {
      const { data, error } = await supabase.from("places").select("*");
      if (error) {
        console.error(error);
        return;
      }
      setPlaces(data || []);
    };
    fetchPlaces();
  }, []);

  // ================= 필터 =================
  // ✅ useMemo로 안정화 — 매 렌더마다 새 배열 참조를 만들지 않아 마커 재렌더(줌 끊김 원인) 방지
  const filteredPlaces = useMemo(
    () =>
      selectedPetZone === "all"
        ? places
        : places.filter((p) => p.pet_zone === selectedPetZone),
    [places, selectedPetZone]
  );

  // ================= 카카오맵 로드 =================
  useEffect(() => {
    // ✅ window.selectPlace는 ref를 통해 항상 최신 함수를 호출
    window.selectPlace = (id: number) => selectPlaceRef.current(id);

    const initializeMap = () => {
      const container = document.getElementById("map");
      if (!container) return;

      mapRef.current = new window.kakao.maps.Map(container, {
        center: new window.kakao.maps.LatLng(37.5665, 126.978),
        level: 4,
      });
      // ✅ 이 한 줄 추가 — 지도가 컨테이너 크기를 정확히 인식하게 함
      window.kakao.maps.event.addListener(mapRef.current, 'tilesloaded', () => {
        window.dispatchEvent(new Event('resize'));
      });
      setMapReady(true);
    };

    if (window.kakao && window.kakao.maps) {
      initializeMap();
      return;
    }

    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.async = true;
    document.head.appendChild(script);

    script.onload = () => {
      window.kakao.maps.load(() => {
        initializeMap();
      });
    };
  }, []);

  // ================= 마커 렌더 =================
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;

    const map = mapRef.current;

    // 기존 마커 제거
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    filteredPlaces.forEach((place) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lng);

      if (isNaN(lat) || isNaN(lng)) {
        console.warn("❌ 좌표 문제:", place.name, place.lat, place.lng);
        return;
      }

      const position = new window.kakao.maps.LatLng(lat, lng);
      const emoji = PET_ZONE_EMOJI[place.pet_zone] || "🐾";

      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content: `
          <div
            onclick="window.selectPlace(${place.id})"
            style="
              background: white;
              border-radius: 999px;
              padding: 8px 14px;
              font-size: 13px;
              font-weight: bold;
              box-shadow: 0 2px 8px rgba(0,0,0,0.15);
              cursor: pointer;
              white-space: nowrap;
              user-select: none;
            "
          >
            ${emoji} ${place.name}
          </div>
        `,
        yAnchor: 1,
        zIndex: 3,
      });

      overlay.setMap(map);
      markersRef.current.push(overlay);
    });
  }, [filteredPlaces, mapReady]);

  // ================= 내 위치 이동 =================
  const moveToMyLocation = () => {
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 서비스를 지원하지 않습니다.");
      return;
    }
    if (!mapRef.current) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const myLatLng = new window.kakao.maps.LatLng(latitude, longitude);
        mapRef.current.setCenter(myLatLng);
        mapRef.current.setLevel(3);
      },
      () => {
        alert("위치 정보를 가져올 수 없습니다.\n브라우저 위치 권한을 확인해주세요.");
      }
    );
  };

  const handleKakaoShare = () => {
    if (!(window as any).Kakao) {
      alert("카카오톡 공유를 사용할 수 없습니다.");
      return;
    }
    (window as any).Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: "같이가개",
        description: "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",
        imageUrl: "", // 대표 이미지 URL 있으면 넣기
        link: {
          mobileWebUrl: window.location.href,
          webUrl: window.location.href,
        },
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
      {/* 상단 헤더 */}
      {!pathname.includes("login") &&
      !pathname.includes("signup") && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            zIndex: 999,
            padding: "18px 24px",
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {/* 상단 1줄 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            {/* 좌측 */}
            <div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 900,
                  color: "#111",
                }}
              >
                같이가개
              </div>

              <div
                style={{
                  fontSize: "13px",
                  color: "#666",
                  marginTop: "4px",
                }}
              >
                나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.
              </div>
            </div>

            {/* 우측 버튼 */}
            <div style={{ display: "flex", gap: "10px" }}>
              {/* 신규 장소 */}
              <button
                onClick={() => setShowRecentPanel(!showRecentPanel)}
                style={{
                  padding: "7px 12px",
                  fontSize: "13px", 
                  borderRadius: "10px",
                  border: "1px solid #E7C77F",
                  background: "#F5D58B",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                신규 장소
              </button>

              {/* 제보하기 */}
              <button
                onClick={() => router.push("/report")}
                style={{
                  padding: "7px 12px",
                  fontSize: "13px", 
                  borderRadius: "10px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                제보하기
              </button>

              {/* 로그인 / 로그아웃 버튼 */}
              <button
                onClick={() => {
                  if (isLoggedIn) {
                    handleLogout();
                  } else {
                    router.push("/login");
                  }
                }}
                style={{
                  padding: "7px 12px",
                  fontSize: "13px",
                  borderRadius: "10px",
                  border: "1px solid #111",
                  background: "#111",
                  color: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isLoggedIn ? "로그아웃" : "로그인"}
              </button>
            </div>
          </div>

          {/* 필터 버튼 */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
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
              🌿 테라스 가능
            </button>

            <button
              onClick={() => setSelectedPetZone("both")}
              style={getButtonStyle("both")}
            >
              🏡 실내외 가능
            </button>
          </div>
        </div>
      )}

      {/* 전체 레이아웃 */}
      <div
        style={{
          width: "100vw",
          height: "100vh",
          position: "relative",
          overflow: "hidden",
          background: "#f5f6f8",
        }}
      >

        {/* 리스트 패널 */}
        <div
          style={{
            position: "absolute",
            top: "175px",
            left: "20px",
            width: "300px",
            height: "calc(100vh - 215px)",
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.4)",
            borderRadius: "28px",
            overflow: "hidden",
            zIndex: 20,
            boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
            display: "flex", 
            flexDirection: "column",
            padding: "20px 0",
            boxSizing: "border-box",
          }}
        >
          {/*  스크롤 영역 - 수정 금지!!  */}
          <div
            style={{
              overflowY: "auto",
              flex: 1,
              height: "100%",
              marginTop: "10px",     // ← 상단 여백
              marginBottom: "10px", // ← 하단 여백
              paddingLeft: "12px",
              paddingRight: "4px",   // ← 스크롤바 공간 확보
              scrollbarWidth: "thin",
              boxSizing: "border-box",
            }}
          >
            <div style={{ height: "12px" }} />
            {filteredPlaces.map((place, index) => (
              <div key={place.id}>
                <div
                  onClick={() => {
                    setSelectedPlace(null);
                    router.push(`/place/${place.id}`);
                  }}
                  style={{
                    marginBottom: "10px",
                    background: selectedPlace?.id === place.id ? "#eef6ff" : "white",
                    borderRadius: "16px",
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
                    style={{ width: "100%", height: "160px", objectFit: "cover", display: "block" }}
                  />
                  <div style={{ padding: "14px" }}>
                    <div style={{ fontWeight: 700 }}>{place.name}</div>
                    <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                      {PET_ZONE_LABEL[place.pet_zone] || place.pet_zone}
                    </div>
                    <div style={{ fontSize: "12px", color: "#888", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <LocateFixed size={14} />
                      {place.address}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ height: "12px" }} />
          </div>
        </div>
        </div>
      

        {/* 신규 장소 패널 */}
        {showRecentPanel && (
          <div
            style={{
              position: "absolute",
              top: "130px",
              right: "20px",
              width: "320px",
              height: "calc(100vh - 150px)",
              background: "rgba(255,255,255,0.92)",
              borderRadius: "24px",
              overflowY: "auto",
              zIndex: 30,
              padding: "20px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.14)",
            }}
          >
            <div
              style={{
                fontSize: "22px",
                fontWeight: 800,
                marginBottom: "18px",
              }}
            >
              신규 장소
            </div>

            {[...places]
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              )
              .slice(0, 10)
              .map((place, idx) => (
                <div
                  key={place.id}
                  onClick={() => router.push(`/place/${place.id}`)}
                  style={{
                    padding: "14px",
                    borderRadius: "16px",
                    background: "#fff",
                    marginBottom: "12px",
                    cursor: "pointer",
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    #{idx + 1} {place.name}
                  </div>

                  <div
                    style={{
                      fontSize: "13px",
                      color: "#666",
                      marginTop: "6px",
                    }}
                  >
                    {PET_ZONE_LABEL[place.pet_zone]}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* 지도 영역 — position: relative로 팝업·버튼의 기준점 역할 */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100vh",
          }}
        >

          {/* 카카오맵 */}
          <div
            id="map"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }}
          />

          {/* 공유 버튼 */}
          <button
            onClick={() => setShowShareModal(true)}
            title="공유하기"
            style={{
              position: "absolute",
              bottom: "95px",
              right: "28px",
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              border: "none",
              background: "white",
              boxShadow: "0 3px 12px rgba(0,0,0,0.2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
          >
            <Share size={22} />
          </button>

          {/* ✅ 공유 모달 */}
          {showShareModal && (
            <>
              {/* 배경 dimmed */}
              <div
                onClick={() => setShowShareModal(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.3)",
                  zIndex: 100,
                }}
              />

              {/* 모달 */}
              <div
                style={{
                  position: "fixed",
                  bottom: "50%",
                  left: "50%",
                  transform: "translate(-50%, 50%)",
                  background: "white",
                  borderRadius: "24px",
                  padding: "28px 24px",
                  zIndex: 101,
                  boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
                  width: "360px",   // ← 고정 너비
                }}
              >
                <div style={{ fontWeight: 800, fontSize: "18px", marginBottom: "24px" }}>
                  공유하기
                </div>

                {/* 링크 복사 */}
                <div
                  onClick={handleCopyLink}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "16px",
                    borderRadius: "16px",
                    cursor: "pointer",
                    marginBottom: "8px",
                    border: "1px solid #eee",
                  }}
                >
                  <div style={{ fontSize: "24px" }}>🔗</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>링크 복사하기</div>
                    <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>클립보드에 링크를 복사합니다</div>
                  </div>
                </div>

                {/* SNS 공유 */}
                <div
                  onClick={handleSnsShare}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "16px",
                    borderRadius: "16px",
                    cursor: "pointer",
                    marginBottom: "8px",
                    border: "1px solid #eee",
                  }}
                >
                  <div style={{ fontSize: "24px" }}>📤</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>SNS로 공유하기</div>
                    <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>인스타그램, X, Thread 등으로 공유합니다</div>
                  </div>
                </div>

                {/* 카카오톡 */}
                <div
                  onClick={() => { handleKakaoShare(); setShowShareModal(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "16px",
                    borderRadius: "16px",
                    cursor: "pointer",
                    border: "1px solid #eee",
                    background: "#FEE500",
                  }}
                >
                  <div style={{ fontSize: "24px" }}>💬</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>카카오톡으로 공유하기</div>
                    <div style={{ fontSize: "12px", color: "#7a6000", marginTop: "2px" }}>카카오톡 친구에게 공유합니다</div>
                  </div>
                </div>

                {/* 닫기 버튼 */}
                <button
                  onClick={() => setShowShareModal(false)}
                  style={{
                    marginTop: "20px",
                    width: "100%",
                    padding: "14px",
                    background: "#f5f5f5",
                    border: "none",
                    borderRadius: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "15px",
                  }}
                >
                  닫기
                </button>
              </div>
            </>
          )}

          {/* ✅ 내 위치 버튼 — 우측 하단 고정 */}
          <button
            onClick={moveToMyLocation}
            title="내 위치로 이동"
            style={{
              position: "absolute",
              bottom: "28px",
              right: "28px",
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              border: "none",
              background: "white",
              boxShadow: "0 3px 12px rgba(0,0,0,0.2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              zIndex: 10,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.boxShadow = "0 3px 12px rgba(0,0,0,0.2)")
            }
          >
            <LocateFixed size={24} />
          </button>

          {/* ✅ 마커 클릭 시 뜨는 팝업 패널 — 지도 위 좌측 하단 */}
          {selectedPlace && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: "28px",
                transform: "translateX(-50%)",
                width: "340px",
                background: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: "24px",
                boxShadow: "0 10px 36px rgba(0,0,0,0.22)",
                zIndex: 30,
                overflow: "hidden",
                animation: "fadeUp 0.2s ease",
                border: "1px solid rgba(255,255,255,0.4)",
              }}
            >
              <style>{`
                @keyframes fadeUp {
                  from { opacity: 0; transform: translateY(10px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
              `}</style>

              {/* 이미지 + 닫기 버튼 */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setSelectedPlace(null)}
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0,0,0,0.5)",
                    color: "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1,
                    fontSize: "16px",
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* 텍스트 정보 */}
              <div style={{ padding: "16px" }}>
                <div style={{ fontWeight: 800, fontSize: "15px" }}>{selectedPlace.name}</div>
                <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
                  {PET_ZONE_EMOJI[selectedPlace.pet_zone] || "🐾"}{" "}
                  {PET_ZONE_LABEL[selectedPlace.pet_zone] || selectedPlace.pet_zone}
                </div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "3px" }}>
                  📍 {selectedPlace.address}
                </div>

                {/* 상세 페이지 이동 버튼 */}
                <button
                  onClick={() => {

                    setSelectedPlace(null);

                    router.push(`/place/${selectedPlace.id}`);
                  }}
                  style={{
                    marginTop: "14px",
                    width: "100%",
                    padding: "12px",
                    background: "#111",
                    color: "white",
                    border: "none",
                    borderRadius: "12px",
                    fontWeight: "bold",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  자세히 보기
                </button>
              </div>
            </div>
          )}
        </div>
      
    </>
  );
}