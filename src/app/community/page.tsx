"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, MessageCircle, Heart, Eye,
  Pencil, Pin, LogIn,
} from "lucide-react";

const FONT_STYLE = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  .ggk-logo { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
  .ggk-body  { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }
  .post-card { transition: box-shadow 0.14s ease; }
  .post-card:hover { box-shadow: 0 3px 14px rgba(0,0,0,0.09) !important; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 999px; }
`;

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

  const [activeBoard, setActiveBoard] = useState("all");
  const [notices, setNotices] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

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

  const fetchPosts = async (boardId: string) => {
    setLoading(true);

    try {
      const { data: noticeData } = await supabase
        .from("community_posts")
        .select("id, title, nickname, created_at, board_id")
        .eq("is_notice", true)
        .order("created_at", { ascending: false })
        .limit(5);

      setNotices(noticeData || []);

      let q = supabase
        .from("community_posts")
        .select(`
          id,
          title,
          content,
          nickname,
          avatar_url,
          created_at,
          likes,
          comment_count,
          views,
          board_id,
          post_type,
          image_urls
        `)
        .eq("is_notice", false)
        .order("created_at", { ascending: false })
        .limit(50);

      if (boardId !== "all") {
        q = q.eq("board_id", boardId);
      }

      const { data: postData } = await q;

      setPosts(postData || []);

    } catch (err) {
      console.error(err);

      setPosts([]);
      setNotices([]);

    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts(activeBoard);
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

            minHeight: "100vh",

            background: "#f0f2f5",
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
                onClick={() =>
                  setActiveBoard(board.id)
                }
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
                {posts.map((post) => (
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
                          flexDirection:
                            "column",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          flexShrink: 0,
                        }}
                      >
                        {/* 썸네일 */}
                        <div
                          style={{
                            width: "58px",
                            height: "58px",
                            borderRadius:
                              "12px",
                            overflow:
                              "hidden",
                            background:
                              "#f7f8fa",
                            border:
                              Array.isArray(
                                post.image_urls
                              ) &&
                              post.image_urls
                                .length > 0
                                ? "1px solid #eee"
                                : "none",
                            display:
                              "flex",
                            alignItems:
                              "center",
                            justifyContent:
                              "center",
                          }}
                        >
                          {Array.isArray(
                            post.image_urls
                          ) &&
                            post.image_urls
                              .length > 0 && (
                              <img
                                src={
                                  post
                                    .image_urls[0]
                                }
                                alt="thumbnail"
                                style={{
                                  width: "100%",
                                  height:
                                    "100%",
                                  objectFit:
                                    "cover",
                                }}
                              />
                            )}
                        </div>

                        {/* 통계 */}
                        <div
                          style={{
                            display: "flex",
                            alignItems:
                              "center",
                            gap: "6px",
                            marginTop: "8px",
                            fontSize:
                              "10px",
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
                      fontWeight: 800,
                      color: "#4b5563",
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
    </>
  );
}
