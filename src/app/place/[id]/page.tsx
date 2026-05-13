"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";

const adjectives = [
  "행복한",
  "귀여운",
  "용감한",
  "졸린",
  "말랑한",
  "똑똑한",
  "신난",
  "배고픈",
];

const animals = [
  "강아지",
  "고양이",
  "햄스터",
  "토끼",
  "리트리버",
  "푸들",
  "치와와",
  "코기",
];

const generateRandomNickname = () => {
  const adjective =
    adjectives[Math.floor(Math.random() * adjectives.length)];

  const animal =
    animals[Math.floor(Math.random() * animals.length)];

  const number = Math.floor(1000 + Math.random() * 9000);

  return `${adjective}${animal}${number}`;
};

const getUserKey = () => {
  if (typeof window === "undefined") return "";

  let key = localStorage.getItem("user_key");

  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem("user_key", key);
  }

  return key;
};

type ReactionCounts = {
  like: number;
  dislike: number;
  bookmark: number;
};

export default function PlaceDetail() {
  const params = useParams();
  const placeId = Number(params.id);

  const [place, setPlace] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  // 로그인
  const [session, setSession] = useState<any>(null);

  // 랜덤 닉네임
  const [myNickname, setMyNickname] = useState("");

  // 댓글 작성
  const [password, setPassword] = useState("");
  const [content, setContent] = useState("");

  // 정렬
  const [sort, setSort] = useState<"latest" | "like">("latest");

  // 반응
  const [reaction, setReaction] = useState<any>(null);

  const [reactionCounts, setReactionCounts] =
    useState<ReactionCounts>({
      like: 0,
      dislike: 0,
      bookmark: 0,
    });

  // 수정 상태
  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editContent, setEditContent] = useState("");
  const [editPassword, setEditPassword] = useState("");

  // 삭제 상태
  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [deletePassword, setDeletePassword] =
    useState("");

  const isProcessingRef = useRef(false);

  // ================= 랜덤 닉네임 생성 =================
  const createRandomNickname = async () => {
    const userKey = getUserKey();

    let created = false;

    while (!created) {
      const randomNickname = generateRandomNickname();

      const { error } = await supabase
        .from("users")
        .upsert(
          [
            {
              user_key: userKey,
              nickname: randomNickname,
            },
          ],
          {
            onConflict: "user_key",
          }
        );

      if (!error) {
        setMyNickname(randomNickname);
        created = true;
      }
    }
  };

  // ================= 리뷰 불러오기 =================
  const fetchReviews = async () => {
    const { data } = await supabase
      .from("reviews")
      .select("*")
      .eq("place_id", placeId)
      .order("id", { ascending: false });

    setReviews(data || []);
  };

  // ================= 로그인 세션 =================
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ================= 데이터 로딩 =================
  useEffect(() => {
    const fetchData = async () => {
      if (!placeId) return;

      // 장소
      const { data: placeData } = await supabase
        .from("places")
        .select("*")
        .eq("id", placeId)
        .single();

      setPlace(placeData);

      // 리뷰
      await fetchReviews();

      // 유저
      const userKey = getUserKey();

      const { data: existingUser } = await supabase
        .from("users")
        .select("*")
        .eq("user_key", userKey)
        .maybeSingle();

      if (!existingUser) {
        await createRandomNickname();
      } else {
        setMyNickname(existingUser.nickname);
      }

      // 내 반응
      const { data: reactionRows } = await supabase
        .from("reactions")
        .select("*")
        .eq("place_id", placeId)
        .eq("user_key", userKey)
        .limit(1);

      setReaction(reactionRows?.[0] ?? null);

      // 전체 반응 수
      const { data: allReactions } = await supabase
        .from("reactions")
        .select("type")
        .eq("place_id", placeId);

      const counts: ReactionCounts = {
        like: 0,
        dislike: 0,
        bookmark: 0,
      };

      (allReactions || []).forEach((r) => {
        if (r.type in counts) {
          counts[r.type as keyof ReactionCounts]++;
        }
      });

      setReactionCounts(counts);
    };

    fetchData();
  }, [placeId]);

  // ================= 댓글 등록 =================
  const handleSubmit = async () => {
    if (!myNickname || !password || !content) return;

    const userKey = getUserKey();

    const authUserId = session?.user?.id ?? null;

    const { error } = await supabase
      .from("reviews")
      .insert([
        {
          place_id: placeId,
          nickname: myNickname,
          password,
          content,
          likes: 0,
          user_key: userKey,
          auth_user_id: authUserId,
        },
      ]);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setContent("");

    await fetchReviews();
  };

  // ================= 댓글 좋아요 =================
  const likeReview = async (reviewId: string) => {
    const userKey = getUserKey();

    const { data: existing } = await supabase
      .from("review_likes")
      .select("*")
      .eq("review_id", reviewId)
      .eq("user_key", userKey)
      .maybeSingle();

    const review = reviews.find((r) => r.id === reviewId);

    if (!review) return;

    // 좋아요 취소
    if (existing) {
      await supabase
        .from("review_likes")
        .delete()
        .eq("review_id", reviewId)
        .eq("user_key", userKey);

      const newLikes = Math.max(
        0,
        (review.likes || 0) - 1
      );

      await supabase
        .from("reviews")
        .update({
          likes: newLikes,
        })
        .eq("id", reviewId);

      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? { ...r, likes: newLikes }
            : r
        )
      );

      return;
    }

    // 좋아요 추가
    await supabase.from("review_likes").insert([
      {
        review_id: reviewId,
        user_key: userKey,
      },
    ]);

    const newLikes = (review.likes || 0) + 1;

    await supabase
      .from("reviews")
      .update({
        likes: newLikes,
      })
      .eq("id", reviewId);

    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId
          ? { ...r, likes: newLikes }
          : r
      )
    );
  };

  // ================= 작성자 확인 =================
  const isOwner = (review: any): boolean => {
    if (session?.user?.id && review.auth_user_id) {
      return session.user.id === review.auth_user_id;
    }

    return review.user_key === getUserKey();
  };

  // ================= 수정 =================
  const startEdit = (review: any) => {
    setEditingId(review.id);
    setEditContent(review.content);
    setEditPassword("");
    setDeletingId(null);
  };

  const handleEdit = async (reviewId: string) => {
    const review = reviews.find((r) => r.id === reviewId);

    if (!review || !editContent.trim()) return;

    if (!isOwner(review)) {
      if (editPassword !== review.password) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
      }
    }

    const { error } = await supabase
      .from("reviews")
      .update({
        content: editContent,
      })
      .eq("id", reviewId);

    if (error) {
      console.error(error);
      return;
    }

    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId
          ? { ...r, content: editContent }
          : r
      )
    );

    setEditingId(null);
  };

  // ================= 삭제 =================
  const startDelete = (reviewId: string) => {
    setDeletingId(reviewId);
    setDeletePassword("");
    setEditingId(null);
  };

  const handleDelete = async (reviewId: string) => {
    const review = reviews.find((r) => r.id === reviewId);

    if (!review) return;

    if (!isOwner(review)) {
      if (deletePassword !== review.password) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
      }
    }

    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("id", reviewId);

    if (error) {
      console.error(error);
      return;
    }

    setReviews((prev) =>
      prev.filter((r) => r.id !== reviewId)
    );
  };

  // ================= 반응 =================
  const handleReaction = async (
    type: "like" | "dislike" | "bookmark"
  ) => {
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;

    try {
      const userKey = getUserKey();

      if (reaction?.type === type) {
        await supabase
          .from("reactions")
          .delete()
          .eq("place_id", placeId)
          .eq("user_key", userKey);

        setReaction(null);

        setReactionCounts((prev) => ({
          ...prev,
          [type]: Math.max(0, prev[type] - 1),
        }));
      } else {
        await supabase
          .from("reactions")
          .delete()
          .eq("place_id", placeId)
          .eq("user_key", userKey);

        await supabase
          .from("reactions")
          .insert([
            {
              place_id: placeId,
              user_key: userKey,
              type,
            },
          ]);

        const prevType =
          reaction?.type as keyof ReactionCounts | undefined;

        setReaction({ type });

        setReactionCounts((prev) => ({
          ...prev,
          ...(prevType && {
            [prevType]: Math.max(
              0,
              prev[prevType] - 1
            ),
          }),
          [type]: prev[type] + 1,
        }));
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  if (!place) {
    return <div>로딩중...</div>;
  }

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "20px",
      }}
    >
      {/* 로그인 */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "16px",
          gap: "10px",
          alignItems: "center",
        }}
      >
        {session ? (
          <>
            <span
              style={{
                fontSize: "13px",
                color: "#666",
              }}
            >
              {session.user.user_metadata?.name ||
                session.user.email}
              로 로그인됨
            </span>

            <button
              onClick={() =>
                supabase.auth.signOut()
              }
            >
              로그아웃
            </button>
          </>
        ) : (
          <button
            onClick={() =>
              supabase.auth.signInWithOAuth({
                provider: "kakao",
                options: {
                  redirectTo: window.location.href,
                },
              })
            }
          >
            🔐 Kakao로 로그인
          </button>
        )}
      </div>

      {/* 장소 */}
      <h1>{place.name}</h1>

      <p>{place.category}</p>

      <div
        style={{
          width: "100%",
          height: "240px",
          background: "#eee",
          borderRadius: "12px",
          marginTop: "12px",
        }}
      />

      <div style={{ marginTop: "20px" }}>
        <p>📍 {place.address}</p>
        <p>⏰ {place.hours}</p>
      </div>

      {/* 반려동물 정보 */}
      <div style={{ marginTop: "20px" }}>
        <h3>🐾 반려동물 정보</h3>

        <p>
          동반 가능: {place.pet_zone}
        </p>

        <p>
          대형견 가능:{" "}
          {place.large_dog ? "가능" : "불가"}
        </p>

        <p>
          펫 메뉴: {place.pet_menu}
        </p>
      </div>

      {/* 찜/추천/비추천 */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginTop: "20px",
        }}
      >
        <button
          onClick={() =>
            handleReaction("bookmark")
          }
        >
          ❤️ 찜 ({reactionCounts.bookmark})
        </button>

        <button
          onClick={() =>
            handleReaction("like")
          }
        >
          👍 추천 ({reactionCounts.like})
        </button>

        <button
          onClick={() =>
            handleReaction("dislike")
          }
        >
          👎 비추천 ({reactionCounts.dislike})
        </button>
      </div>

      {/* 네이버 지도 */}
      <div style={{ marginTop: "10px" }}>
        <a
          href={`https://map.naver.com/v5/search/${place.name}`}
          target="_blank"
          rel="noreferrer"
        >
          🗺 네이버 지도 보기
        </a>
      </div>

      {/* 댓글 헤더 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "30px",
        }}
      >
        <h3>댓글 {reviews.length}개</h3>

        <div>
          <button
            onClick={() =>
              setSort("latest")
            }
          >
            최신순
          </button>

          <button
            onClick={() =>
              setSort("like")
            }
          >
            좋아요순
          </button>
        </div>
      </div>

      {/* 댓글 작성 */}
      <div
        style={{
          padding: "15px",
          background: "#f5f6f8",
          borderRadius: "10px",
          marginTop: "10px",
        }}
      >
        {/* 첫 줄 */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "10px",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: 1,
              background: "white",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          >
            <span>{myNickname}</span>

            <button
              onClick={createRandomNickname}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: "18px",
              }}
            >
              🔀
            </button>
          </div>

          <input
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />
        </div>

        {/* 두 번째 줄 */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "stretch",
          }}
        >
          <textarea
            placeholder="댓글을 입력하세요"
            value={content}
            onChange={(e) =>
              setContent(e.target.value)
            }
            style={{
              flex: 1,
              minHeight: "80px",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ddd",
            }}
          />

          <button
            onClick={handleSubmit}
            disabled={!password || !content}
            style={{
              width: "90px",
              borderRadius: "8px",
              border: "none",
              background: "#111",
              color: "white",
              cursor: "pointer",
            }}
          >
            등록
          </button>
        </div>
      </div>

      {/* 댓글 리스트 */}
      <div style={{ marginTop: "20px" }}>
        {[...reviews]
          .sort((a, b) =>
            sort === "latest"
              ? String(b.id).localeCompare(
                  String(a.id)
                )
              : (b.likes || 0) -
                (a.likes || 0)
          )
          .map((r) => (
            <div
              key={r.id}
              style={{
                borderBottom: "1px solid #eee",
                padding: "12px 0",
              }}
            >
              {/* 닉네임 */}
              <div
                style={{
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                🧑 {r.nickname}

                {isOwner(r) && (
                  <span
                    style={{
                      fontSize: "11px",
                      background: "#e8f0fe",
                      color: "#1a73e8",
                      padding: "2px 7px",
                      borderRadius: "99px",
                    }}
                  >
                    내 댓글
                  </span>
                )}
              </div>

              {/* 수정 */}
              {editingId === r.id ? (
                <div
                  style={{
                    marginTop: "8px",
                  }}
                >
                  <textarea
                    value={editContent}
                    onChange={(e) =>
                      setEditContent(
                        e.target.value
                      )
                    }
                    style={{
                      width: "100%",
                      minHeight: "60px",
                    }}
                  />

                  {!isOwner(r) && (
                    <input
                      placeholder="비밀번호 입력"
                      type="password"
                      value={editPassword}
                      onChange={(e) =>
                        setEditPassword(
                          e.target.value
                        )
                      }
                    />
                  )}

                  <div
                    style={{
                      marginTop: "8px",
                      display: "flex",
                      gap: "8px",
                    }}
                  >
                    <button
                      onClick={() =>
                        handleEdit(r.id)
                      }
                    >
                      저장
                    </button>

                    <button
                      onClick={() =>
                        setEditingId(null)
                      }
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: "5px",
                  }}
                >
                  {r.content}
                </div>
              )}

              {/* 삭제 */}
              {deletingId === r.id && (
                <div
                  style={{
                    marginTop: "8px",
                    background: "#fff3f3",
                    padding: "10px",
                    borderRadius: "8px",
                  }}
                >
                  <p>
                    정말 삭제하시겠습니까?
                  </p>

                  {!isOwner(r) && (
                    <input
                      placeholder="비밀번호 입력"
                      type="password"
                      value={deletePassword}
                      onChange={(e) =>
                        setDeletePassword(
                          e.target.value
                        )
                      }
                    />
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                    }}
                  >
                    <button
                      onClick={() =>
                        handleDelete(r.id)
                      }
                    >
                      삭제
                    </button>

                    <button
                      onClick={() => {
                        setDeletingId(null);
                        setDeletePassword("");
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              {/* 버튼 */}
              {editingId !== r.id && (
                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <button
                    onClick={() =>
                      likeReview(r.id)
                    }
                  >
                    ❤️ {r.likes || 0}
                  </button>

                  <button
                    onClick={() =>
                      startEdit(r)
                    }
                  >
                    ✏️ 수정
                  </button>

                  <button
                    onClick={() =>
                      startDelete(r.id)
                    }
                  >
                    🗑 삭제
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}