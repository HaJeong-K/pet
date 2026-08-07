"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { AdRailLeft, AdRailRight } from "@/components/SideAdRail";
import PetIllustration from "@/components/illustrations/PetIllustration";
import {
  ArrowLeft, MessageCircle, Heart, Eye,
  Pencil, Pin, LogIn, X, Search,
  Megaphone, MapPinned, ChevronDown, Check,
} from "lucide-react";

const FONT_STYLE = `
  * { box-sizing: border-box; }
  .post-card { transition: box-shadow 0.18s ease, transform 0.18s ease; }
  .post-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.10) !important; transform: translateY(-2px); }
  ::-webkit-scrollbar {
    width: 6px;
  }

  ::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 999px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }
`;

const BOARDS = [
  { id: "all", label: "전체" },
  { id: "free", label: "자유게시판" },
  { id: "business", label: "사장님 게시판" },
  { id: "seoul", label: "서울" },
  { id: "gyeonggi", label: "경기" },
  { id: "incheon", label: "인천" },
  { id: "gangwon", label: "강원" },
  { id: "chungbuk", label: "충북" },
  { id: "daejeon", label: "대전" },
  { id: "chungnam", label: "충남" },
  { id: "gyeongbuk", label: "경북" },
  { id: "daegu", label: "대구" },
  { id: "ulsan", label: "울산" },
  { id: "gyeongnam", label: "경남" },
  { id: "busan", label: "부산" },
  { id: "jeonbuk", label: "전북" },
  { id: "jeonnam", label: "전남" },
  { id: "gwangju", label: "광주" },
  { id: "jeju", label: "제주" },
];

// 지역 드롭다운 전용 목록 — "전체"/"자유게시판"/"사장님 게시판"은 지역이 아니므로
// 위치(index) 기반 slice 대신 id로 명시적으로 걸러냅니다. (배열 순서가 바뀌어도 안전)
const REGION_BOARDS = BOARDS.filter((b) => !["all", "free", "business"].includes(b.id));

// 말머리별 배지 색상 — 피드에서 게시글 성격을 한눈에 구분할 수 있도록
const POST_TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  "방문후기": { bg: "#eff6ff", color: "#2563eb" },
  "질문":     { bg: "#fef2f2", color: "#dc2626" },
  "정보공유": { bg: "#f0fdf4", color: "#16a34a" },
  "산책친구": { bg: "#fdece2", color: "#c2540c" },
  "업체소식": { bg: "#fffbeb", color: "#b45309" },
  __default:  { bg: "#f5f6f8", color: "#ff6b35" },
};

const profileColors = [
  "#FF6B6B","#F06595","#CC5DE8","#845EF7","#5C7CFA",
  "#339AF0","#22B8CF","#20C997","#51CF66","#94D82D",
  "#FCC419","#FF922B",
];

const getProfileColor = (nickname: string) => {
  if (!nickname) return "#999";

  const code = nickname
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);

  return profileColors[code % profileColors.length];
};

