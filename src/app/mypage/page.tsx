"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  Heart, MessageCircle, ArrowLeft, LogOut, MapPin,
  Settings, X, ChevronRight, Trash2, PawPrint,
  Home, Trees, Building2, User, Lock, UserX, Check,
  Eye, EyeOff, Mail,
} from "lucide-react";

/* ── 상수 ── */
const ADMIN_EMAIL = "admin@gachigage.com"; // ← 관리자 이메일 변경

const PET_ZONE_LABEL: Record<string, string> = {
  indoor: "실내 가능",
  terrace: "테라스 가능",
  both: "실내외 가능",
};
const PET_ZONE_ICON = (type: string) => {
  if (type === "indoor") return <Home size={10} />;
  if (type === "terrace") return <Trees size={10} />;
  if (type === "both") return <Building2 size={10} />;
  return <PawPrint size={10} />;
};

const profileColors = [
  "#FF6B6B","#F06595","#CC5DE8","#845EF7","#5C7CFA","#339AF0",
  "#22B8CF","#20C997","#51CF66","#94D82D","#FCC419","#FF922B",
];
const getProfileColor = (nickname: string) => {
  if (!nickname) return "#999";
  const code = nickname.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return profileColors[code % profileColors.length];
};

const formatDate = (s: string) => {
  const d = new Date(s);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
};

const inp: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: "10px",
  border: "1px solid #e2e8f0", fontSize: "13px", outline: "none",
  fontFamily: "'Noto Sans KR', sans-serif", background: "#f8fafc",
  boxSizing: "border-box",
};

