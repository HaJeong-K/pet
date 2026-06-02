"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, MessageCircle, Heart, Eye,
  Pencil, Pin, LogIn, X, Search,
} from "lucide-react";

const FONT_STYLE = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  .ggk-logo { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
  .ggk-body  { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }
  .post-card { transition: box-shadow 0.14s ease; }
  .post-card:hover { box-shadow: 0 3px 14px rgba(0,0,0,0.09) !important; }
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

const ADMIN_EMAIL = "infoker12@naver.com";

const BOARDS = [
  { id: "all", label: "전체" },
  { id: "free", label: "자유게시판" },
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
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPostType, setSelectedPostType] = useState("all");

  // 300ms 디바운스
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 검색어로 필터링된 게시글
  const POST_TYPES = ["all", "방문후기", "질문", "정보공유", "산책친구"];

  // 말머리 + 검색어 동시 필터링
  const filteredPosts = posts.filter((p) => {
    if (selectedPostType !== "all" && p.post_type !== selectedPostType) return false;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      return (
        p.title?.toLowerCase().includes(q) ||
        p.content?.toLowerCase().includes(q)
      );
    }
    return true;
  });

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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data: noticeData } = await supabase
          .from("community_posts")
          .select("id, title, nickname, created_at, board_id")
          .eq("is_notice", true)
          .order("created_at", { ascending: false })
          .limit(5);

        let q = supabase
          .from("community_posts")
          .select(`
            id, title, content, nickname, avatar_url,
            created_at, likes, comment_count, views,
            board_id, post_type, image_urls, deleted, is_admin_deleted
          `)
          .eq("is_notice", false)
          .eq("deleted", false)
          .eq("is_admin_deleted", false)
          .order("created_at", { ascending: false })
          .limit(500);

        if (activeBoard !== "all") {
          q = q.eq("board_id", activeBoard);
        }

        const { data: postData } = await q;

        if (!cancelled) {
          setNotices(noticeData || []);
          setPosts(postData || []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPosts([]);
          setNotices([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => { cancelled = true; };
  }, [activeBoard]);

  const getBoardLabel = (id: string) =>
    BOARDS.find((b) => b.id === id)?.label || id;

  return (
    <>
      <style>{FONT_STYLE}</style>

      <div
        className="ggk-body"
        style={{
          minHeight: "100vh",
          background: "#f0f2f5",
          display: "flex",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "680px",
            margin: "0 auto",

            display: "flex",
            flexDirection: "column",

            height: "100vh",

            background: "#f0f2f5",

            overflow: "hidden",

            scrollbarWidth: "thin",
          }}
        >
          {/* 헤더 */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 50,

              background: "white",

              borderBottom: "1px solid #e8eaed",

              padding: "12px 18px",

              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",

              boxShadow:
                "0 1px 6px rgba(0,0,0,0.05)",
            }}
          >
            <button
              onClick={() => router.push("/")}
              style={{
                border: "none",
                background: "transparent",

                cursor: "pointer",

                padding: 3,

                borderRadius: 7,

                display: "flex",
              }}
            >
              <ArrowLeft
                size={18}
                color="#444"
              />
            </button>

            <div
              className="ggk-logo"
              style={{
                fontSize: "14px",
                fontWeight: 800,
                color: "#111",
              }}
            >
              커뮤니티
            </div>

            {/* 글쓰기 버튼 이동 완료 */}
            <button
              onClick={() => {
                if (!session) {
                  router.push(
                    "/login?redirect=/community"
                  );

                  return;
                }

                router.push(
                  `/community/write?board=${activeBoard}`
                );
              }}
              style={{
                height: 34,

                padding: "0 12px",

                borderRadius: "999px",

                border: "none",

                background:
                  "linear-gradient(145deg, #2a2a2a, #111)",

                display: "flex",
                alignItems: "center",
                justifyContent: "center",

                gap: "5px",

                cursor: "pointer",

                color: "white",

                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              <Pencil size={14} />
              글쓰기
            </button>
          </div>

          {/* 게시판 탭 */}
          <div
            style={{
              background: "white",

              borderBottom: "1px solid #eee",

              padding: "8px 14px 10px",

              display: "flex",

              flexWrap: "wrap",

              gap: "6px",
            }}
          >
            {BOARDS.map((board) => (
              <button
                key={board.id}
                onClick={() => {
                  setActiveBoard(board.id);
                  setCurrentPage(1);
                  setSearchQuery("");
                  setSelectedPostType("all");
                }}
                style={{
                  border: "none",

                  borderRadius: "999px",

                  padding: "7px 8px",

                  background:
                    activeBoard === board.id
                      ? "linear-gradient(145deg, #2a2a2a, #111)"
                      : "#f5f6f8",

                  color:
                    activeBoard === board.id
                      ? "white"
                      : "#555",

                  fontSize: "11px",

                  fontWeight: 700,

                  cursor: "pointer",

                  whiteSpace: "nowrap",
                }}
              >
                {board.label}
              </button>
            ))}
          </div>

          {/* 검색창 + 말머리 필터 */}
          <div
            style={{
              background: "#f8f9fb",
              borderBottom: "1px solid #e8eaed",
              padding: "8px 14px",
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
                      border: "none",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "'Noto Sans KR', sans-serif",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s ease",
                      background: selectedPostType === type
                        ? "linear-gradient(145deg, #2a2a2a, #111)"
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
                margin: "10px 14px 0",

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
                    "linear-gradient(145deg, #2a2a2a, #111)",

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

          {/* 게시글 목록 */}
          <div
            style={{
              flex: 1,
              padding: "10px 14px 0px",
              overflowY: "auto",
              overflowX: "hidden",
              scrollbarWidth: "thin",
            }}
          >
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
                  const totalPages = Math.ceil(filteredPosts.length / PAGE_SIZE);
                  const pagedPosts = filteredPosts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
                  return (
                    <>
                      {filteredPosts.length === 0 && debouncedSearch.trim() && (
                        <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb", fontSize: "12px" }}>
                          "{debouncedSearch}"에 대한 검색 결과가 없습니다.
                        </div>
                      )}
                      {pagedPosts.map((post) => (
                  <div
                    key={post.id}
                    className="post-card"
                    onClick={() =>
                      router.push(
                        `/community/post/${post.id}`
                      )
                    }
                    style={{
                      background: "white",
                      borderRadius: "12px",
                      padding: "11px 13px",
                      marginBottom: "5px",
                      border:
                        "1px solid #e8eaed",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        gap: "10px",
                      }}
                    >
                      {/* 좌측 */}
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {/* 제목 */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            marginBottom: "5px",
                            minWidth: 0,
                          }}
                        >
                          {activeBoard === "all" &&
                            post.board_id &&
                            post.board_id !==
                              "all" && (
                              <span
                                style={{
                                  fontSize:
                                    "10px",
                                  fontWeight: 700,
                                  background:
                                    "#f5f6f8",
                                  color: "#555",
                                  padding:
                                    "2px 7px",
                                  borderRadius:
                                    "999px",
                                  flexShrink: 0,
                                }}
                              >
                                {getBoardLabel(
                                  post.board_id
                                )}
                              </span>
                            )}

                          {post.post_type && (
                            <span
                              style={{
                                fontSize:
                                  "10px",
                                fontWeight: 700,
                                color: "#ff6b35",
                                flexShrink: 0,
                              }}
                            >
                              [{post.post_type}]
                            </span>
                          )}

                          <div
                            className="ggk-logo"
                            style={{
                              fontSize:
                                "13px",
                              fontWeight: 700,
                              color: "#111",
                              overflow:
                                "hidden",
                              textOverflow:
                                "ellipsis",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {post.title}
                          </div>
                        </div>

                        {/* 내용 */}
                        {post.content && (
                          <div
                            style={{
                              fontSize:
                                "11px",
                              color: "#888",
                              lineHeight: 1.5,
                              overflow:
                                "hidden",
                              display:
                                "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient:
                                "vertical",
                              marginBottom:
                                "8px",
                            }}
                          >
                            {post.content}
                          </div>
                        )}

                        {/* 작성자 */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius:
                                "50%",
                              background:
                                getProfileColor(
                                  post.nickname ||
                                    ""
                                ),
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              fontSize:
                                "9px",
                              fontWeight: 700,
                              color: "white",
                              overflow:
                                "hidden",
                            }}
                          >
                            {post.avatar_url ? (
                              <img
                                src={
                                  post.avatar_url
                                }
                                alt={
                                  post.nickname
                                }
                                style={{
                                  width: "100%",
                                  height:
                                    "100%",
                                  objectFit:
                                    "cover",
                                }}
                              />
                            ) : (
                              (
                                post.nickname ||
                                "?"
                              ).charAt(0)
                            )}
                          </div>

                          <span
                            style={{
                              fontSize:
                                "10px",
                              color: "#777",
                              fontWeight: 600,
                            }}
                          >
                            {post.nickname}
                          </span>

                          <span
                            style={{
                              fontSize:
                                "10px",
                              color: "#bbb",
                            }}
                          >
                            {formatDate(
                              post.created_at
                            )}
                          </span>
                        </div>
                      </div>

                      {/* 우측 */}
                      <div
                        style={{
                          width: "68px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          flexShrink: 0,
                          gap: "8px",
                        }}
                      >
                        {/* 썸네일 */}
                        {Array.isArray(post.image_urls) &&
                          post.image_urls.length > 0 &&
                          post.image_urls[0] && (
                            <div
                              style={{
                                width: "58px",
                                height: "58px",
                                borderRadius: "12px",
                                overflow: "hidden",
                                background: "#f7f8fa",
                                border: "1px solid #eee",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <img
                                src={post.image_urls[0]}
                                alt="thumbnail"
                                style={{
                                  width: "100%",
                                  height: "100%",

                                  objectFit: "cover",
                                }}
                              />
                            </div>
                        )}

                        {/* 통계 */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "10px",
                            color: "#bbb",
                          }}
                        >
                          <span
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: "2px",
                            }}
                          >
                            <Heart
                              size={10}
                              color="#bbb"
                            />
                            {post.likes || 0}
                          </span>

                          <span
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: "2px",
                            }}
                          >
                            <MessageCircle
                              size={10}
                              color="#bbb"
                            />
                            {post.comment_count ||
                              0}
                          </span>

                          <span
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: "2px",
                            }}
                          >
                            <Eye
                              size={10}
                              color="#bbb"
                            />
                            {post.views || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

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

                {/* footer */}
                <div
                  style={{
                    marginTop: "20px",
                    background: "#eef1f4",
                    borderTop:
                      "1px solid #dfe3e8",
                    padding:
                      "26px 18px 110px",
                    textAlign: "center",
                  }}
                >
                  <div
                    className="ggk-logo"
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#6b7280",
                      marginBottom: "8px",
                    }}
                  >
                    같이가개 커뮤니티
                  </div>

                  <div
                    style={{
                      fontSize: "11px",
                      color: "#7d8590",
                      lineHeight: 1.8,
                      marginBottom: "14px",
                    }}
                  >
                    반려동물과 함께하는
                    건강한 커뮤니티 문화를
                    만들어가고 있습니다.
                    <br />
                    서로를 존중하는 이용을
                    부탁드립니다.
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "center",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginBottom: "14px",
                    }}
                  >
                    <button
                      onClick={() =>
                        setShowPrivacy(true)
                      }
                      style={{
                        border: "none",
                        background:
                          "transparent",
                        fontSize: "11px",
                        color: "#6b7280",
                        cursor: "pointer",
                      }}
                    >
                      개인정보 처리방침
                    </button>

                    <span
                      style={{
                        fontSize: "10px",
                        color: "#c5c9cf",
                      }}
                    >
                      |
                    </span>

                    <button
                      style={{
                        border: "none",
                        background:
                          "transparent",
                        fontSize: "11px",
                        color: "#6b7280",
                        cursor: "pointer",
                      }}
                    >
                      커뮤니티 운영정책
                    </button>
                  </div>

                  <div
                    style={{
                      fontSize: "10px",
                      color: "#9aa1aa",
                      lineHeight: 1.7,
                    }}
                  >
                    © 2026 같이가개.
                    All rights reserved.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
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
                      • <strong>책임자:</strong> 같이가개 관리자<br/>
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