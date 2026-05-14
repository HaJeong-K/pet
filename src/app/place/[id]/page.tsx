"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import {
  Heart,
  ThumbsUp,
  ThumbsDown,
  User,
  Trash2,
  Pencil,
  Shuffle,
  MapPin,
  Clock,
  PawPrint,
} from "lucide-react";

const NAVER_MAP_ICON = "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";

const adjectives = ["행복한","귀여운","용감한","졸린","말랑한","똑똑한","신난","배고픈"];
const animals = ["강아지","고양이","햄스터","토끼","리트리버","푸들","치와와","코기"];

const sortBtn = (active: boolean) => ({
  padding: "6px 12px",
  borderRadius: "8px",
  border: "1px solid #ddd",
  background: active ? "#111" : "white",
  color: active ? "white" : "#111",
  cursor: "pointer",
  marginLeft: "6px",
});

const generateRandomNickname = () => {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
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

type VoteReaction = "like" | "dislike" | null;

export default function PlaceDetail() {
  const params = useParams();
  const router = useRouter();
  const placeId = Number(params.id);

  const [place, setPlace] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [myNickname, setMyNickname] = useState("");
  const [password, setPassword] = useState("");
  const [content, setContent] = useState("");
  const [sort, setSort] = useState<"latest" | "like">("latest");

  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);

  const [voteReaction, setVoteReaction] = useState<VoteReaction>(null);
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);

  const [likedReviewIds, setLikedReviewIds] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

  const isProcessingRef = useRef(false);
  const isBookmarkProcessingRef = useRef(false);

  // ================= 랜덤 닉네임 =================
  const createRandomNickname = async () => {
    const userKey = getUserKey();
    let created = false;
    while (!created) {
      const randomNickname = generateRandomNickname();
      const { error } = await supabase
        .from("users")
        .upsert([{ user_key: userKey, nickname: randomNickname }], {
          onConflict: "user_key",
        });
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
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // ================= 데이터 로딩 =================
  useEffect(() => {
    const fetchData = async () => {
      if (!placeId) return;
      const userKey = getUserKey();

      const { data: placeData } = await supabase
        .from("places").select("*").eq("id", placeId).single();
      setPlace(placeData);

      await fetchReviews();

      const { data: existingUser } = await supabase
        .from("users").select("*").eq("user_key", userKey).maybeSingle();
      if (!existingUser) await createRandomNickname();
      else setMyNickname(existingUser.nickname);

      const { data: allReactions } = await supabase
        .from("reactions").select("type").eq("place_id", placeId);

      let likes = 0, dislikes = 0, bookmarks = 0;
      (allReactions || []).forEach((r) => {
        if (r.type === "like") likes++;
        else if (r.type === "dislike") dislikes++;
        else if (r.type === "bookmark") bookmarks++;
      });
      setLikesCount(likes);
      setDislikesCount(dislikes);
      setBookmarkCount(bookmarks);

      const { data: myReactions } = await supabase
        .from("reactions")
        .select("*")
        .eq("place_id", placeId)
        .eq("user_key", userKey);

      const myBookmark = myReactions?.find((r) => r.type === "bookmark");
      const myVote = myReactions?.find((r) => r.type === "like" || r.type === "dislike");
      setBookmarked(!!myBookmark);
      setVoteReaction((myVote?.type as VoteReaction) ?? null);

      const { data: myLikes } = await supabase
        .from("review_likes")
        .select("review_id")
        .eq("user_key", userKey);
      setLikedReviewIds(new Set((myLikes || []).map((l) => String(l.review_id))));
    };

    fetchData();
  }, [placeId]);

  // ================= 댓글 등록 =================
  const handleSubmit = async () => {
    if (!myNickname || !password || !content) return;
    const userKey = getUserKey();
    const authUserId = session?.user?.id ?? null;
    const { error } = await supabase.from("reviews").insert([{
      place_id: placeId, nickname: myNickname, password,
      content, likes: 0, user_key: userKey, auth_user_id: authUserId,
    }]);
    if (error) { console.error(error); alert(error.message); return; }
    setContent("");
    await fetchReviews();
  };

  // ================= 댓글 좋아요 (토글) =================
  const likeReview = async (reviewId: string) => {
    const userKey = getUserKey();
    const review = reviews.find((r) => r.id === reviewId);
    if (!review) return;

    const isLiked = likedReviewIds.has(String(reviewId));

    if (isLiked) {
      await supabase.from("review_likes")
        .delete().eq("review_id", reviewId).eq("user_key", userKey);
      const newLikes = Math.max(0, (review.likes || 0) - 1);
      await supabase.from("reviews").update({ likes: newLikes }).eq("id", reviewId);
      setReviews((prev) =>
        prev.map((r) => r.id === reviewId ? { ...r, likes: newLikes } : r)
      );
      setLikedReviewIds((prev) => {
        const next = new Set(prev);
        next.delete(String(reviewId));
        return next;
      });
    } else {
      await supabase.from("review_likes").insert([{ review_id: reviewId, user_key: userKey }]);
      const newLikes = (review.likes || 0) + 1;
      await supabase.from("reviews").update({ likes: newLikes }).eq("id", reviewId);
      setReviews((prev) =>
        prev.map((r) => r.id === reviewId ? { ...r, likes: newLikes } : r)
      );
      setLikedReviewIds((prev) => new Set(prev).add(String(reviewId)));
    }
  };

  // ================= 작성자 확인 =================
  const isOwner = (review: any): boolean => {
    if (session?.user?.id && review.auth_user_id)
      return session.user.id === review.auth_user_id;
    return review.user_key === getUserKey();
  };

  // ================= 수정 =================
  const startEdit = (review: any) => {
    setEditingId(review.id); setEditContent(review.content);
    setEditPassword(""); setDeletingId(null);
  };

  const handleEdit = async (reviewId: string) => {
    const review = reviews.find((r) => r.id === reviewId);
    if (!review || !editContent.trim()) return;
    if (!isOwner(review) && editPassword !== review.password) {
      alert("비밀번호가 일치하지 않습니다."); return;
    }
    const { error } = await supabase.from("reviews")
      .update({ content: editContent }).eq("id", reviewId);
    if (error) { console.error(error); return; }
    setReviews((prev) =>
      prev.map((r) => r.id === reviewId ? { ...r, content: editContent } : r)
    );
    setEditingId(null);
  };

  // ================= 삭제 =================
  const startDelete = (reviewId: string) => {
    setDeletingId(reviewId); setDeletePassword(""); setEditingId(null);
  };

  const handleDelete = async (reviewId: string) => {
    const review = reviews.find((r) => r.id === reviewId);
    if (!review) return;
    if (!isOwner(review) && deletePassword !== review.password) {
      alert("비밀번호가 일치하지 않습니다."); return;
    }
    const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
    if (error) { console.error(error); return; }
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    setDeletingId(null);
  };

  // ================= 찜 토글 =================
  const handleBookmark = async () => {
    if (isBookmarkProcessingRef.current) return;
    isBookmarkProcessingRef.current = true;
    try {
      const userKey = getUserKey();
      if (bookmarked) {
        await supabase.from("reactions")
          .delete().eq("place_id", placeId).eq("user_key", userKey).eq("type", "bookmark");
        setBookmarked(false);
        setBookmarkCount((prev) => Math.max(0, prev - 1));
      } else {
        await supabase.from("reactions").insert([{ place_id: placeId, user_key: userKey, type: "bookmark" }]);
        setBookmarked(true);
        setBookmarkCount((prev) => prev + 1);
      }
    } finally {
      isBookmarkProcessingRef.current = false;
    }
  };

  // ================= 추천/비추천 토글 =================
  const handleVote = async (type: "like" | "dislike") => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      const userKey = getUserKey();

      await supabase.from("reactions")
        .delete()
        .eq("place_id", placeId)
        .eq("user_key", userKey)
        .in("type", ["like", "dislike"]);

      if (voteReaction === type) {
        setVoteReaction(null);
        if (type === "like") setLikesCount((p) => Math.max(0, p - 1));
        else setDislikesCount((p) => Math.max(0, p - 1));
      } else {
        await supabase.from("reactions").insert([{ place_id: placeId, user_key: userKey, type }]);
        if (voteReaction === "like") setLikesCount((p) => Math.max(0, p - 1));
        if (voteReaction === "dislike") setDislikesCount((p) => Math.max(0, p - 1));
        setVoteReaction(type);
        if (type === "like") setLikesCount((p) => p + 1);
        else setDislikesCount((p) => p + 1);
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  // ================= 로딩 =================
  if (!place) return (
    <div style={{ padding: "60px 20px", textAlign: "center", color: "#888", fontSize: "15px" }}>
      로딩중...
    </div>
  );

  // ================= 렌더 — 순수 콘텐츠만, wrapper 없음 =================
  return (
    <div style={{ padding: "4px 0 20px" }}>

      {/* 장소명 */}
      <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "4px", color: "#111" }}>
        {place.name}
      </h1>
      <p style={{ margin: "0 0 12px", color: "#555" }}>
        <span style={{ fontWeight: 600 }}>식당 종류 :</span> {place.category}
      </p>

      {/* 이미지 */}
      <img
        src={place.image_url}
        alt={place.name}
        style={{ width: "100%", height: "220px", objectFit: "cover", borderRadius: "12px" }}
      />

      {/* 주소 / 영업시간 */}
      <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
        <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0, fontSize: "14px" }}>
          <MapPin size={15} color="#555" /> {place.address}
        </p>
        <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0, fontSize: "14px" }}>
          <Clock size={15} color="#555" /> {place.hours}
        </p>
      </div>

      {/* 반려동물 정보 */}
      <div style={{ marginTop: "18px" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "6px", margin: "0 0 8px", fontSize: "15px" }}>
          <PawPrint size={16} color="#555" /> 반려동물 정보
        </h3>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>동반 가능: {place.pet_zone}</p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>대형견 가능: {place.large_dog ? "가능" : "불가"}</p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>펫 메뉴: {place.pet_menu}</p>
      </div>

      {/* 찜 / 추천 / 비추천 / 네이버지도 */}
      <div style={{ display: "flex", gap: "8px", marginTop: "18px", alignItems: "center", flexWrap: "wrap" }}>

        {/* 찜 */}
        <button
          onClick={handleBookmark}
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "7px 12px", borderRadius: "10px",
            border: `1px solid ${bookmarked ? "#ff3040" : "#ddd"}`,
            background: bookmarked ? "#fff0f2" : "white",
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          <Heart size={17} fill={bookmarked ? "#ff3040" : "none"} color={bookmarked ? "#ff3040" : "#555"} />
          <span style={{ fontSize: "13px", color: bookmarked ? "#ff3040" : "#555" }}>찜</span>
        </button>

        {/* 추천 */}
        <button
          onClick={() => handleVote("like")}
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "7px 12px", borderRadius: "10px",
            border: `1px solid ${voteReaction === "like" ? "#3b82f6" : "#ddd"}`,
            background: voteReaction === "like" ? "#eff6ff" : "white",
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          <ThumbsUp size={17} color={voteReaction === "like" ? "#3b82f6" : "#555"} fill={voteReaction === "like" ? "#3b82f6" : "none"} />
          <span style={{ fontSize: "13px", color: voteReaction === "like" ? "#3b82f6" : "#555" }}>
            추천 ({likesCount})
          </span>
        </button>

        {/* 비추천 */}
        <button
          onClick={() => handleVote("dislike")}
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "7px 12px", borderRadius: "10px",
            border: `1px solid ${voteReaction === "dislike" ? "#ef4444" : "#ddd"}`,
            background: voteReaction === "dislike" ? "#fff1f1" : "white",
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          <ThumbsDown size={17} color={voteReaction === "dislike" ? "#ef4444" : "#555"} fill={voteReaction === "dislike" ? "#ef4444" : "none"} />
          <span style={{ fontSize: "13px", color: voteReaction === "dislike" ? "#ef4444" : "#555" }}>
            비추천 ({dislikesCount})
          </span>
        </button>

        {/* 네이버 지도 */}
        <a
          href={`https://map.naver.com/v5/search/${encodeURIComponent(place.name)}`}
          target="_blank" rel="noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "7px 12px", borderRadius: "10px",
            border: "1px solid #ddd", background: "white",
            textDecoration: "none", color: "#111", whiteSpace: "nowrap",
          }}
        >
          <img
            src={`data:image/jpeg;base64,${NAVER_MAP_ICON}`}
            alt="네이버 지도"
            style={{ width: "17px", height: "17px", borderRadius: "4px" }}
          />
          <span style={{ fontSize: "13px" }}>네이버 지도</span>
        </a>
      </div>

      {/* 댓글 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "28px" }}>
        <h3 style={{ margin: 0, fontSize: "15px" }}>댓글 {reviews.length}개</h3>
        <div>
          <button style={sortBtn(sort === "latest")} onClick={() => setSort("latest")}>최신순</button>
          <button style={sortBtn(sort === "like")} onClick={() => setSort("like")}>좋아요순</button>
        </div>
      </div>

      {/* 댓글 작성 */}
      <div style={{ padding: "14px", background: "#f5f6f8", borderRadius: "10px", marginTop: "10px" }}>
        <div style={{ display: "flex", gap: "10px", marginBottom: "10px", alignItems: "center" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px", flex: 1,
            background: "white", padding: "9px 12px", borderRadius: "8px", border: "1px solid #ddd",
            fontSize: "14px",
          }}>
            {myNickname}
            <button
              onClick={createRandomNickname}
              style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
            >
              <Shuffle size={16} />
            </button>
          </div>
          <input
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "14px" }}
          />
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "stretch" }}>
          <textarea
            placeholder="댓글을 입력하세요"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ flex: 1, minHeight: "72px", padding: "10px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "14px", resize: "none" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!password || !content}
            style={{
              width: "80px", borderRadius: "8px", border: "none",
              background: !password || !content ? "#ccc" : "#111",
              color: "white", cursor: !password || !content ? "default" : "pointer",
              fontSize: "14px", fontWeight: 600,
            }}
          >
            등록
          </button>
        </div>
      </div>

      {/* 댓글 리스트 */}
      <div style={{ marginTop: "16px" }}>
        {[...reviews]
          .sort((a, b) =>
            sort === "latest"
              ? String(b.id).localeCompare(String(a.id))
              : (b.likes || 0) - (a.likes || 0)
          )
          .map((r) => (
            <div key={r.id} style={{ borderBottom: "1px solid #eee", padding: "12px 0" }}>

              {/* 닉네임 */}
              <div style={{ fontWeight: 700, fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                <User size={15} />
                {r.nickname}
                {isOwner(r) && (
                  <span style={{ fontSize: "11px", background: "#e8f0fe", color: "#1a73e8", padding: "2px 7px", borderRadius: "99px" }}>
                    내 댓글
                  </span>
                )}
              </div>

              {/* 수정 모드 */}
              {editingId === r.id ? (
                <div style={{ marginTop: "8px" }}>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={{ width: "100%", minHeight: "60px", padding: "8px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "14px", boxSizing: "border-box" }}
                  />
                  {!isOwner(r) && (
                    <input
                      placeholder="비밀번호 입력"
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      style={{ marginTop: "6px", width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "14px", boxSizing: "border-box" }}
                    />
                  )}
                  <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => handleEdit(r.id)}
                      style={{ padding: "6px 14px", borderRadius: "6px", border: "none", background: "#111", color: "white", cursor: "pointer", fontSize: "13px" }}
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid #ddd", background: "white", cursor: "pointer", fontSize: "13px" }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: "5px", fontSize: "14px", color: "#333", lineHeight: 1.5 }}>{r.content}</div>
              )}

              {/* 삭제 확인 */}
              {deletingId === r.id && (
                <div style={{ marginTop: "8px", background: "#fff3f3", padding: "10px 12px", borderRadius: "8px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#c00" }}>정말 삭제하시겠습니까?</p>
                  {!isOwner(r) && (
                    <input
                      placeholder="비밀번호 입력"
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "14px", marginBottom: "8px", boxSizing: "border-box" }}
                    />
                  )}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => handleDelete(r.id)}
                      style={{ padding: "6px 14px", borderRadius: "6px", border: "none", background: "#ef4444", color: "white", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}
                    >
                      <Trash2 size={14} /> 삭제
                    </button>
                    <button
                      onClick={() => { setDeletingId(null); setDeletePassword(""); }}
                      style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid #ddd", background: "white", cursor: "pointer", fontSize: "13px" }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              {/* 댓글 액션 버튼 */}
              {editingId !== r.id && (
                <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    onClick={() => likeReview(r.id)}
                    style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    <Heart
                      size={17}
                      color={likedReviewIds.has(String(r.id)) ? "#ef4444" : "#bbb"}
                      fill={likedReviewIds.has(String(r.id)) ? "#ef4444" : "none"}
                    />
                    <span style={{ fontSize: "13px", color: "#666" }}>{r.likes || 0}</span>
                  </button>
                  <button
                    onClick={() => startEdit(r)}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
                  >
                    <Pencil size={15} color="#888" />
                  </button>
                  <button
                    onClick={() => startDelete(r.id)}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
                  >
                    <Trash2 size={15} color="#888" />
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}