const formatDate = (s: string) => {
  if (!s) return "";

  const d = new Date(s);
  const now = new Date();

  const diff = now.getTime() - d.getTime();

  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);

  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  if (day < 7) return `${day}일 전`;

  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yy}.${mm}.${dd}`;
};

export default function CommunityPage() {
  const router = useRouter();

  const PAGE_SIZE = 15;
  const [activeBoard, setActiveBoard] = useState("all");
  const [notices, setNotices] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPostType, setSelectedPostType] = useState("all");
  const [showRegionMenu, setShowRegionMenu] = useState(false);

  // 300ms 디바운스
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const POST_TYPES = ["all", "방문후기", "질문", "정보공유", "산책친구"];
  const postTypeOptions = POST_TYPES;

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 공지글은 게시판/페이지가 바뀌어도 거의 안 바뀌므로 별도 useEffect로 분리 —
  // 매 페이지 전환마다 다시 불러올 필요 없이 게시판이 바뀔 때만 갱신합니다.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("community_posts")
      .select("id, title, nickname, created_at, board_id")
      .eq("is_notice", true)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!cancelled) setNotices(data || []);
      });
    return () => { cancelled = true; };
  }, [activeBoard]);

  // ⚠ 최적화: 예전엔 게시글을 최대 500건씩 통째로(제목·본문·이미지 URL 전부 포함)
  // 불러온 뒤 검색어/말머리/페이지를 전부 브라우저에서 배열 필터링·슬라이싱으로
  // 처리했습니다. 게시글이 쌓일수록 페이지를 열 때마다 불필요하게 무거워지는 구조라,
  // Supabase에 .range()로 "지금 보여줄 15건만", 검색은 .ilike()로 DB에서 직접
  // 걸러서 요청하도록 바꿨습니다 — 매번 필요한 만큼만 주고받습니다.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("community_posts")
          .select(`
            id, title, content, nickname, avatar_url,
            created_at, likes, comment_count, views,
            board_id, post_type, image_urls, deleted, is_admin_deleted
          `, { count: "exact" })
          .eq("is_notice", false)
          .eq("deleted", false)
          .eq("is_admin_deleted", false);

        if (activeBoard !== "all") {
          q = q.eq("board_id", activeBoard);
        }
        if (selectedPostType !== "all") {
          q = q.eq("post_type", selectedPostType);
        }

        const term = debouncedSearch.trim();
        if (term) {
          // ilike 와일드카드(%, _)와 .or() 필터 구분자(,())로 쓰이는 문자는
          // 검색어 안에 그대로 있으면 필터 문법이 깨지거나 의도와 다르게 매칭될 수
          // 있어 이스케이프/제거합니다.
          const escaped = term.replace(/[%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ");
          q = q.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`);
        }

        const from = (currentPage - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data: postData, count } = await q
          .order("created_at", { ascending: false })
          .range(from, to);

        // ── 댓글 수 실시간 보정 ──
        // community_posts.comment_count 컬럼은 예전에 댓글 작성/삭제 시 갱신되지
        // 않던 버그가 있어 값이 어긋나 있는 글이 많습니다. 저장된 컬럼을 그대로
        // 믿는 대신, 실제 community_comments 테이블에서 삭제되지 않은 댓글·답글
        // 개수를 직접 세어 덮어써서 화면에는 항상 정확한 값이 보이게 합니다.
        // (이제 페이지당 최대 15건만 대상이라 이 보정 쿼리도 훨씬 가벼워졌습니다.)
        let commentCountMap: Record<string, number> = {};
        if (postData && postData.length > 0) {
          const postIds = postData.map((p: any) => p.id);
          const { data: commentRows } = await supabase
            .from("community_comments")
            .select("post_id")
            .eq("deleted", false)
            .in("post_id", postIds);
          (commentRows || []).forEach((c: any) => {
            commentCountMap[c.post_id] = (commentCountMap[c.post_id] || 0) + 1;
          });
        }
        const postsWithLiveCounts = (postData || []).map((p: any) => ({
          ...p,
          comment_count: commentCountMap[p.id] ?? p.comment_count ?? 0,
        }));

        if (!cancelled) {
          setPosts(postsWithLiveCounts);
          setTotalCount(count ?? 0);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPosts([]);
          setTotalCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => { cancelled = true; };
  }, [activeBoard, currentPage, debouncedSearch, selectedPostType]);

  const getBoardLabel = (id: string) =>
    BOARDS.find((b) => b.id === id)?.label || id;

  return (
    <>
      <style>{FONT_STYLE}</style>

      {/* ── 전체 래퍼: grid로 [여백칼럼(1fr)] [본문(최대 1200px)] [여백칼럼(1fr)] 3단 구성 ──
          좌우 여백 칼럼은 항상 폭이 완전히 동일하므로 본문은 항상 화면 정중앙에 옵니다.
          레일은 각 여백 칼럼 "안에서" justifySelf:center로 그 여백 폭의 정가운데에 옵니다. */}
      <div
        className="ggk-body"
        style={{
          minHeight: "100vh",
          background: "#F7F3E8",
          display: "grid",
          gridTemplateColumns: "1fr min(1200px, 100%) 1fr",
          columnGap: "16px",
        }}
      >
        <AdRailLeft />

        <div
          style={{
            minWidth: 0,
            width: "100%",

            display: "flex",
            flexDirection: "column",

            height: "100vh",

            background: "#F7F3E8",

            overflow: "hidden",

            scrollbarWidth: "thin",
          }}
        >
          {/* ── 웰컴 배너 — 페이지 최상단. 시안 .hero 스펙: solid primary, full-bleed, no radius ── */}
          <div style={{
            position: "relative", overflow: "hidden",
            background: "#5C7A4A",
            padding: "24px 40px", display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 10,
          }}>
            <div>
              <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 700, color: "white", marginBottom: 5 }}>
                반려인들의 이야기
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.88)" }}>
                산책 친구부터 방문 후기까지, 자유롭게 나눠보세요
              </div>
            </div>
          </div>

          {/* 게시판 탭: 전체/자유게시판은 바로 노출, 17개 지역은 드롭다운으로 정리해
              한 화면에 다 펼쳐놓았을 때 생기던 시각적 잡음을 줄였습니다. */}
          <div
            style={{
              background: "white",
              borderBottom: "1px solid #eee",
              padding: "12px 28px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {[{ id: "all", label: "전체" }, { id: "free", label: "자유게시판" }].map((board) => (
              <button
                key={board.id}
                onClick={() => {
                  setActiveBoard(board.id);
                  setCurrentPage(1);
                  setSearchQuery("");
                  setSelectedPostType("all");
                }}
                style={{
                  border: activeBoard === board.id ? "none" : "1px solid rgba(0,0,0,0.08)",
                  borderRadius: "10px",
                  padding: "8px 16px",
                  background: activeBoard === board.id ? "#5C7A4A" : "#fff",
                  color: activeBoard === board.id ? "white" : "#555",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {board.label}
              </button>
            ))}

            {/* 사장님(사업자) 게시판 — 반려동물 관련 업체가 소식·이벤트를 올리는 전용 공간.
                일반 지역 게시판과 성격이 달라 눈에 띄는 톤(앰버)으로 구분합니다. */}
            <button
              onClick={() => {
                setActiveBoard("business");
                setCurrentPage(1);
                setSearchQuery("");
                setSelectedPostType("all");
              }}
              style={{
                border: "none",
                borderRadius: "10px",
                padding: "8px 16px",
                background: activeBoard === "business" ? "linear-gradient(145deg, #d97706, #b45309)" : "#fef3c7",
                color: activeBoard === "business" ? "white" : "#92400e",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              사장님
            </button>

            {/* 지역 게시판 선택 — 커스텀 드롭다운 (네이티브 select의 기본 브라우저 스타일을 걷어내고
                앱 톤에 맞춘 팝오버로 교체). 다른 버튼들처럼 내용만큼만 폭을 차지하도록
                flex:1/width:100% 를 제거하고, 남는 영역은 그냥 빈 공간으로 둡니다. */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => setShowRegionMenu((v) => !v)}
                className="ggk-body"
                style={{
                  borderRadius: "10px",
                  padding: "8px 16px",
                  background: REGION_BOARDS.some((b) => b.id === activeBoard) ? "#5C7A4A" : "#fff",
                  color: REGION_BOARDS.some((b) => b.id === activeBoard) ? "white" : "#555",
                  border: REGION_BOARDS.some((b) => b.id === activeBoard) ? "none" : "1px solid rgba(0,0,0,0.08)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}
              >
                <MapPinned size={12} />
                {REGION_BOARDS.some((b) => b.id === activeBoard) ? getBoardLabel(activeBoard) : "지역 게시판"}
                <ChevronDown size={12} style={{ transform: showRegionMenu ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
              </button>

              {showRegionMenu && (
                <>
                  <div onClick={() => setShowRegionMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
                  <div
                    className="ggk-body"
                    style={{
                      position: "absolute", top: "calc(100% + 6px)", right: 0,
                      width: "220px", maxHeight: "320px", overflowY: "auto",
                      background: "white", borderRadius: "16px", zIndex: 60,
                      border: "1px solid #eee",
                      boxShadow: "0 10px 32px rgba(0,0,0,0.14)",
                      padding: "6px",
                    }}
                  >
                    {REGION_BOARDS.map((board) => {
                      const isActive = activeBoard === board.id;
                      return (
                        <button
                          key={board.id}
                          onClick={() => {
                            setActiveBoard(board.id);
                            setCurrentPage(1);
                            setSearchQuery("");
                            setSelectedPostType("all");
                            setShowRegionMenu(false);
                          }}
                          style={{
                            width: "100%", textAlign: "left",
                            padding: "9px 10px", borderRadius: "10px", border: "none",
                            background: isActive ? "#E4EBDC" : "transparent",
                            color: isActive ? "#48603A" : "#333",
                            fontSize: "12px", fontWeight: isActive ? 700 : 500,
                            cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            fontFamily: "'Noto Sans KR', sans-serif",
                          }}
                        >
                          {board.label}
                          {isActive && <Check size={12} color="#5C7A4A" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 글쓰기 버튼 — 게시판 분류 행 가장 우측에 고정 */}
            <button
              onClick={() => {
                if (!session) {
                  router.push("/login?redirect=/community");
                  return;
                }
                router.push(`/community/write?board=${activeBoard}`);
              }}
              style={{
                marginLeft: "auto",
                flexShrink: 0,
                height: 34,
                padding: "0 12px",
                borderRadius: "999px",
                border: "none",
                background: "linear-gradient(145deg, #5C7A4A, #48603A)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                cursor: "pointer",
                color: "white",
                fontSize: "11px",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              <Pencil size={14} />
              글쓰기
            </button>
          </div>

          {/* 현재 선택된 지역 게시판 표시 (지역 선택 시에만) */}
          {REGION_BOARDS.some((b) => b.id === activeBoard) && (
            <div style={{
              background: "#F7F3E8", borderBottom: "1px solid #D9E4CE",
              padding: "8px 28px", fontSize: 11, fontWeight: 700, color: "#48603A",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <MapPinned size={11} color="#5C7A4A" />
              {getBoardLabel(activeBoard)} 게시판 보는 중
            </div>
          )}

          {/* 사장님 게시판 안내 — 반려인도 자유롭게 읽되, 글 작성은 사업자 소식 위주임을 안내 */}
          {activeBoard === "business" && (
            <div style={{
              background: "#fffbeb", borderBottom: "1px solid #fde68a",
              padding: "8px 28px", fontSize: 11, fontWeight: 700, color: "#92400e",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              사장님 게시판 — 반려동물 관련 업체의 소식·이벤트를 만나보세요
            </div>
          )}

          {/* 검색창 + 말머리 필터 */}
          <div
            style={{
              background: "#f8f9fb",
              borderBottom: "1px solid #e8eaed",
              padding: "10px 28px",
              display: "flex",
              flexDirection: "column",
              gap: "7px",
            }}
          >
            {/* 텍스트 검색 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                background: "white",
                borderRadius: "10px",
                padding: "7px 13px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <Search size={13} color="#c0c4cc" style={{ flexShrink: 0 }} />
              <input
                placeholder="제목 또는 내용 검색"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  fontSize: "12px",
                  background: "transparent",
                  fontFamily: "'Noto Sans KR', sans-serif",
                  color: "#111",
                  minWidth: 0,
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}
                >
                  <X size={12} color="#c0c4cc" />
                </button>
              )}
            </div>

            {/* 말머리 필터 버튼 — posts에 말머리가 하나라도 있을 때만 표시 */}
            {postTypeOptions.length > 1 && (
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                {postTypeOptions.map((type) => (
                  <button
                    key={type}
                    onClick={() => { setSelectedPostType(type); setCurrentPage(1); }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "'Noto Sans KR', sans-serif",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s ease",
                      background: selectedPostType === type
                        ? "linear-gradient(145deg, #5C7A4A, #48603A)"
                        : "white",
                      color: selectedPostType === type ? "white" : "#555",
                      boxShadow: selectedPostType === type
                        ? "0 1px 5px rgba(0,0,0,0.2)"
                        : "0 1px 3px rgba(0,0,0,0.07)",
                      border: selectedPostType === type
                        ? "none"
                        : "1px solid #e2e8f0",
                    }}
                  >
                    {type === "all" ? "전체" : `[${type}]`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!session && (
            <div
              style={{
                margin: "10px 28px 0",

                padding: "10px 14px",

                background: "white",

                borderRadius: "12px",

                border: "1px solid #e8eaed",

                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",

                gap: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "#555",
                }}
              >
                로그인하면 직접 글을 작성할 수 있어요
              </div>

              <button
                onClick={() =>
                  router.push(
                    "/login?redirect=/community"
                  )
                }
                style={{
                  flexShrink: 0,

                  display: "flex",
                  alignItems: "center",

                  gap: "4px",

                  padding: "6px 12px",

                  borderRadius: "8px",

                  border: "none",

                  background:
                    "linear-gradient(145deg, #5C7A4A, #48603A)",

                  color: "white",

                  fontSize: "11px",

                  fontWeight: 700,

                  cursor: "pointer",
                }}
              >
                <LogIn size={11} />
                로그인
              </button>
            </div>
          )}

          {/* 게시글 목록 — 시안(design_palette_preview.html)의 .layout 구성처럼
              메인 피드(main-col)와 광고 사이드바(side-col)를 한 컨테이너 안에서
              나란히 배치합니다 (기존엔 컨테이너 바깥 좌우에 별도 광고바가 있었습니다). */}
          <div
            style={{
              flex: 1,
              padding: "16px 28px 0px",
              overflowY: "auto",
              overflowX: "hidden",
              scrollbarWidth: "thin",
              display: "flex",
              gap: "24px",
              alignItems: "flex-start",
            }}
          >
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 0",
                  color: "#bbb",
                  fontSize: "12px",
                }}
              >
                불러오는 중...
              </div>
            ) : (
              <>
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
                  return (
                    <>
                      {posts.length === 0 && debouncedSearch.trim() && (
                        <div style={{ textAlign: "center", padding: "40px 0 60px", color: "#bbb", fontSize: "12px" }}>
                          <div style={{ marginTop: 8 }}>
                            "{debouncedSearch}"에 대한 검색 결과가 없습니다.
                          </div>
                        </div>
                      )}
                      {posts.map((post) => {
                        const isBusiness = post.board_id === "business";
                        const typeStyle = POST_TYPE_STYLE[post.post_type as string] || POST_TYPE_STYLE.__default;
                        const thumb = Array.isArray(post.image_urls) && post.image_urls.length > 0 ? post.image_urls[0] : null;
                        const extraImages = Array.isArray(post.image_urls) ? post.image_urls.length - 1 : 0;
                        return (
                          <div
                            key={post.id}
                            className="post-card"
                            onClick={() => router.push(`/community/post/${post.id}`)}
                            style={{
                              background: isBusiness ? "#fffdf7" : "white",
                              borderRadius: "16px",
                              padding: "20px 22px",
                              marginBottom: "14px",
                              border: isBusiness ? "1px solid #fde68a" : "1px solid rgba(0,0,0,0.06)",
                              borderLeft: isBusiness ? "3px solid #d97706" : "1px solid rgba(0,0,0,0.06)",
                              cursor: "pointer",
                              display: "flex",
                              gap: 14,
                            }}
                          >
                            {/* 아바타 — 시안처럼 개인별 색이 아닌 팔레트 고정 톤 */}
                            <div
                              style={{
                                width: 40, height: 40, borderRadius: "50%",
                                background: "#E4EBDC",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 14, fontWeight: 700, color: "#5C7A4A", overflow: "hidden", flexShrink: 0,
                              }}
                            >
                              {post.avatar_url ? (
                                <img src={post.avatar_url} alt={post.nickname} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                (post.nickname || "?").charAt(0)
                              )}
                            </div>

                            {/* 콘텐츠 컬럼 — 아바타와 같은 레벨의 flex row, 내부는 다시
                                텍스트(좌)/썸네일(우)로 나뉩니다 (이미지가 있으면 우측에 배치) */}
                            <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 14 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {/* 메타: 닉네임·배지·시간 한 줄 */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6, fontSize: 12, color: "#999" }}>
                                  <span style={{ fontWeight: 700, color: "#222" }}>{post.nickname}</span>
                                  {isBusiness && (
                                    <span style={{ fontSize: 9, fontWeight: 800, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 999 }}>
                                      사장님
                                    </span>
                                  )}
                                  {(activeBoard === "all" || isBusiness) && post.board_id && post.board_id !== "all" && !isBusiness && (
                                    <span style={{ fontSize: 10, fontWeight: 700, background: "#f5f6f8", color: "#555", padding: "1px 8px", borderRadius: 999 }}>
                                      {getBoardLabel(post.board_id)}
                                    </span>
                                  )}
                                  <span>· {formatDate(post.created_at)}</span>
                                </div>

                                {/* 제목 + 말머리 */}
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
                                  {post.post_type && (
                                    <span style={{ fontSize: 10, fontWeight: 800, color: typeStyle.color, background: typeStyle.bg, padding: "2px 7px", borderRadius: 6, flexShrink: 0, marginTop: 1 }}>
                                      {post.post_type}
                                    </span>
                                  )}
                                  <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 700, color: "#111", lineHeight: 1.4 }}>
                                    {post.title}
                                  </div>
                                </div>

                                {/* 내용 */}
                                {post.content && (
                                  <div
                                    style={{
                                      fontSize: 13, color: "#777", lineHeight: 1.6,
                                      overflow: "hidden", display: "-webkit-box",
                                      WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                                      marginBottom: 12,
                                    }}
                                  >
                                    {post.content}
                                  </div>
                                )}

                                {/* 통계 — 시안처럼 구분선 없이 */}
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#999", fontWeight: 600 }}>
                                    <Heart size={12} color="#ff8787" />
                                    {post.likes || 0}
                                  </span>
                                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#999", fontWeight: 600 }}>
                                    <MessageCircle size={12} color="#a9805a" />
                                    {post.comment_count || 0}
                                  </span>
                                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#999", fontWeight: 600 }}>
                                    <Eye size={12} color="#bbb" />
                                    {post.views || 0}
                                  </span>
                                </div>
                              </div>

                              {/* 썸네일 — 게시글 출력 범위의 우측에 배치 */}
                              {thumb && (
                                <div style={{ position: "relative", width: 104, height: 104, borderRadius: 13, overflow: "hidden", background: "#f7f8fa", flexShrink: 0 }}>
                                  <img src={thumb} alt="thumbnail" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  {extraImages > 0 && (
                                    <div style={{ position: "absolute", right: 6, bottom: 6, background: "rgba(0,0,0,0.6)", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999 }}>
                                      +{extraImages}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* 페이지네이션 */}
                      {totalPages > 1 && (
                        <div style={{
                          display: "flex", justifyContent: "center", alignItems: "center",
                          gap: 4, padding: "20px 0 8px",
                        }}>
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            style={{
                              width: 34, height: 34, borderRadius: 12,
                              border: "1px solid #e2e8f0",
                              background: currentPage === 1 ? "#f8fafc" : "white",
                              cursor: currentPage === 1 ? "default" : "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: currentPage === 1 ? "#d1d5db" : "#555",
                              fontSize: 16, fontWeight: 500,
                              boxShadow: currentPage === 1 ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
                            }}
                          >‹</button>

                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                            <button
                              key={p}
                              onClick={() => setCurrentPage(p)}
                              style={{
                                width: 34, height: 34, borderRadius: 12,
                                border: p === currentPage ? "1.5px solid #555" : "1px solid #e2e8f0",
                                background: p === currentPage ? "#444" : "white",
                                color: p === currentPage ? "white" : "#666",
                                cursor: "pointer", fontSize: 13,
                                fontWeight: p === currentPage ? 700 : 500,
                                boxShadow: p === currentPage ? "0 2px 8px rgba(0,0,0,0.18)" : "0 1px 4px rgba(0,0,0,0.04)",
                                transition: "all 0.15s ease",
                              }}
                            >{p}</button>
                          ))}

                          <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            style={{
                              width: 34, height: 34, borderRadius: 12,
                              border: "1px solid #e2e8f0",
                              background: currentPage === totalPages ? "#f8fafc" : "white",
                              cursor: currentPage === totalPages ? "default" : "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: currentPage === totalPages ? "#d1d5db" : "#555",
                              fontSize: 16, fontWeight: 500,
                              boxShadow: currentPage === totalPages ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
                            }}
                          >›</button>
                        </div>
                      )}
                    </>
                  );
                })()}

              </>
            )}
          </div>
          </div>

          {/* ── 하단 푸터 — 리스트 스크롤 영역 밖(flexShrink:0)으로 빼서, 게시글이 하나도
              없어 리스트가 짧을 때도 마이페이지와 똑같이 항상 탭바 바로 위에 고정되도록
              합니다. 배경은 흰 카드가 아니라 페이지 배경(#F7F3E8)과 동일하게 맞춰서 흰
              박스로 튀지 않게 했습니다. */}
          <div style={{
            flexShrink: 0, background: "#F7F3E8", borderTop: "1px solid #e5ded0",
            padding: "18px 28px calc(78px + 18px)", boxSizing: "border-box",
          }}>
            <SiteFooter />
          </div>
        </div>

        {/* 우측 레일 — 보호소 공고 카드. 화면 비율이 1:1 이상일 때만 오른쪽 여백 칼럼의
            정가운데에 표시됩니다. */}
        <AdRailRight rightMode="shelter" />
      </div>
    </>
  );
}