export default function MyPage() {
  const router = useRouter();
  const [session, setSession]           = useState<any>(null);
  const [userProfile, setUserProfile]   = useState<any>(null);
  const [bookmarks, setBookmarks]       = useState<any[]>([]);
  const [myReviews, setMyReviews]       = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<"bookmarks"|"reviews">("bookmarks");
  const [loading, setLoading]           = useState(true);

  const [showSettings, setShowSettings] = useState(false);
  const [settingView, setSettingView]   = useState<"menu"|"nickname"|"password"|"withdraw">("menu");

  const [newNickname, setNewNickname]   = useState("");
  const [nickMsg, setNickMsg]           = useState<{ok:boolean;text:string}|null>(null);
  const [nickChecked, setNickChecked]   = useState(false);
  const [isCheckingNick, setIsCheckingNick] = useState(false);

  const [curPw, setCurPw]               = useState("");
  const [newPw, setNewPw]               = useState("");
  const [newPw2, setNewPw2]             = useState("");
  const [showCurPw, setShowCurPw]       = useState(false);
  const [showNewPw, setShowNewPw]       = useState(false);
  const [showNewPw2, setShowNewPw2]     = useState(false);
  const [pwMsg, setPwMsg]               = useState<{ok:boolean;text:string}|null>(null);

  const [withdrawPw, setWithdrawPw]     = useState("");
  const [withdrawMsg, setWithdrawMsg]   = useState<{ok:boolean;text:string}|null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [deletingBookmarkId, setDeletingBookmarkId] = useState<number|null>(null);
  const [deletingReviewId, setDeletingReviewId]     = useState<string|null>(null);

  /* 개인정보 처리방침 모달 */
  const [showPrivacy, setShowPrivacy]   = useState(false);

  const loadData = async (sess: any) => {
    setBookmarks([]);
    setMyReviews([]);
    
    const uid = sess.user.id;

    const [
      { data: profile },
      { data: bookmarkReactions },
      { data: reviews },
    ] = await Promise.all([
      supabase.from("users").select("*").eq("auth_user_id", uid).single(),
      // ✅ auth_user_id 하나로만 조회 (북마크 insert 시 user_key 대신 auth_user_id 저장하도록 통일 필요)
      supabase.from("reactions")
        .select("place_id")
        .eq("user_key", uid)  // 또는 통일된 키
        .eq("type", "bookmark"),
      supabase.from("reviews")
        .select("id, content, created_at, likes, place_id, places(name)")
        // ✅ select("*") 대신 필요한 컬럼만
        .eq("auth_user_id", uid)
        .eq("deleted", false)
        .order("created_at", { ascending: false }),
    ]);

    setUserProfile(profile);
    setMyReviews(reviews || []);

    const ids = (bookmarkReactions || []).map((x: any) => x.place_id);
    if (ids.length > 0) {
      const { data: places } = await supabase
        .from("places")
        .select("id, name, address, image_url, pet_zone") // ✅ * 대신 필요한 것만
        .in("id", ids);
      setBookmarks(places || []);
    } else {
      setBookmarks([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login?redirect=/mypage");
        return;
      }
      setSession(session);
      loadData(session);
    });
    // onAuthStateChange 제거 - getSession으로 충분
  }, []);

  const handleLogout = async () => {
    const provider = localStorage.getItem("provider");
    await supabase.auth.signOut({ scope: "global" });
    localStorage.removeItem("provider");
    if (provider === "kakao") {
      window.location.href = `https://kauth.kakao.com/oauth/logout?client_id=${process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY}&logout_redirect_uri=${window.location.origin}`;
    } else { window.location.href = "/"; }
  };

  const handleNicknameChange = async () => {
    if (!newNickname.trim()) { setNickMsg({ok:false,text:"닉네임을 입력해주세요."}); return; }
    if (!nickChecked) { setNickMsg({ok:false,text:"닉네임 중복 확인을 해주세요."}); return; }
    if (nickMsg && !nickMsg.ok) return;
    const { error } = await supabase.from("users").update({ nickname: newNickname }).eq("auth_user_id", session.user.id);
    if (error) { setNickMsg({ok:false,text:"변경 실패. 다시 시도해주세요."}); return; }
    await supabase.auth.updateUser({ data: { full_name: newNickname, nickname: newNickname, name: newNickname } });
    setUserProfile((p: any) => ({ ...p, nickname: newNickname }));
    setNickMsg({ok:true,text:"닉네임이 변경되었습니다!"});
    setTimeout(() => { setShowSettings(false); setSettingView("menu"); setNickMsg(null); setNewNickname(""); setNickChecked(false); }, 1200);
  };

  const handleCheckNickname = async () => {
    if (!newNickname.trim()) { setNickMsg({ok:false,text:"닉네임을 입력해주세요."}); return; }
    setIsCheckingNick(true);
    const { data: dup } = await supabase.rpc("check_nickname_exists", { p_nickname: newNickname });
    setIsCheckingNick(false);
    setNickChecked(true);
    if (dup) { setNickMsg({ok:false,text:"이미 사용중인 닉네임입니다."}); }
    else { setNickMsg({ok:true,text:"사용 가능한 닉네임입니다."}); }
  };

  const handlePasswordChange = async () => {
    if (!curPw || !newPw || !newPw2) { setPwMsg({ok:false,text:"모든 항목을 입력해주세요."}); return; }
    if (newPw !== newPw2) { setPwMsg({ok:false,text:"새 비밀번호가 일치하지 않습니다."}); return; }
    if (!/^(?=.*[a-z]).{6,}$/.test(newPw)) { setPwMsg({ok:false,text:"영문 소문자 포함 6자 이상이어야 합니다."}); return; }
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: session.user.email, password: curPw });
    if (signInErr) { setPwMsg({ok:false,text:"현재 비밀번호가 올바르지 않습니다."}); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { setPwMsg({ok:false,text:"변경 실패. 다시 시도해주세요."}); return; }
    setPwMsg({ok:true,text:"비밀번호가 변경되었습니다!"});
    setTimeout(() => { setShowSettings(false); setSettingView("menu"); setPwMsg(null); setCurPw(""); setNewPw(""); setNewPw2(""); }, 1200);
  };

  const handleWithdraw = async () => {
    if (!isOAuthUser) {
      if (!withdrawPw) { setWithdrawMsg({ok:false,text:"비밀번호를 입력해주세요."}); return; }
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: session.user.email, password: withdrawPw });
      if (signInErr) { setWithdrawMsg({ok:false,text:"비밀번호가 올바르지 않습니다."}); return; }
    }
    await supabase.from("users").delete().eq("auth_user_id", session.user.id);
    await supabase.auth.admin?.deleteUser?.(session.user.id);
    await supabase.auth.signOut();
    alert("회원 탈퇴가 완료되었습니다.");
    window.location.href = "/";
  };

  const handleRemoveBookmark = async (placeId: number) => {
    await supabase.from("reactions").delete()
      .eq("place_id", placeId)
      .eq("type", "bookmark")
      .eq("user_key", session.user.id);
    setBookmarks(prev => prev.filter(p => p.id !== placeId));
    setDeletingBookmarkId(null);
  };

  const handleDeleteReview = async (reviewId: string) => {
    await supabase.from("reviews").update({ deleted: true, content: "삭제된 댓글입니다." }).eq("id", reviewId);
    setMyReviews(prev => prev.filter(r => r.id !== reviewId));
    setDeletingReviewId(null);
  };

  const closeSettings = () => {
    setShowSettings(false); setSettingView("menu");
    setNickMsg(null); setPwMsg(null); setWithdrawMsg(null);
    setNewNickname(""); setCurPw(""); setNewPw(""); setNewPw2(""); setWithdrawPw("");
    setNickChecked(false);
  };

  const isOAuthUser = session?.user?.app_metadata?.provider !== "email";


  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .ggk-logo { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
        .ggk-body { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }
        .card-hover { transition: box-shadow 0.15s, transform 0.15s; }
        .card-hover:hover { box-shadow: 0 5px 16px rgba(0,0,0,0.09); transform: translateY(-1px); }
        .tab-btn { transition: all 0.15s ease; }
        .setting-row:hover { background: #f0f2f5 !important; }
      `}</style>

      {/* ── 3단 레이아웃 전체 래퍼 */}
      <div className="ggk-body" style={{ display:"flex", minHeight:"100vh", background:"#e8eaed", opacity: loading ? 0 : 1, transition: "opacity 0.2s ease", }}>

        {/* ── 좌측 광고 바 */}
        <div style={{
          width: "160px",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          background: "#f0f1f3",
          borderRight: "1px solid #e2e4e8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "20px 12px",
        }}>
          {/* 광고 슬롯 1 */}
          <div style={{
            width: "132px", height: "280px",
            background: "linear-gradient(160deg,#f8f9fb,#eef0f3)",
            borderRadius: "12px",
            border: "1.5px dashed #d0d3d9",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: "6px",
          }}>
            <div style={{ fontSize: "18px" }}>📢</div>
            <div style={{ fontSize: "10px", color: "#bbb", fontWeight: 600, textAlign: "center", lineHeight: 1.5 }}>
              광고 영역
            </div>
          </div>
          {/* 광고 슬롯 2 */}
          <div style={{
            width: "132px", height: "132px",
            background: "linear-gradient(160deg,#f8f9fb,#eef0f3)",
            borderRadius: "12px",
            border: "1.5px dashed #d0d3d9",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: "6px",
          }}>
            <div style={{ fontSize: "16px" }}>📣</div>
            <div style={{ fontSize: "10px", color: "#bbb", fontWeight: 600, textAlign: "center" }}>
              광고 영역
            </div>
          </div>
        </div>

        {/* ── 중앙 콘텐츠 */}
        <div
					style={{
						flex: 1,
						minWidth: 0,
						height: "100vh",
						overflow: "hidden",
						background: "#f0f2f5",
						paddingBottom: "80px",
						display: "flex",
						flexDirection: "column",
					}}
				>

          {/* ── 헤더 (설정 버튼 제거됨) */}
          <div style={{
            background: "white", borderBottom: "1px solid #e8eaed",
            padding: "12px 18px", display: "flex", alignItems: "center",
            justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50,
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
          }}>
            <button onClick={() => router.push("/")} style={{ border:"none", background:"transparent", cursor:"pointer", padding:3, borderRadius:7, display:"flex" }}>
              <ArrowLeft size={18} color="#444" />
            </button>
            <div className="ggk-logo" style={{ fontSize:"14px", fontWeight:800, color:"#111" }}>마이페이지</div>
            {/* 헤더 우측 빈 공간 균형용 */}
            <div style={{ width: 26 }} />
          </div>

          {/* ── 프로필 카드 */}
					<div
						style={{
							margin: "14px 14px 0",
							background: "white",
							borderRadius: "28px",
							padding: "22px 24px",
							border: "1px solid #ececf3",
							boxShadow: "0 4px 18px rgba(0,0,0,0.05)",
							flexShrink: 0,
						}}
					>
						<div
							style={{
								width: "100%",
								padding: "0 6px",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: "18px",
							}}
						>
							{/* 좌측 */}
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "14px",
									minWidth: 0,
								}}
							>
								{/* 프로필 이미지 */}
								<div
									style={{
										width: "58px",
										height: "58px",
										borderRadius: "50%",
										overflow: "hidden",
										flexShrink: 0,
										background: userProfile?.avatar_url
											? "transparent"
											: "#f3e8ff",
										border: "1px solid #ececf3",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										color: "#8b5cf6",
										fontSize: "24px",
										fontWeight: 800,
									}}
								>
									{userProfile?.avatar_url ? (
										<img
											src={userProfile.avatar_url}
											alt={userProfile.nickname}
                      referrerPolicy="no-referrer"
											style={{
												width: "100%",
												height: "100%",
												objectFit: "cover",
											}}
										/>
									) : (
										userProfile?.nickname?.charAt(0)
									)}
								</div>

								{/* 닉네임 */}
								<div style={{ minWidth: 0 }}>
									<div
										className="ggk-logo"
										style={{
											fontSize: "20px",
											fontWeight: 800,
											color: "#111",
											marginBottom: "5px",
										}}
									>
										{userProfile?.nickname}
									</div>

									<div
										style={{
											fontSize: "12px",
											color: "#888",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{session?.user?.email}
									</div>
								</div>
							</div>

							{/* 설정 버튼 */}
							<button
								onClick={() => setShowSettings(true)}
								style={{
									width: "40px",
									height: "40px",
									borderRadius: "50%",
									border: "1px solid #ececf3",
									background: "#f3e8ff",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									cursor: "pointer",
									flexShrink: 0,
								}}
							>
								<Settings size={18} color="#8b5cf6" />
							</button>
						</div>
					</div>

          {/* ── 상단 카드 영역 */}
					<div style={{ flexShrink: 0 }}>
						{/* ── 통계 카드 */}
						<div
							style={{
								margin: "14px 14px 14px",
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 12,
							}}
						>
							{/* 찜한 장소 */}
							<button
								onClick={() => setActiveSection("bookmarks")}
								style={{
									padding: "18px 16px",
									borderRadius: 22,
									border: "1px solid #e8eaed",
									background: "white",
									textAlign: "left",
									cursor: "pointer",
									boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
									transition: "all 0.18s ease",
								}}
							>
								<div
									style={{
										width: 42,
										height: 42,
										borderRadius: 14,
										background: "#f3e8ff",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										marginBottom: 14,
									}}
								>
									<Heart
										size={18}
										color="#8b5cf6"
										fill="#8b5cf6"
									/>
								</div>

								<div
									className="ggk-logo"
									style={{
										fontSize: 30,
										fontWeight: 800,
										lineHeight: 1,
										color: "#111",
									}}
								>
									{bookmarks.length}
								</div>

								<div
									style={{
										marginTop: 8,
										fontSize: 14,
										fontWeight: 700,
										color: "#333",
									}}
								>
									찜한 장소
								</div>

								<div
									style={{
										marginTop: 4,
										fontSize: 11,
										color: "#999",
									}}
								>
									저장한 장소 확인하기
								</div>
							</button>

							{/* 작성 댓글 */}
							<button
								onClick={() => setActiveSection("reviews")}
								style={{
									padding: "18px 16px",
									borderRadius: 22,
									border: "1px solid #e8eaed",
									background: "white",
									textAlign: "left",
									cursor: "pointer",
									boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
									transition: "all 0.18s ease",
								}}
							>
								<div
									style={{
										width: 42,
										height: 42,
										borderRadius: 14,
										background: "#f3e8ff",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										marginBottom: 14,
									}}
								>
									<MessageCircle
										size={18}
										color="#8b5cf6"
									/>
								</div>

								<div
									className="ggk-logo"
									style={{
										fontSize: 30,
										fontWeight: 800,
										lineHeight: 1,
										color: "#111",
									}}
								>
									{myReviews.length}
								</div>

								<div
									style={{
										marginTop: 8,
										fontSize: 14,
										fontWeight: 700,
										color: "#333",
									}}
								>
									작성한 댓글
								</div>

								<div
									style={{
										marginTop: 4,
										fontSize: 11,
										color: "#999",
									}}
								>
									내 활동 확인하기
								</div>
							</button>
						</div>
					</div>

					{/* ── 리스트 영역 (여기만 스크롤) */}
					<div
						style={{
							flex: 1,
							minHeight: 0,
							overflowY: "auto",
							padding: "0 14px 120px",
							scrollbarWidth: "thin",
						}}
					>
						{/* ── 찜한 장소 */}
						{activeSection === "bookmarks" && (
							<>
								{bookmarks.length === 0 ? (
									<div style={{ textAlign: "center", padding: "56px 0" }}>
										<div
											style={{
												width: 56,
												height: 56,
												borderRadius: 18,
												background: "#f0f2f5",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												margin: "0 auto 12px",
											}}
										>
											<Heart size={22} color="#d1d5db" />
										</div>

										<div
											style={{
												fontSize: 13,
												color: "#9ca3af",
												fontWeight: 700,
											}}
										>
											아직 찜한 장소가 없어요
										</div>
									</div>
								) : (
									bookmarks.map((place) => (
										<div
											key={place.id}
											style={{
												position: "relative",
												marginBottom: 12,
											}}
										>
											<div
												className="card-hover"
												onClick={() => router.push(`/place/${place.id}`)}
												style={{
													display: "flex",
													gap: 12,
													padding: 12,
													background: "white",
													borderRadius: 18,
													border: "1px solid #e8eaed",
													cursor: "pointer",
													boxShadow: "0 3px 10px rgba(0,0,0,0.05)",
												}}
											>
												<img
													src={place.image_url}
													alt={place.name}
													style={{
														width: 70,
														height: 70,
														borderRadius: 12,
														objectFit: "cover",
														flexShrink: 0,
													}}
												/>

												<div style={{ flex: 1, minWidth: 0 }}>
													<div
														className="ggk-logo"
														style={{
															fontWeight: 700,
															fontSize: 13,
															color: "#111",
															marginBottom: 4,
														}}
													>
														{place.name}
													</div>

													<div
														style={{
															fontSize: 11,
															color: "#666",
															marginBottom: 5,
															display: "flex",
															alignItems: "center",
															gap: 4,
														}}
													>
														{PET_ZONE_ICON(place.pet_zone)}
														{PET_ZONE_LABEL[place.pet_zone] ||
															place.pet_zone}
													</div>

													<div
														style={{
															fontSize: 10,
															color: "#aaa",
															display: "flex",
															alignItems: "center",
															gap: 3,
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
														}}
													>
														<MapPin size={10} />
														{place.address}
													</div>
												</div>
											</div>
										</div>
									))
								)}
							</>
						)}

						{/* ── 작성한 댓글 */}
						{activeSection === "reviews" && (
							<>
								{myReviews.length === 0 ? (
									<div style={{ textAlign: "center", padding: "56px 0" }}>
										<div
											style={{
												width: 56,
												height: 56,
												borderRadius: 18,
												background: "#f0f2f5",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												margin: "0 auto 12px",
											}}
										>
											<MessageCircle size={22} color="#d1d5db" />
										</div>

										<div
											style={{
												fontSize: 13,
												color: "#9ca3af",
												fontWeight: 700,
											}}
										>
											아직 작성한 댓글이 없어요
										</div>
									</div>
								) : (
									myReviews.map((review) => (
										<div
											key={review.id}
											style={{
												marginBottom: 12,
												padding: 14,
												background: "white",
												borderRadius: 18,
												border: "1px solid #e8eaed",
												boxShadow: "0 3px 10px rgba(0,0,0,0.05)",
											}}
										>
											<div
												onClick={() =>
													router.push(`/place/${review.place_id}`)
												}
												style={{
													display: "inline-flex",
													alignItems: "center",
													gap: 4,
													fontSize: 10,
													color: "#8b5cf6",
													fontWeight: 700,
													marginBottom: 8,
													cursor: "pointer",
													padding: "3px 8px",
													background: "#f3e8ff",
													borderRadius: 99,
												}}
											>
												<MapPin size={9} />
												{review.places?.name || "장소 보기"}
											</div>

											<div
												style={{
													fontSize: 12,
													color: "#333",
													lineHeight: 1.7,
													marginBottom: 8,
													whiteSpace: "pre-wrap",
													wordBreak: "break-word",
												}}
											>
												{review.content}
											</div>

											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
													alignItems: "center",
												}}
											>
												<span
													style={{
														fontSize: 10,
														color: "#bbb",
													}}
												>
													{formatDate(review.created_at)}
												</span>

												<span
													style={{
														fontSize: 10,
														color: "#bbb",
														display: "flex",
														alignItems: "center",
														gap: 3,
													}}
												>
													<Heart size={10} color="#ddd" />
													{review.likes || 0}
												</span>
											</div>
										</div>
									))
								)}
							</>
						)}
					</div>

          {/* ── 하단 푸터 */}
          <div style={{
            margin: "28px 14px 0",
            paddingTop: "16px",
            borderTop: "1px solid #e2e4e8",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
          }}>
            <div className="ggk-logo" style={{ fontSize: 11, color: "#bbb", fontWeight: 600, letterSpacing: "-0.1px" }}>
              같이가개
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {/* 개인정보 처리방침 버튼 */}
              <button
                onClick={() => setShowPrivacy(true)}
                className="ggk-body"
                style={{
                  background: "transparent", border: "none",
                  fontSize: 10, color: "#999", cursor: "pointer",
                  fontWeight: 500, padding: "2px 4px",
                  textDecoration: "underline", textUnderlineOffset: "2px",
                  fontFamily: "'Noto Sans KR',sans-serif",
                }}
              >
                개인정보 처리방침
              </button>
              <span style={{ fontSize: 10, color: "#ccc" }}>|</span>
              {/* 이메일 문의 버튼 */}
              <a
                href={`mailto:${ADMIN_EMAIL}?subject=[같이가개] 문의하기&body=안녕하세요, 문의 내용을 입력해주세요.`}
                className="ggk-body"
                style={{
                  background: "transparent", border: "none",
                  fontSize: 10, color: "#999", cursor: "pointer",
                  fontWeight: 500, padding: "2px 4px",
                  textDecoration: "underline", textUnderlineOffset: "2px",
                  display: "inline-flex", alignItems: "center", gap: "3px",
                  fontFamily: "'Noto Sans KR',sans-serif",
                  textDecorationColor: "#ccc",
                }}
              >
                <Mail size={10} color="#bbb" />
                이메일로 문의하기
              </a>
            </div>
            <div style={{ fontSize: 9, color: "#ccc", marginBottom: 4 }}>
              © 2026 같이가개. All rights reserved.
            </div>
          </div>

        </div>{/* /중앙 콘텐츠 */}

        {/* ── 우측 광고 바 */}
        <div style={{
          width: "160px",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          background: "#f0f1f3",
          borderLeft: "1px solid #e2e4e8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "20px 12px",
        }}>
          {/* 광고 슬롯 3 */}
          <div style={{
            width: "132px", height: "280px",
            background: "linear-gradient(160deg,#f8f9fb,#eef0f3)",
            borderRadius: "12px",
            border: "1.5px dashed #d0d3d9",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: "6px",
          }}>
            <div style={{ fontSize: "18px" }}>📢</div>
            <div style={{ fontSize: "10px", color: "#bbb", fontWeight: 600, textAlign: "center", lineHeight: 1.5 }}>
              광고 영역
            </div>
          </div>
          {/* 광고 슬롯 4 */}
          <div style={{
            width: "132px", height: "132px",
            background: "linear-gradient(160deg,#f8f9fb,#eef0f3)",
            borderRadius: "12px",
            border: "1.5px dashed #d0d3d9",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: "6px",
          }}>
            <div style={{ fontSize: "16px" }}>📣</div>
            <div style={{ fontSize: "10px", color: "#bbb", fontWeight: 600, textAlign: "center" }}>
              광고 영역
            </div>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════
          설정 모달
      ══════════════════════════════════════ */}
      {showSettings && (
        <>
          <div onClick={closeSettings} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, backdropFilter:"blur(4px)" }} />
          <div className="ggk-body" style={{
            position:"fixed", top:"50%", left:"50%",
            transform:"translate(-50%, -50%)",
            width:"min(400px, 92vw)", maxHeight:"85vh", overflowY:"auto",
            background:"white", borderRadius:"20px", zIndex:201,
            boxShadow:"0 20px 70px rgba(0,0,0,0.20)",
          }}>

            {/* 메뉴 */}
            {settingView === "menu" && (
              <>
                <div style={{ padding:"18px 18px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #f0f2f5" }}>
                  <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#111" }}>설정</div>
                  <button onClick={closeSettings} style={{ border:"none", background:"#f0f2f5", borderRadius:"50%", width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <X size={14} color="#666" />
                  </button>
                </div>

                <div style={{ margin:"12px 14px", padding:"12px 14px", background:"#f8fafc", borderRadius:12, display:"flex", alignItems:"center", gap:10, border:"1px solid #e8eaed" }}>
                  <div style={{ width:38, height:38, borderRadius:"50%", background: userProfile?.avatar_url ? "transparent" : getProfileColor(userProfile?.nickname||""), flexShrink:0, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800, color:"white" }}>
                    {userProfile?.avatar_url
                      ? <img src={userProfile.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={(e)=>{(e.target as HTMLImageElement).style.display="none"}} />
                      : userProfile?.nickname?.charAt(0)||"?"}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#111" }}>{userProfile?.nickname}</div>
                    <div style={{ fontSize:10, color:"#999" }}>{session?.user?.email}</div>
                  </div>
                </div>

                <div style={{ padding:"0 14px 18px" }}>
                  <button className="setting-row" onClick={() => setSettingView("nickname")} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"11px 10px", borderRadius:11, border:"none", background:"#f8fafc", cursor:"pointer", marginBottom:7, fontFamily:"'Noto Sans KR',sans-serif" }}>
                    <div style={{ width:32, height:32, borderRadius:9, background:"#eef2ff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <User size={15} color="#5C7CFA" />
                    </div>
                    <div style={{ flex:1, textAlign:"left", fontSize:13, fontWeight:600, color:"#222" }}>닉네임 변경</div>
                    <ChevronRight size={14} color="#bbb" />
                  </button>

                  {!isOAuthUser && (
                    <button className="setting-row" onClick={() => setSettingView("password")} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"11px 10px", borderRadius:11, border:"none", background:"#f8fafc", cursor:"pointer", marginBottom:7, fontFamily:"'Noto Sans KR',sans-serif" }}>
                      <div style={{ width:32, height:32, borderRadius:9, background:"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <Lock size={15} color="#22c55e" />
                      </div>
                      <div style={{ flex:1, textAlign:"left", fontSize:13, fontWeight:600, color:"#222" }}>비밀번호 변경</div>
                      <ChevronRight size={14} color="#bbb" />
                    </button>
                  )}

                  <button className="setting-row" onClick={() => { closeSettings(); setShowLogoutModal(true); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"11px 10px", borderRadius:11, border:"none", background:"#f8fafc", cursor:"pointer", marginBottom:7, fontFamily:"'Noto Sans KR',sans-serif" }}>
                    <div style={{ width:32, height:32, borderRadius:9, background:"#fffbeb", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <LogOut size={15} color="#f59e0b" />
                    </div>
                    <div style={{ flex:1, textAlign:"left", fontSize:13, fontWeight:600, color:"#222" }}>로그아웃</div>
                    <ChevronRight size={14} color="#bbb" />
                  </button>

                  <div style={{ height:1, background:"#f0f2f5", margin:"7px 0 10px" }} />

                  <button className="setting-row" onClick={() => setSettingView("withdraw")} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"11px 10px", borderRadius:11, border:"none", background:"#fff5f5", cursor:"pointer", fontFamily:"'Noto Sans KR',sans-serif" }}>
                    <div style={{ width:32, height:32, borderRadius:9, background:"white", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 1px 4px rgba(0,0,0,0.07)" }}>
                      <UserX size={15} color="#ef4444" />
                    </div>
                    <div style={{ flex:1, textAlign:"left", fontSize:13, fontWeight:600, color:"#ef4444" }}>회원 탈퇴</div>
                    <ChevronRight size={14} color="#fca5a5" />
                  </button>
                </div>
              </>
            )}

            {/* 닉네임 변경 */}
            {settingView === "nickname" && (
              <div style={{ padding:"18px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                  <div className="ggk-logo" style={{ fontSize:14, fontWeight:800, color:"#111" }}>닉네임 변경</div>
                  <button onClick={closeSettings} style={{ border:"none", background:"#f0f2f5", borderRadius:"50%", width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <X size={14} color="#666" />
                  </button>
                </div>
                <div style={{ fontSize:11, color:"#888", marginBottom:9 }}>현재 닉네임: <strong>{userProfile?.nickname}</strong></div>
                <div style={{ display:"flex", gap:7, marginBottom:5 }}>
                  <input placeholder="새 닉네임을 입력하세요" value={newNickname}
                    onChange={(e) => { setNewNickname(e.target.value); setNickMsg(null); setNickChecked(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCheckNickname(); }}
                    style={{ ...inp, marginBottom:0, flex:1 }}
                  />
                  <button onClick={handleCheckNickname} disabled={!newNickname.trim() || isCheckingNick} style={{ padding:"0 12px", borderRadius:9, border:"none", background: !newNickname.trim() || isCheckingNick ? "#d1d5db" : "#111", color:"white", fontWeight:700, fontSize:12, cursor: !newNickname.trim() || isCheckingNick ? "default" : "pointer", whiteSpace:"nowrap", flexShrink:0, fontFamily:"'Noto Sans KR',sans-serif" }}>
                    {isCheckingNick ? "확인 중..." : "중복 확인"}
                  </button>
                </div>
                {nickMsg && (
                  <div style={{ fontSize:11, color: nickMsg.ok ? "#22c55e" : "#ef4444", marginBottom:10, display:"flex", alignItems:"center", gap:3 }}>
                    {nickMsg.ok && <Check size={12}/>}{nickMsg.text}
                  </div>
                )}
                <button onClick={handleNicknameChange} disabled={!nickChecked || (nickMsg !== null && !nickMsg.ok)} style={{ width:"100%", padding:12, borderRadius:9, border:"none", background: !nickChecked || (nickMsg !== null && !nickMsg.ok) ? "#d1d5db" : "linear-gradient(145deg,#2a2a2a,#111)", color:"white", fontWeight:700, fontSize:13, cursor: !nickChecked || (nickMsg !== null && !nickMsg.ok) ? "default" : "pointer", fontFamily:"'Noto Sans KR',sans-serif" }}>
                  변경하기
                </button>
              </div>
            )}

            {/* 비밀번호 변경 */}
            {settingView === "password" && (
              <div style={{ padding:"18px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                  <div className="ggk-logo" style={{ fontSize:14, fontWeight:800, color:"#111" }}>비밀번호 변경</div>
                  <button onClick={closeSettings} style={{ border:"none", background:"#f0f2f5", borderRadius:"50%", width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <X size={14} color="#666" />
                  </button>
                </div>
                {[
                  { val: curPw, set: setCurPw, show: showCurPw, setShow: setShowCurPw, ph: "현재 비밀번호" },
                  { val: newPw, set: setNewPw, show: showNewPw, setShow: setShowNewPw, ph: "새 비밀번호 (영문 소문자 포함 6자 이상)" },
                  { val: newPw2, set: setNewPw2, show: showNewPw2, setShow: setShowNewPw2, ph: "새 비밀번호 확인" },
                ].map((f, i) => (
                  <div key={i} style={{ position:"relative", marginBottom:9 }}>
                    <input type={f.show ? "text" : "password"} placeholder={f.ph} value={f.val}
                      onChange={(e) => { f.set(e.target.value); setPwMsg(null); }}
                      style={{ ...inp, marginBottom:0, paddingRight:42 }}
                    />
                    <button onClick={() => f.setShow(!f.show)} style={{ position:"absolute", right:11, top:"50%", transform:"translateY(-50%)", border:"none", background:"transparent", cursor:"pointer", color:"#aaa", display:"flex" }}>
                      {f.show ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                ))}
                {pwMsg && (
                  <div style={{ fontSize:11, color: pwMsg.ok ? "#22c55e" : "#ef4444", marginBottom:10, display:"flex", alignItems:"center", gap:3 }}>
                    {pwMsg.ok && <Check size={12}/>}{pwMsg.text}
                  </div>
                )}
                <button onClick={handlePasswordChange} style={{ width:"100%", padding:12, borderRadius:9, border:"none", background:"linear-gradient(145deg,#2a2a2a,#111)", color:"white", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Noto Sans KR',sans-serif" }}>
                  변경하기
                </button>
              </div>
            )}

            {/* 회원 탈퇴 */}
            {settingView === "withdraw" && (
              <div style={{ padding:"18px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                  <div className="ggk-logo" style={{ fontSize:14, fontWeight:800, color:"#ef4444" }}>회원 탈퇴</div>
                  <button onClick={closeSettings} style={{ border:"none", background:"#f0f2f5", borderRadius:"50%", width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <X size={14} color="#666" />
                  </button>
                </div>
                <div style={{ padding:"12px 14px", background:"#fff5f5", borderRadius:11, border:"1px solid #fecaca", marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#dc2626", marginBottom:5, display:"flex", alignItems:"center", gap:4 }}>
                    <UserX size={13}/> 탈퇴 전 확인해주세요
                  </div>
                  <div style={{ fontSize:11, color:"#991b1b", lineHeight:1.7 }}>
                    • 모든 계정 정보가 삭제됩니다<br/>
                    • 작성한 댓글은 유지됩니다<br/>
                    • 탈퇴 후 복구가 불가능합니다
                  </div>
                </div>
                {!isOAuthUser && (
                  <input type="password" placeholder="비밀번호를 입력해 탈퇴를 확인하세요" value={withdrawPw}
                    onChange={(e) => { setWithdrawPw(e.target.value); setWithdrawMsg(null); }}
                    style={{ ...inp, marginBottom:9 }}
                  />
                )}
                {withdrawMsg && <div style={{ fontSize:11, color:"#ef4444", marginBottom:9 }}>{withdrawMsg.text}</div>}
                <button onClick={handleWithdraw} style={{ width:"100%", padding:12, borderRadius:9, border:"none", background:"#ef4444", color:"white", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Noto Sans KR',sans-serif" }}>
                  회원 탈퇴하기
                </button>
              </div>
            )}

          </div>
        </>
      )}

      {/* 로그아웃 확인 팝업 */}
      {showLogoutModal && (
        <>
          <div onClick={() => setShowLogoutModal(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, backdropFilter:"blur(4px)" }} />
          <div className="ggk-body" style={{
            position:"fixed", top:"50%", left:"50%",
            transform:"translate(-50%, -50%)",
            width:"min(300px, 88vw)", background:"white",
            borderRadius:"20px", zIndex:201,
            boxShadow:"0 20px 70px rgba(0,0,0,0.20)",
            padding:"24px 22px 20px",
          }}>
            <button onClick={() => setShowLogoutModal(false)} style={{ position:"absolute", top:14, right:14, border:"none", background:"#f0f2f5", borderRadius:"50%", width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <X size={14} color="#666" />
            </button>
            <div style={{ width:46, height:46, borderRadius:14, background:"#fffbeb", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 13px" }}>
              <LogOut size={21} color="#f59e0b" />
            </div>
            <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#111", textAlign:"center", marginBottom:7 }}>로그아웃</div>
            <div style={{ fontSize:12, color:"#888", textAlign:"center", marginBottom:20, lineHeight:1.6 }}>정말 로그아웃 하시겠습니까?</div>
            <div style={{ display:"flex", gap:7 }}>
              <button onClick={() => setShowLogoutModal(false)} style={{ flex:1, padding:"10px 0", borderRadius:9, border:"1px solid #e2e8f0", background:"white", color:"#555", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Noto Sans KR',sans-serif" }}>아니요</button>
              <button onClick={handleLogout} style={{ flex:1, padding:"10px 0", borderRadius:9, border:"none", background:"#f59e0b", color:"white", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Noto Sans KR',sans-serif" }}>로그아웃</button>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════
          개인정보 처리방침 모달
      ══════════════════════════════════════ */}
      {showPrivacy && (
        <>
          <div onClick={() => setShowPrivacy(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:300, backdropFilter:"blur(4px)" }} />
          <div className="ggk-body" style={{
            position:"fixed", top:"50%", left:"50%",
            transform:"translate(-50%, -50%)",
            width:"min(480px, 94vw)", maxHeight:"82vh", overflowY:"auto",
            background:"white", borderRadius:"20px", zIndex:301,
            boxShadow:"0 24px 80px rgba(0,0,0,0.22)",
          }}>
            {/* 모달 헤더 */}
            <div style={{ position:"sticky", top:0, background:"white", padding:"16px 18px 12px", borderBottom:"1px solid #f0f2f5", display:"flex", alignItems:"center", justifyContent:"space-between", zIndex:1 }}>
              <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#111" }}>개인정보 처리방침</div>
              <button onClick={() => setShowPrivacy(false)} style={{ border:"none", background:"#f0f2f5", borderRadius:"50%", width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <X size={14} color="#666" />
              </button>
            </div>

            {/* 본문 */}
            <div style={{ padding:"16px 18px 24px", fontSize:12, color:"#444", lineHeight:1.8 }}>
              <p style={{ fontSize:11, color:"#999", marginBottom:16 }}>최종 수정일: 2025년 1월 1일</p>

              <Section title="1. 개인정보의 수집 및 이용 목적">
                같이가개(이하 "서비스")는 다음의 목적으로 개인정보를 수집·이용합니다.<br/>
                • 회원 가입 및 관리: 회원 식별, 서비스 이용 관리<br/>
                • 서비스 제공: 장소 정보 제공, 댓글·찜 기능 운영<br/>
                • 고객 지원: 문의 응대 및 민원 처리
              </Section>

              <Section title="2. 수집하는 개인정보 항목">
                • <strong>필수 항목:</strong> 이메일 주소, 닉네임, 비밀번호(암호화 저장)<br/>
                • <strong>소셜 로그인 시:</strong> 소셜 계정 고유 식별자, 프로필 사진(선택)<br/>
                • <strong>서비스 이용 시 자동 수집:</strong> 서비스 이용 기록, 접속 로그
              </Section>

              <Section title="3. 개인정보의 보유 및 이용 기간">
                • 회원 탈퇴 시 즉시 삭제(단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관)<br/>
                • 전자상거래 기록: 5년 보관 (전자상거래 등에서의 소비자보호에 관한 법률)<br/>
                • 서비스 이용 관련 분쟁 시 분쟁 해결 시까지 보관
              </Section>

              <Section title="4. 개인정보의 제3자 제공">
                서비스는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.<br/>
                • 이용자가 사전에 동의한 경우<br/>
                • 법령의 규정에 의거하거나 수사 목적으로 관련 기관의 요구가 있는 경우
              </Section>

              <Section title="5. 개인정보 처리 위탁">
                서비스는 원활한 운영을 위해 아래와 같이 개인정보 처리를 위탁합니다.<br/>
                • <strong>Supabase Inc.:</strong> 데이터베이스 및 인증 서비스<br/>
                • <strong>Vercel Inc.:</strong> 서버 호스팅 및 배포
              </Section>

              <Section title="6. 이용자의 권리 및 행사 방법">
                이용자는 다음의 권리를 가집니다.<br/>
                • 개인정보 열람, 정정·삭제, 처리 정지 요청권<br/>
                • 위 권리 행사는 서비스 내 설정 메뉴 또는 이메일 문의를 통해 가능합니다.<br/>
                • 문의 이메일: <strong>{ADMIN_EMAIL}</strong>
              </Section>

              <Section title="7. 쿠키(Cookie) 운용">
                서비스는 로그인 상태 유지 등을 위해 쿠키를 사용합니다. 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 일부 서비스 이용이 제한될 수 있습니다.
              </Section>

              <Section title="8. 개인정보 보호 책임자">
                • <strong>책임자:</strong> 같이가개 운영팀<br/>
                • <strong>이메일:</strong> {ADMIN_EMAIL}<br/>
                개인정보 처리에 관한 문의, 불만 처리, 피해 구제 등에 관한 사항은 위 연락처로 문의해 주시기 바랍니다.
              </Section>

              <Section title="9. 개인정보 처리방침 변경">
                본 방침은 법령, 정책 또는 서비스 변경 사항을 반영하기 위해 수정될 수 있습니다. 변경 시 서비스 내 공지사항을 통해 사전 안내합니다.
              </Section>

              <div style={{ marginTop:16, padding:"12px 14px", background:"#f8f9fb", borderRadius:10, border:"1px solid #e8eaed" }}>
                <div style={{ fontSize:11, color:"#888", lineHeight:1.7 }}>
                  본 개인정보 처리방침은 <strong>2025년 1월 1일</strong>부터 적용됩니다.<br/>
                  문의사항이 있으시면 <strong>{ADMIN_EMAIL}</strong>로 연락해 주세요.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* 개인정보 처리방침 섹션 컴포넌트 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 5, fontFamily: "'Pretendard', sans-serif" }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: "#555", lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}