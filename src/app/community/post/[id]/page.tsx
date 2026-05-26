"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Eye,
  Send,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

interface Post {
  id: string;
  title: string;
  content: string;
  board_id: string;
  post_type?: string | null;
  image_urls?: string[];
  
  nickname: string;
  avatar_url?: string | null;

  created_at: string;

  likes?: number;
  views?: number;
}

interface CommentItem {
  id: string;
  content: string;
  nickname: string;
  avatar_url?: string | null;
  parent_id: string | null;
  created_at: string;
}

export default function CommunityDetailPage() {
  const router = useRouter();
  const params = useParams();

  const postId = params?.id as string;

  const [post, setPost] = useState<Post | null>(null);

  const [comments, setComments] = useState<CommentItem[]>([]);

  const [comment, setComment] = useState("");
  const [replyMap, setReplyMap] = useState<
    Record<string, string>
  >({});

  const [replyTarget, setReplyTarget] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState<any>(null);

  // ─────────────────────────────
  // 게시글 불러오기
  // ─────────────────────────────
  const fetchPost = async () => {
    const { data } = await supabase
      .from("community_posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (data) {
      setPost(data);

      // 조회수 증가
      await supabase
        .from("community_posts")
        .update({
          views: (data.views || 0) + 1,
        })
        .eq("id", postId);
    }
  };

  // ─────────────────────────────
  // 댓글 불러오기
  // ─────────────────────────────
  const fetchComments = async () => {
    const { data, error } = await supabase
      .from("community_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error(
        "댓글 fetch 에러:",
        JSON.stringify(error, null, 2)
      );

      alert(
        error.message ||
          "댓글을 불러오지 못했습니다."
      );

      return;
    }

    setComments(data || []);
  };

  // ─────────────────────────────
  // 댓글 작성
  // ─────────────────────────────
  const handleComment = async () => {
    if (!session) return;

    if (!comment.trim()) return;

    const user = session.user;

    const { error } = await supabase
      .from("community_comments")
      .insert([
        {
          post_id: postId,

          parent_id: null,

          author_auth_key: user.id,

          nickname:
            user.user_metadata?.nickname || "익명",

          avatar_url:
            user.user_metadata?.avatar_url || null,

          content: comment.trim(),
        },
      ]);

    if (error) {
      console.error(error);
      return;
    }

    setComment("");

    fetchComments();
  };

  const handleReply = async (
    parentId: string
  ) => {
    if (!session) return;

    const value = replyMap[parentId];

    if (!value?.trim()) return;

    const user = session.user;

    const { error } = await supabase
      .from("community_comments")
      .insert([
        {
          post_id: postId,

          parent_id: parentId,

          author_auth_key: user.id,

          nickname:
            user.user_metadata?.nickname || "익명",

          avatar_url:
            user.user_metadata?.avatar_url || null,

          content: value.trim(),
        },
      ]);

    if (error) {
      console.error(error);
      return;
    }

    setReplyMap((prev) => ({
      ...prev,
      [parentId]: "",
    }));

    setReplyTarget(null);

    fetchComments();
  };

  // ─────────────────────────────
  // 최초 로딩
  // ─────────────────────────────
  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);

      await Promise.all([
        fetchPost(),
        fetchComments(),
      ]);

      setLoading(false);
    };

    init();
  }, []);

  // ─────────────────────────────
  // 날짜 포맷
  // ─────────────────────────────
  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ─────────────────────────────
  // 게시판 이름
  // ─────────────────────────────
  const getBoardLabel = (id: string) => {
    const map: Record<string, string> = {
      free: "자유게시판",
      seoul: "서울",
      gyeonggi: "경기",
      busan: "부산",
      daegu: "대구",
      jeju: "제주",
    };

    return map[id] || "게시판";
  };

  if (loading || !post) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f6f8",
        }}
      >
        불러오는 중...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f6f8",
      }}
    >
      {/* 상단바 */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,

          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(12px)",

          borderBottom: "1px solid #eee",

          height: "56px",

          display: "flex",
          alignItems: "center",

          padding: "0 14px",
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",

            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            marginRight: "8px",
          }}
        >
          <ArrowLeft size={20} />
        </button>

        <div
          className="ggk-logo"
          style={{
            fontSize: "16px",
            fontWeight: 800,
          }}
        >
          게시글
        </div>
      </div>

      {/* 본문 */}
      <div
        style={{
          padding: "14px",
        }}
      >
        <div
          style={{
            background: "white",

            borderRadius: "16px",

            border: "1px solid #e8eaed",

            padding: "18px",
          }}
        >
          {/* 게시판 */}
          <div
            style={{
              marginBottom: "10px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,

                background: "#f5f6f8",
                color: "#555",

                padding: "4px 9px",
                borderRadius: "999px",

                marginRight: "6px",
              }}
            >
              {getBoardLabel(post.board_id)}
            </span>

            {post.post_type && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,

                  background: "#fff3e8",
                  color: "#ff7a00",

                  padding: "4px 9px",
                  borderRadius: "999px",
                }}
              >
                {post.post_type}
              </span>
            )}
          </div>

          {/* 제목 */}
          <div
            className="ggk-logo"
            style={{
              fontSize: "20px",
              fontWeight: 800,
              color: "#111",

              lineHeight: 1.4,

              marginBottom: "14px",
            }}
          >
            {post.title}
          </div>

          {/* 작성자 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",

              marginBottom: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,

                  borderRadius: "50%",

                  background: "#ddd",

                  overflow: "hidden",

                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",

                  fontSize: "13px",
                  fontWeight: 700,
                  color: "white",
                }}
              >
                {post.avatar_url ? (
                  <img
                    src={post.avatar_url}
                    alt={post.nickname}
                    referrerPolicy="no-referrer"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  (post.nickname || "?").charAt(0)
                )}
              </div>

              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#222",
                  }}
                >
                  {post.nickname}
                </div>

                <div
                  style={{
                    fontSize: "11px",
                    color: "#999",
                    marginTop: "2px",
                  }}
                >
                  {formatDate(post.created_at)}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "11px",
                color: "#999",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <Heart size={12} />
                {post.likes || 0}
              </span>

              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <Eye size={12} />
                {post.views || 0}
              </span>
            </div>
          </div>

          {/* 내용 */}
          <div
            style={{
              fontSize: "14px",
              color: "#222",

              lineHeight: 1.8,

              whiteSpace: "pre-wrap",
            }}
          >
            {post.content}
          </div>
        </div>

        {/* 이미지 */}
        {post.image_urls?.length > 0 && (
          <div
            style={{
              marginTop: "14px",

              display: "flex",
              flexDirection: "column",

              gap: "10px",
            }}
          >
            {post.image_urls.map(
              (
                image: string,
                index: number
              ) => (
                <img
                  key={index}
                  src={image}
                  alt={`image-${index}`}
                  style={{
                    width: "100%",

                    borderRadius: "14px",

                    objectFit: "cover",

                    border:
                      "1px solid #f0f0f0",
                  }}
                />
              )
            )}
          </div>
        )}

        {/* 댓글 */}
        <div
          style={{
            marginTop: "14px",

            background: "white",

            borderRadius: "16px",

            border: "1px solid #e8eaed",

            padding: "16px",
          }}
        >
          <div
            className="ggk-logo"
            style={{
              fontSize: "15px",
              fontWeight: 800,
              marginBottom: "14px",
            }}
          >
            댓글 {comments.length}
          </div>

          {/* 댓글 입력 */}
          <div
            style={{
              marginBottom: "16px",
            }}
          >
            <textarea
              value={
                session
                  ? comment
                  : "회원가입 후 댓글 작성이 가능합니다."
              }
              readOnly={!session}
              onChange={(e) => {
                if (session) {
                  setComment(e.target.value);
                }
              }}
              placeholder="댓글을 입력하세요"
              style={{
                width: "100%",
                minHeight: "90px",

                resize: "none",

                borderRadius: "14px",

                border: "1px solid #ddd",

                padding: "14px",

                fontSize: "13px",

                background:
                  session
                    ? "white"
                    : "#f8fafc",

                color:
                  session
                    ? "#111"
                    : "#999",
              }}
            />

            {/* 비회원 안내 */}
            {!session && (
              <div
                style={{
                  marginTop: "12px",

                  padding: "14px",

                  borderRadius: "14px",

                  background: "#f8fafc",

                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "#666",

                    marginBottom: "10px",
                  }}
                >
                  로그인 후 댓글과 답글을 작성할 수 있습니다.
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                  }}
                >
                  <button
                    onClick={() =>
                      router.push(
                        `/login?redirect=/community/post/${post.id}`
                      )
                    }
                    style={{
                      flex: 1,

                      height: "42px",

                      borderRadius: "10px",

                      border: "none",

                      background: "#111",

                      color: "white",

                      fontWeight: 700,

                      cursor: "pointer",
                    }}
                  >
                    로그인
                  </button>

                  <button
                    onClick={() =>
                      router.push(
                        `/signup?redirect=/community/post/${post.id}`
                      )
                    }
                    style={{
                      flex: 1,

                      height: "42px",

                      borderRadius: "10px",

                      border: "1px solid #ddd",

                      background: "white",

                      color: "#111",

                      fontWeight: 700,

                      cursor: "pointer",
                    }}
                  >
                    회원가입
                  </button>
                </div>
              </div>
            )}

            {/* 댓글 작성 버튼 */}
            {session && (
              <button
                onClick={handleComment}
                style={{
                  width: "100%",
                  height: "44px",

                  marginTop: "10px",

                  borderRadius: "12px",

                  border: "none",

                  background:
                    "linear-gradient(145deg, #2a2a2a, #111)",

                  color: "white",

                  fontWeight: 700,

                  cursor: "pointer",

                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <Send size={14} />
                댓글 작성
              </button>
            )}
          </div>

          {/* 댓글 리스트 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {comments
              .filter((item) => !item.parent_id)
              .map((item) => {
                const replies = comments.filter(
                  (reply) =>
                    reply.parent_id === item.id
                );

                return (
                  <div
                    key={item.id}
                    style={{
                      marginBottom: "14px",
                    }}
                  >
                    {/* 댓글 */}
                    <div
                      style={{
                        padding: "12px",

                        borderRadius: "12px",

                        background: "#fafafa",

                        border: "1px solid #f0f0f0",
                      }}
                    >
                      {/* 작성자 */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",

                          marginBottom: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <div
                            style={{
                              width: 22,
                              height: 22,

                              borderRadius: "50%",

                              background: "#ddd",

                              overflow: "hidden",
                            }}
                          >
                            {item.avatar_url && (
                              <img
                                src={item.avatar_url}
                                alt={item.nickname}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            )}
                          </div>

                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                            }}
                          >
                            {item.nickname}
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: "10px",
                            color: "#999",
                          }}
                        >
                          {formatDate(item.created_at)}
                        </span>
                      </div>

                      {/* 내용 */}
                      <div
                        style={{
                          fontSize: "13px",
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {item.content}
                      </div>

                      {/* 답글 버튼 */}
                      <button
                        onClick={() =>
                          setReplyTarget(
                            replyTarget === item.id
                              ? null
                              : item.id
                          )
                        }
                        style={{
                          marginTop: "10px",

                          border: "none",
                          background: "none",

                          color: "#666",

                          fontSize: "11px",
                          fontWeight: 700,

                          cursor: "pointer",
                        }}
                      >
                        답글
                      </button>

                      {/* 답글 입력 */}
                      {replyTarget === item.id && (
                        <div
                          style={{
                            marginTop: "10px",
                          }}
                        >
                          <textarea
                            value={
                              replyMap[item.id] || ""
                            }
                            onChange={(e) =>
                              setReplyMap((prev) => ({
                                ...prev,
                                [item.id]:
                                  e.target.value,
                              }))
                            }
                            placeholder="답글을 입력하세요"
                            style={{
                              width: "100%",
                              minHeight: "80px",

                              resize: "none",

                              borderRadius: "10px",
                              border:
                                "1px solid #ddd",

                              padding: "10px",

                              fontSize: "12px",
                            }}
                          />

                          <button
                            onClick={() =>
                              handleReply(item.id)
                            }
                            style={{
                              marginTop: "8px",

                              width: "100%",
                              height: "38px",

                              borderRadius: "10px",
                              border: "none",

                              background: "#111",

                              color: "white",

                              fontWeight: 700,

                              cursor: "pointer",
                            }}
                          >
                            답글 작성
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 답글 목록 */}
                    {replies.map((reply) => (
                      <div
                        key={reply.id}
                        style={{
                          marginTop: "8px",
                          marginLeft: "24px",

                          padding: "12px",

                          borderRadius: "12px",

                          background: "#f5f6f8",

                          border: "1px solid #eceef2",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,

                            marginBottom: "6px",
                          }}
                        >
                          ↳ {reply.nickname}
                        </div>

                        <div
                          style={{
                            fontSize: "13px",
                            lineHeight: 1.6,
                          }}
                        >
                          {reply.content}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}