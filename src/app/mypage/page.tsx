"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  Heart, MessageCircle, ArrowLeft, LogOut, MapPin,
  Settings, X, ChevronRight, Trash2, PawPrint,
  Home, Trees, Building2, User, Lock, UserX, Check,
  Eye, EyeOff, BadgeCheck,
} from "lucide-react";
import { openPlaceDetail } from "@/lib/openPlace";
import PetIllustration from "@/components/illustrations/PetIllustration";
import SiteFooter from "@/components/SiteFooter";
import SideAdRail from "@/components/SideAdRail";

const BOARD_LABEL: Record<string, string> = {
  all: "전체",
  free: "자유게시판",
  seoul: "서울",
  gyeonggi: "경기",
  incheon: "인천",
  gangwon: "강원",
  chungbuk: "충북",
  daejeon: "대전",
  chungnam: "충남",
  gyeongbuk: "경북",
  daegu: "대구",
  ulsan: "울산",
  gyeongnam: "경남",
  busan: "부산",
  jeonbuk: "전북",
  jeonnam: "전남",
  gwangju: "광주",
  jeju: "제주",
};
const getBoardLabel = (id: string) => BOARD_LABEL[id] || id;

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
  const [myCommunityComments, setMyCommunityComments] = useState<any[]>([]); // 커뮤니티 댓글
  const [myReviewReplies, setMyReviewReplies] = useState<any[]>([]);

  const [showSettings, setShowSettings] = useState(false);
  const [settingView, setSettingView]   = useState<"menu"|"nickname"|"password"|"withdraw">("menu");
  const [bookmarkPage, setBookmarkPage] = useState(1);
  const [reviewPage, setReviewPage]     = useState(1);
  const PAGE_SIZE = 10;

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

  const loadData = async (sess: any) => {
    setBookmarks([]);
    setMyReviews([]);
    
    const uid = sess.user.id;

    const [
      { data: profile },
      { data: bookmarkReactions },
      { data: reviews },
      { data: reviewReplies },
      { data: communityComments },
    ] = await Promise.all([
      supabase.from("users").select("*").eq("auth_user_id", uid).single(),
      supabase.from("reactions")
        .select("place_id")
        .eq("user_key", uid)
        .eq("type", "bookmark"),
      supabase.from("reviews")
        .select("id, content, created_at, likes, place_id, places(name, address, image_url, category)")
        .eq("auth_user_id", uid)
        .eq("deleted", false)
        .eq("is_admin_deleted", false)
        .order("created_at", { ascending: false }),
      supabase.from("review_replies")
        .select("id, content, created_at, likes, review_id, reviews!inner(place_id, places(name, address, image_url, category))")
        .eq("auth_user_id", uid)
        .eq("deleted", false)
        .eq("is_admin_deleted", false)
        .order("created_at", { ascending: false }),
      supabase.from("community_comments")
        .select("id, content, created_at, likes, post_id, parent_id, community_posts(id, title, board_id)")
        .eq("author_auth_key", uid)   // ← auth_user_id → author_auth_key 로 변경
        .eq("deleted", false)
        .neq("is_admin_deleted", true)
        .order("created_at", { ascending: false }),
    ]);
    setUserProfile(profile);
    setMyReviews(reviews || []);
    setMyReviewReplies(reviewReplies || []);
    setMyCommunityComments(communityComments || []);

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

  const handleRemoveBookmark = async (placeId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("찜 목록에서 삭제하시겠습니까?")) return;
    await supabase.from("reactions").delete()
      .eq("place_id", placeId)
      .eq("type", "bookmark")
      .eq("user_key", session.user.id);
    setBookmarks(prev => prev.filter(p => p.id !== placeId));
    setDeletingBookmarkId(null);
  };

  const handleDeleteReview = async (reviewId: string) => {
    await supabase.from("reviews").update({ deleted: true }).eq("id", reviewId);
    setMyReviews(prev => prev.filter(r => r.id !== reviewId));
    setDeletingReviewId(null);
  };

  const handleDeleteReply = async (replyId: string) => {
    await supabase.from("review_replies").update({ deleted: true }).eq("id", replyId);
    setMyReviewReplies(prev => prev.filter(r => r.id !== replyId));
  };

  const handleDeleteCommunityComment = async (commentId: string) => {
    await supabase.from("community_comments").update({ deleted: true }).eq("id", commentId);
    setMyCommunityComments(prev => prev.filter(c => c.id !== commentId));
  };

  /* ── 작성한 댓글/답글 목록(장소+커뮤니티 통합)에서 항목 유형에 맞게 삭제 ── */
  const handleDeleteListItem = (item: any) => {
    if (!confirm("삭제하시겠습니까? 삭제한 내용은 복구할 수 없습니다.")) return;
    if (item._type === "place" && item._subtype === "comment") handleDeleteReview(item.id);
    else if (item._type === "place" && item._subtype === "reply") handleDeleteReply(item.id);
    else if (item._type === "community") handleDeleteCommunityComment(item.id);
  };

  const closeSettings = () => {
    setShowSettings(false); setSettingView("menu");
    setNickMsg(null); setPwMsg(null); setWithdrawMsg(null);
    setNewNickname(""); setCurPw(""); setNewPw(""); setNewPw2(""); setWithdrawPw("");
    setNickChecked(false);
  };

  const isOAuthUser = session?.user?.app_metadata?.provider !== "email";

  // 찜한 장소 페이지네이션
  const bookmarkTotalPages = Math.ceil(bookmarks.length / PAGE_SIZE);
  const pagedBookmarks = bookmarks.slice((bookmarkPage - 1) * PAGE_SIZE, bookmarkPage * PAGE_SIZE);

  // 댓글 페이지네이션 (장소+커뮤니티 합산)
  const allReviews = [
    ...myReviews.map(r => ({ ...r, _type: "place" as const, _subtype: "comment" as const })),
    ...myReviewReplies.map(r => ({
      ...r,
      _type: "place" as const,
      _subtype: "reply" as const,
      place_id: r.reviews?.place_id,
      places: r.reviews?.places,
    })),
    ...myCommunityComments.filter(c => !c.parent_id).map(c => ({ ...c, _type: "community" as const, _subtype: "comment" as const })),
    ...myCommunityComments.filter(c => !!c.parent_id).map(c => ({ ...c, _type: "community" as const, _subtype: "reply" as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const reviewTotalPages = Math.ceil(allReviews.length / PAGE_SIZE);
  const pagedReviews = allReviews.slice((reviewPage - 1) * PAGE_SIZE, reviewPage * PAGE_SIZE);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        .card-hover { transition: box-shadow 0.15s, transform 0.15s; }
        .card-hover:hover { box-shadow: 0 5px 16px rgba(0,0,0,0.09); transform: translateY(-1px); }
        .tab-btn { transition: all 0.15s ease; }
        .setting-row:hover { background: #f0f2f5 !important; }
      `}</style>

      {/* ── 전체 래퍼 — 광고는 더 이상 이 flex row 안에서 폭을 차지하지 않고, 커뮤니티
            페이지와 동일한 SideAdRail(고정 오버레이, 1600px 이상에서만 노출)을 재사용합니다. */}
      <div className="ggk-body" style={{ display:"flex", minHeight:"100vh", background: "#F7F3E8", justifyContent: "center", opacity: loading ? 0 : 1, transition: "opacity 0.2s ease", }}>

        {/* ── 중앙 콘텐츠 */}
        <div style={{
          width: "100%",
          maxWidth: "1200px",
          flexShrink: 0,
          height: "100vh",
          overflow: "hidden",
          background: "#F7F3E8",
          display: "flex",
          flexDirection: "column",
        }}>

          {/* ── 헤더 — 커뮤니티/관리자 페이지와 동일한 사이트형 상단바 구성 */}
          <div style={{
            background: "white", borderBottom: "1px solid #e8eaed",
            padding: "16px 28px", display: "flex", alignItems: "center",
            justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50,
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="ggk-logo" style={{ fontSize:"15px", fontWeight:800, color:"#111" }}>마이페이지</div>
            </div>
          </div>

          {/* ── 프로필 히어로 배너 — 시안 .mypage-hero 스펙: solid primary, full-bleed, no radius ── */}
					<div
						style={{
							position: "relative",
							overflow: "hidden",
							background: "#5C7A4A",
							padding: "26px 40px",
							flexShrink: 0,
						}}
					>
						<div
							style={{
								width: "100%",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: "18px",
								position: "relative",
							}}
						>
							{/* 좌측 */}
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "16px",
									minWidth: 0,
								}}
							>
								{/* 프로필 이미지 */}
								<div
									style={{
										width: "48px",
										height: "48px",
										borderRadius: "50%",
										overflow: "hidden",
										flexShrink: 0,
										background: userProfile?.avatar_url
											? "transparent"
											: "rgba(255,255,255,0.16)",
										border: "2px solid rgba(255,255,255,0.55)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										color: "white",
										fontSize: "17px",
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
											fontSize: "17px",
											fontWeight: 700,
											color: "white",
											marginBottom: "3px",
											display: "flex",
											alignItems: "center",
											gap: 5,
										}}
									>
										{userProfile?.owner_status === "verified" && (
											<BadgeCheck size={18} color="#8FA876" fill="white" title="인증된 사장님 계정" />
										)}
										{userProfile?.nickname}
									</div>

									<div
										style={{
											fontSize: "11px",
											color: "rgba(255,255,255,0.72)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											marginBottom: "3px",
										}}
									>
										{session?.user?.email}
									</div>

									{/* 카카오/구글 간편가입 회원 배지 — 일러스트 없이 텍스트 배지만 */}
									{(session?.user?.app_metadata?.provider === "kakao" || session?.user?.app_metadata?.provider === "google") && (
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												fontSize: "10px",
												fontWeight: 700,
												color: "white",
												background: session?.user?.app_metadata?.provider === "kakao" ? "rgba(254,229,0,0.28)" : "rgba(255,255,255,0.22)",
												border: "1px solid rgba(255,255,255,0.35)",
												borderRadius: "999px",
												padding: "3px 9px",
											}}
										>
											{session?.user?.app_metadata?.provider === "kakao" ? "카카오 계정 가입자" : "구글 계정 가입자"}
										</span>
									)}
								</div>
							</div>

							{/* 설정 버튼 */}
							<button
								onClick={() => setShowSettings(true)}
								style={{
									width: "32px",
									height: "32px",
									borderRadius: "50%",
									border: "1px solid rgba(255,255,255,0.4)",
									background: "rgba(255,255,255,0.14)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									cursor: "pointer",
									flexShrink: 0,
								}}
							>
								<Settings size={15} color="white" />
							</button>
						</div>
					</div>

          {/* ── 상단 카드 영역 */}
					<div style={{ flexShrink: 0 }}>
						{/* ── 통계 카드 */}
						<div
							style={{
								margin: "20px auto",
									maxWidth: "760px",
									padding: "0 28px",
									boxSizing: "border-box",
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 12,
							}}
						>
							{/* 찜한 장소 — 시안 .toggle-card 스펙: 아이콘 없이 중앙정렬, 선택 시 solid primary */}
              <button
                onClick={() => setActiveSection("bookmarks")}
                style={{
                  padding: 20,
                  borderRadius: 16,
                  border: activeSection === "bookmarks" ? "none" : "1px solid #e8eaed",
                  background: activeSection === "bookmarks" ? "#5C7A4A" : "white",
                  textAlign: "center",
                  cursor: "pointer",
                  boxShadow: activeSection === "bookmarks" ? "0 8px 20px rgba(92,122,74,0.28)" : "0 4px 14px rgba(0,0,0,0.06)",
                  transition: "all 0.18s ease",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: activeSection === "bookmarks" ? "rgba(255,255,255,0.85)" : "#999" }}>
                  찜한 장소
                </div>
                <div className="ggk-logo" style={{ fontSize: 24, fontWeight: 700, color: activeSection === "bookmarks" ? "white" : "#333", lineHeight: 1 }}>
                  {bookmarks.length}
                </div>
              </button>

              {/* 작성 댓글 */}
              <button
                onClick={() => setActiveSection("reviews")}
                style={{
                  padding: 20,
                  borderRadius: 16,
                  border: activeSection === "reviews" ? "none" : "1px solid #e8eaed",
                  background: activeSection === "reviews" ? "#5C7A4A" : "white",
                  textAlign: "center",
                  cursor: "pointer",
                  boxShadow: activeSection === "reviews" ? "0 8px 20px rgba(92,122,74,0.28)" : "0 4px 14px rgba(0,0,0,0.06)",
                  transition: "all 0.18s ease",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: activeSection === "reviews" ? "rgba(255,255,255,0.85)" : "#999" }}>
                  작성한 댓글
                </div>
                <div className="ggk-logo" style={{ fontSize: 24, fontWeight: 700, color: activeSection === "reviews" ? "white" : "#333", lineHeight: 1 }}>
                  {allReviews.length}
                </div>
              </button>
						</div>
					</div>

					{/* ── 리스트 영역 (여기만 스크롤) — 로그인 정보가 나오는 프로필 히어로 영역과
              동일한 폭(전체 컨테이너 폭, 40px 인셋)을 갖도록 확장했습니다. */}
          <div style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            width: "100%",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 40px 0",
            scrollbarWidth: "thin",
            boxSizing: "border-box",
          }}>
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
											<PetIllustration variant="empty" width={40} />
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
									<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
									{pagedBookmarks.map((place) => (
										<div
											key={place.id}
											style={{
												position: "relative",
											}}
										>
											<button
												onClick={(e) => handleRemoveBookmark(place.id, e)}
												title="찜 해제"
												style={{
													position: "absolute", top: 8, right: 8, zIndex: 2,
													width: 24, height: 24, borderRadius: "50%",
													border: "none", background: "rgba(255,255,255,0.92)",
													boxShadow: "0 1px 5px rgba(0,0,0,0.15)",
													cursor: "pointer", display: "flex",
													alignItems: "center", justifyContent: "center",
												}}
											>
												<Trash2 size={12} color="#f87171" />
											</button>
											<div
                        className="card-hover"
                        onClick={() => openPlaceDetail(router, place)}
                        style={{
                          width: "100%",
                          display: "flex",
                          gap: 12,
                          padding: 12,
                          background: "white",
                          borderRadius: 18,
                          border: "1px solid #e8eaed",
                          cursor: "pointer",
                          boxShadow: "0 3px 10px rgba(0,0,0,0.05)",
                          boxSizing: "border-box",
                        }}
                      >
												<img
													src={place.image_url}
													alt={place.name}
													loading="lazy"
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
									))}
									</div>
								)}
							</>
						)}
            <Pagination page={bookmarkPage} total={bookmarkTotalPages} onChange={p => { setBookmarkPage(p); }} />

						{/* ── 작성한 댓글 */}
            {activeSection === "reviews" && (
              <>
                {allReviews.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "56px 0" }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: 18, background: "#f0f2f5",
                      display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
                    }}>
                      <PetIllustration variant="empty" width={40} />
                    </div>
                    <div style={{ fontSize: 13, color: "#9ca3af", fontWeight: 700 }}>
                      아직 작성한 댓글이 없어요
                    </div>
                  </div>
                ) : (
                  <>
                    {pagedReviews.map((item) => (
                      <div key={`${item._type}-${item.id}`} style={{ marginBottom: 12 }}>

                        {/* ── 장소 댓글/답글 카드 (시안 A) */}
                        {item._type === "place" && (
                          <div style={{
                            background: "white", borderRadius: 18,
                            border: "1px solid #e8eaed", overflow: "hidden",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                          }}>
                            {/* 헤더 */}
                            <div
                              className="card-hover"
                              onClick={() => openPlaceDetail(router, { id: item.place_id, category: item.places?.category })}
                              style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "10px 14px", cursor: "pointer",
                                background: "#fafafa", borderBottom: "1px solid #f0f0f0",
                              }}
                            >
                              <div style={{
                                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                background: "#fff0e6", display: "flex", alignItems: "center", justifyContent: "center",
                                overflow: "hidden",
                              }}>
                                {item.places?.image_url
                                  ? <img src={item.places.image_url} alt={item.places?.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  : <MapPin size={16} color="#ea580c" />
                                }
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="ggk-logo" style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {item.places?.name || "장소 보기"}
                                </div>
                                <div style={{ fontSize: 10, color: "#aaa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {item.places?.address || ""}
                                </div>
                              </div>
                              <span style={{
                                flexShrink: 0, fontSize: 10, fontWeight: 700,
                                color: "#ea580c", background: item._subtype === "reply" ? "#fef9c3" : "#fff0e6",
                                borderRadius: 99, padding: "2px 8px",
                              }}>
                                {item._subtype === "reply" ? "장소 대댓글" : "장소 댓글"}
                              </span>
                            </div>
                            {/* 본문 */}
                            <div style={{ padding: "10px 14px 12px" }}>
                              <div style={{ fontSize: 12, color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 8 }}>
                                {item.content}
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 10, color: "#bbb" }}>{formatDate(item.created_at)}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 10, color: "#e11d48", display: "flex", alignItems: "center", gap: 3 }}>
                                    <Heart size={10} color="#e11d48" fill="#e11d48" />{item.likes || 0}
                                  </span>
                                  <button
                                    onClick={() => handleDeleteListItem(item)}
                                    title="삭제"
                                    style={{
                                      border: "none", background: "transparent", cursor: "pointer",
                                      padding: 2, display: "flex", alignItems: "center",
                                    }}
                                  >
                                    <Trash2 size={12} color="#d1d5db" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ── 커뮤니티 댓글/답글 카드 (시안 A) */}
                        {item._type === "community" && (
                          <div style={{
                            background: "white", borderRadius: 18,
                            border: "1px solid #e8eaed", overflow: "hidden",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                          }}>
                            {/* 헤더 */}
                            <div
                              className="card-hover"
                              onClick={() => router.push(`/community/post/${item.post_id}`)}
                              style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "10px 14px", cursor: "pointer",
                                background: "#fafafa", borderBottom: "1px solid #f0f0f0",
                              }}
                            >
                              <div style={{
                                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                <MessageCircle size={16} color="#2563eb" />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 10, color: "#5C7A4A", fontWeight: 700, marginBottom: 2 }}>
                                  {getBoardLabel(item.community_posts?.board_id)}
                                </div>
                                <div className="ggk-logo" style={{ fontSize: 12, fontWeight: 700, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {item.community_posts?.title || "게시글 보기"}
                                </div>
                              </div>
                              <span style={{
                                flexShrink: 0, fontSize: 10, fontWeight: 700,
                                color: "#2563eb", background: "#eff6ff",
                                borderRadius: 99, padding: "2px 8px",
                              }}>
                                {item._subtype === "reply" ? "커뮤니티 대댓글" : "커뮤니티 댓글"}
                              </span>
                            </div>
                            {/* 본문 */}
                            <div style={{ padding: "10px 14px 12px" }}>
                              <div style={{ fontSize: 12, color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 8 }}>
                                {item.content}
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 10, color: "#bbb" }}>{formatDate(item.created_at)}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 10, color: "#e11d48", display: "flex", alignItems: "center", gap: 3 }}>
                                    <Heart size={10} color="#e11d48" fill="#e11d48" />{item.likes || 0}
                                  </span>
                                  <button
                                    onClick={() => handleDeleteListItem(item)}
                                    title="삭제"
                                    style={{
                                      border: "none", background: "transparent", cursor: "pointer",
                                      padding: 2, display: "flex", alignItems: "center",
                                    }}
                                  >
                                    <Trash2 size={12} color="#d1d5db" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    ))}

                    {/* 페이지네이션 */}
                    <Pagination page={reviewPage} total={reviewTotalPages} onChange={(p) => setReviewPage(p)} />
                  </>
                )}
              </>
            )}
          </div>

          {/* ── 하단 푸터 — 리스트 영역 밖(스크롤 대상 아님)으로 빼서 항상 보이도록 고정하고,
                하단 탭바(플로팅 필, 약 78px)에 가려지지 않도록 그만큼 아래쪽 여백을 둡니다. */}
          <div style={{
            flexShrink: 0, background: "white", borderTop: "1px solid #eee",
            padding: "18px 40px calc(78px + 18px)", boxSizing: "border-box",
          }}>
            <SiteFooter />
          </div>
        </div>

      </div>

      {/* 광고는 콘텐츠 컬럼 안에서 폭을 차지하지 않고, 커뮤니티 페이지와 동일한
          SideAdRail(화면 좌우 고정, 1600px 이상에서만 노출)을 그대로 재사용합니다.
          rightMode="ad"라 오른쪽도 보호소 공고 대신 왼쪽과 같은 광고 자리입니다. */}
      <SideAdRail rightMode="ad" />

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
                    <div style={{ fontSize:13, fontWeight:700, color:"#111", display:"flex", alignItems:"center", gap:4 }}>
                      {userProfile?.owner_status === "verified" && <BadgeCheck size={13} color="#5C7A4A" />}
                      {userProfile?.nickname}
                    </div>
                    <div style={{ fontSize:10, color:"#999" }}>{session?.user?.email}</div>
                  </div>
                </div>

                <div style={{ padding:"0 14px 18px" }}>
                  {/* 사장님 계정(nickname_locked)은 [지역명]가게명_사장 형식이 고정되므로
                      닉네임 변경 메뉴 자체를 숨깁니다. */}
                  {!userProfile?.nickname_locked && (
                  <button className="setting-row" onClick={() => setSettingView("nickname")} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"11px 10px", borderRadius:11, border:"none", background:"#f8fafc", cursor:"pointer", marginBottom:7, fontFamily:"'Noto Sans KR',sans-serif" }}>
                    <div style={{ width:32, height:32, borderRadius:9, background:"#eef2ff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <User size={15} color="#5C7CFA" />
                    </div>
                    <div style={{ flex:1, textAlign:"left", fontSize:13, fontWeight:600, color:"#222" }}>닉네임 변경</div>
                    <ChevronRight size={14} color="#bbb" />
                  </button>
                  )}

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
                <button onClick={handleNicknameChange} disabled={!nickChecked || (nickMsg !== null && !nickMsg.ok)} style={{ width:"100%", padding:12, borderRadius:9, border:"none", background: !nickChecked || (nickMsg !== null && !nickMsg.ok) ? "#d1d5db" : "linear-gradient(145deg,#5C7A4A,#48603A)", color:"white", fontWeight:700, fontSize:13, cursor: !nickChecked || (nickMsg !== null && !nickMsg.ok) ? "default" : "pointer", fontFamily:"'Noto Sans KR',sans-serif" }}>
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
                <button onClick={handlePasswordChange} style={{ width:"100%", padding:12, borderRadius:9, border:"none", background:"linear-gradient(145deg,#5C7A4A,#48603A)", color:"white", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Noto Sans KR',sans-serif" }}>
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

    </>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      gap: 4, padding: "20px 0 8px",
    }}>
      {/* 이전 버튼 */}
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        style={{
          width: 34, height: 34, borderRadius: 12,
          border: "1px solid #ececf3",
          background: page === 1 ? "#f8fafc" : "white",
          cursor: page === 1 ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: page === 1 ? "#d1d5db" : "#555",
          fontSize: 16, fontWeight: 500,
          boxShadow: page === 1 ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
          transition: "all 0.15s ease",
        }}
      >‹</button>

      {/* 페이지 번호 */}
      {Array.from({ length: total }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            width: 34, height: 34, borderRadius: 12,
            border: p === page ? "1.5px solid #5C7A4A" : "1px solid #ececf3",
            background: p === page ? "#5C7A4A" : "white",
            color: p === page ? "white" : "#666",
            cursor: "pointer", fontSize: 13, fontWeight: p === page ? 700 : 500,
            boxShadow: p === page ? "0 2px 8px rgba(92,122,74,0.25)" : "0 1px 4px rgba(0,0,0,0.04)",
            transition: "all 0.15s ease",
          }}
        >{p}</button>
      ))}

      {/* 다음 버튼 */}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === total}
        style={{
          width: 34, height: 34, borderRadius: 12,
          border: "1px solid #ececf3",
          background: page === total ? "#f8fafc" : "white",
          cursor: page === total ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: page === total ? "#d1d5db" : "#555",
          fontSize: 16, fontWeight: 500,
          boxShadow: page === total ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
          transition: "all 0.15s ease",
        }}
      >›</button>
    </div>
  );
}