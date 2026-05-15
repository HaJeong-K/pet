"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import {
  Heart,
  ThumbsUp,
  ThumbsDown,
  MoreVertical,
  Flag,
  MessageCircle,
  Shuffle,
  MapPin,
  Clock,
  PawPrint,
  Plus,
} from "lucide-react";

const NAVER_MAP_ICON = "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";

const adjectives = ["행복한","귀여운","용감한","졸린","말랑한","똑똑한","신난","배고픈"];
const animals = ["강아지","고양이","햄스터","토끼","리트리버","푸들","치와와","코기"];

const profileColors = [
  "#FF6B6B",
  "#F06595",
  "#CC5DE8",
  "#845EF7",
  "#5C7CFA",
  "#339AF0",
  "#22B8CF",
  "#20C997",
  "#51CF66",
  "#94D82D",
  "#FCC419",
  "#FF922B",
  "#FF6B6B",
  "#E64980",
  "#BE4BDB",
  "#7950F2",
  "#4C6EF5",
  "#228BE6",
  "#15AABF",
  "#12B886",
  "#40C057",
  "#82C91E",
  "#FAB005",
  "#FD7E14",
  "#FA5252",
  "#D6336C",
  "#AE3EC9",
  "#7048E8",
  "#4263EB",
  "#1C7ED6",
  "#1098AD",
  "#0CA678",
  "#37B24D",
  "#74B816",
  "#F59F00",
  "#F76707",
];

const getProfileColor = (nickname: string) => {
  if (!nickname) return "#999";

  const charCode = nickname
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return profileColors[charCode % profileColors.length];
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);

  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yy}-${mm}-${dd}`;
};

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

  // ✅ [추가 1] 갤러리 이미지 상태 & 업로드 관련
  const [galleryImages, setGalleryImages] = useState<{ id: number; image_url: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessingRef = useRef(false);
  const isBookmarkProcessingRef = useRef(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [openedMenuId, setOpenedMenuId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);

  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyPassword, setReplyPassword] = useState("");
  const [replies, setReplies] = useState<any[]>([]);

  const [likedReplyIds, setLikedReplyIds] = useState<Set<string>>(new Set());

  const [openedReplyMenuId, setOpenedReplyMenuId] = useState<string | null>(null);

  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyContent, setEditReplyContent] = useState("");
  const [editReplyPassword, setEditReplyPassword] = useState("");

  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);
  const [deleteReplyPassword, setDeleteReplyPassword] = useState("");

  const [reportingReplyId, setReportingReplyId] = useState<string | null>(null);

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

  const fetchReplies = async () => {
    const { data } = await supabase
      .from("review_replies")
      .select("*")
      .order("created_at", { ascending: true });

    setReplies(data || []);
  };

  // ✅ [추가 2] 갤러리 이미지 불러오기 — place_images 테이블 연동
  const fetchGalleryImages = async () => {
    const { data } = await supabase
      .from("place_images")
      .select("id, image_url")
      .eq("place_id", placeId)
      .order("id", { ascending: true });
    setGalleryImages(data || []);
  };

  // ✅ [추가 3] 갤러리 이미지 업로드
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !placeId) return;
    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `place_${placeId}_${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("place-images")
        .upload(fileName, file, { upsert: true });
      if (uploadError) { console.error(uploadError); alert("업로드 실패: " + uploadError.message); return; }
      const { data: urlData } = supabase.storage
        .from("place-images")
        .getPublicUrl(fileName);
      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) return;
      const { error: insertError } = await supabase
        .from("place_images")
        .insert([{ place_id: placeId, image_url: publicUrl }]);
      if (insertError) { console.error(insertError); return; }
      await fetchGalleryImages();
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
      await fetchReplies();
      await fetchGalleryImages(); // ✅ [추가 4] 갤러리 이미지 로딩

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

  const handleReplySubmit = async (reviewId: string) => {
    if (!replyContent.trim()) return;

    const { error } = await supabase
      .from("review_replies")
      .insert([
        {
          review_id: reviewId,
          nickname: myNickname,
          password: replyPassword || null,
          content: replyContent,
        },
      ]);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setReplyContent("");
    setReplyPassword("");
    setReplyingId(null);

    await fetchReplies();
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
        prev.map((r) =>
          r.id === reviewId
            ? {
                ...r,
                deleted: true,
                content: "삭제된 댓글입니다.",
              }
            : r
        )
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

  const likeReply = async (replyId: string) => {
    const userKey = getUserKey();

    const reply = replies.find((r) => r.id === replyId);
    if (!reply) return;

    const isLiked = likedReplyIds.has(String(replyId));

    if (isLiked) {
      await supabase
        .from("reply_likes")
        .delete()
        .eq("reply_id", replyId)
        .eq("user_key", userKey);

      const newLikes = Math.max(0, (reply.likes || 0) - 1);

      await supabase
        .from("review_replies")
        .update({ likes: newLikes })
        .eq("id", replyId);

      setReplies((prev) =>
        prev.map((r) =>
          r.id === replyId
            ? { ...r, likes: newLikes }
            : r
        )
      );

      setLikedReplyIds((prev) => {
        const next = new Set(prev);
        next.delete(String(replyId));
        return next;
      });
    } else {
      await supabase
        .from("reply_likes")
        .insert([
          {
            reply_id: replyId,
            user_key: userKey,
          },
        ]);

      const newLikes = (reply.likes || 0) + 1;

      await supabase
        .from("review_replies")
        .update({ likes: newLikes })
        .eq("id", replyId);

      setReplies((prev) =>
        prev.map((r) =>
          r.id === replyId
            ? { ...r, likes: newLikes }
            : r
        )
      );

      setLikedReplyIds(
        (prev) => new Set(prev).add(String(replyId))
      );
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

  const handleReplyEdit = async (replyId: string) => {
    const reply = replies.find((r) => r.id === replyId);

    if (!reply) return;

    if (
      reply.password &&
      reply.password !== editReplyPassword
    ) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    const { error } = await supabase
      .from("review_replies")
      .update({
        content: editReplyContent,
      })
      .eq("id", replyId);

    if (error) {
      console.error(error);
      return;
    }

    setReplies((prev) =>
      prev.map((r) =>
        r.id === replyId
          ? {
              ...r,
              content: editReplyContent,
            }
          : r
      )
    );

    setEditingReplyId(null);
    setEditReplyContent("");
    setEditReplyPassword("");
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
    const { error } = await supabase.from("reviews").update({deleted: true, content: "삭제된 댓글입니다.", }).eq("id", reviewId)
    if (error) { console.error(error); return; }
    setDeletingId(null);
  };

  const handleReplyDelete = async (replyId: string) => {
    const reply = replies.find((r) => r.id === replyId);

    if (!reply) return;

    if (
      reply.password &&
      reply.password !== deleteReplyPassword
    ) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    const { error } = await supabase
      .from("review_replies")
      .delete()
      .eq("id", replyId);

    if (error) {
      console.error(error);
      return;
    }

    setReplies((prev) =>
      prev.filter((r) => r.id !== replyId)
    );

    setDeletingReplyId(null);
    setDeleteReplyPassword("");
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

  // ================= 갤러리에 표시할 이미지 목록 =================
  // 기본 이미지(place.image_url)는 항상 첫 번째로, 추가 이미지는 그 뒤에
  const allGalleryImages = [
    { id: -1, image_url: place.image_url },
    ...galleryImages,
  ];

  // ================= 렌더 — 순수 콘텐츠만, wrapper 없음 =================
  return (
    <div style={{ padding: "4px 0 20px" }}>

      {/* ✅ 장소명 */}
      <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "2px", color: "#111" }}>
        {place.name}
      </h1>

      {/* ✅ [요구사항 1] 가게명 아래 주소 표시 */}
      <p style={{
        margin: "0 0 14px",
        fontSize: "13px",
        color: "#777",
        display: "flex",
        alignItems: "center",
        gap: "4px",
      }}>
        <MapPin size={13} color="#aaa" />
        {place.address}
      </p>

      {/* ✅ [요구사항 2] 가로 스크롤 이미지 갤러리 + + 버튼 */}
      <div style={{ position: "relative" }}>
        {/* 숨겨진 파일 입력 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageUpload}
        />

        {/* 가로 스크롤 컨테이너 */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            overflowX: "auto",
            paddingBottom: "8px",
            scrollbarWidth: "thin",
            scrollbarColor: "#ddd transparent",
          }}
        >
          {allGalleryImages.map((img) => (
            <div
              key={img.id}
              onClick={() => setSelectedImage(img.image_url)}
              style={{
                cursor: "pointer",
                flexShrink: 0,
                width: "160px",
                height: "160px",
                borderRadius: "14px",
                overflow: "hidden",
                border: "1px solid #eee",
              }}
            >
              <img
                src={img.image_url}
                alt="장소 이미지"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          ))}

          {/* + 버튼 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{
              flexShrink: 0,
              width: "160px",
              height: "160px",
              borderRadius: "14px",
              border: "2px dashed #ccc",
              background: "#fafafa",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              cursor: isUploading ? "default" : "pointer",
              color: "#999",
              fontSize: "12px",
            }}
          >
            {isUploading ? (
              <span style={{ fontSize: "13px", color: "#aaa" }}>업로드 중...</span>
            ) : (
              <>
                <Plus size={26} color="#bbb" />
                <span>사진 추가</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ✅ [요구사항 3] 정보 그리드 박스 레이아웃 */}
      <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "0" }}>

        {/* 카테고리 + 반려동물 구역 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #eee" }}>
          <div style={{ padding: "12px 14px", borderRight: "1px solid #eee" }}>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px", fontWeight: 600 }}>카테고리</div>
            <div style={{ fontSize: "14px", color: "#222", fontWeight: 500 }}>{place.category || "—"}</div>
          </div>
          <div style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px", fontWeight: 600 }}>동반 가능한 구역</div>
            <div style={{ fontSize: "14px", color: "#222", fontWeight: 500 }}>{place.pet_zone || "—"}</div>
          </div>
        </div>

        {/* 영업시간 + 대형견 가능 여부 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #eee" }}>
          <div style={{ padding: "12px 14px", borderRight: "1px solid #eee" }}>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px", fontWeight: 600, display: "flex", alignItems: "center", gap: "3px" }}>
              <Clock size={11} /> 영업시간
            </div>
            <div style={{ fontSize: "14px", color: "#222", fontWeight: 500 }}>{place.hours || "—"}</div>
          </div>
          <div style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px", fontWeight: 600 }}>대형견 가능 여부</div>
            <div style={{ fontSize: "14px", color: "#222", fontWeight: 500 }}>
              {place.large_dog ? "✅ 가능" : "❌ 불가"}
            </div>
          </div>
        </div>

        {/* 펫 메뉴 — 단일 박스 */}
        <div style={{ borderTop: "1px solid #eee", borderBottom: "1px solid #eee" }}>
          <div style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px", fontWeight: 600, display: "flex", alignItems: "center", gap: "3px" }}>
              <PawPrint size={11} /> 펫 메뉴
            </div>
            <div style={{ fontSize: "14px", color: "#222", fontWeight: 500 }}>{place.pet_menu || "—"}</div>
          </div>
        </div>
      </div>

      {/* ✅ [요구사항 4] 찜 / 추천 / 비추천 / 네이버지도 — 찜에 카운트 복원 */}
      <div style={{ display: "flex", gap: "8px", marginTop: "18px", alignItems: "center", flexWrap: "wrap" }}>

        {/* 찜 — bookmarkCount 다시 표시 */}
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
          <span style={{ fontSize: "13px", color: bookmarked ? "#ff3040" : "#555" }}>
            찜 {bookmarkCount}
          </span>
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
            추천 {likesCount}
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
            비추천 {dislikesCount}
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
          <span style={{ fontSize: "13px" }}>네이버 지도로 보기</span>
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "4fr 48px 6fr",
            gap: "10px",
            marginBottom: "10px",
            alignItems: "stretch",
          }}
        >
          {/* 닉네임 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "white",
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              overflow: "hidden",
            }}
          >

            {/* 닉네임 */}
            <div
              style={{
                fontSize: "14px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {myNickname}
            </div>
          </div>

          {/* 랜덤 닉네임 버튼 */}
          <button
            onClick={createRandomNickname}
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Shuffle size={18} />
          </button>

          {/* 비밀번호 */}
          <input
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
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
            <div
              key={r.id}
              style={{
                borderBottom: "1px solid #eee",
                padding: "12px 0",
              }}
            >
              {/* 댓글 상단 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                {/* 왼쪽 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {/* 프로필 */}
                  <div
                    style={{
                      width: "26px",
                      height: "26px",
                      borderRadius: "50%",
                      background: getProfileColor(r.nickname),
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {r.nickname?.charAt(0)}
                  </div>

                  {/* 닉네임 */}
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "14px",
                    }}
                  >
                    {r.nickname}
                  </div>

                  {/* 내 댓글 */}
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

                {/* 오른쪽 */}
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                  }}
                >
                  {/* 메뉴 버튼 */}
                  <button
                    onClick={() =>
                      setOpenedMenuId(
                        openedMenuId === r.id ? null : r.id
                      )
                    }
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <MoreVertical size={17} color="#777" />
                  </button>

                  {/* 드롭다운 */}
                  {openedMenuId === r.id && (
                    <div
                      style={{
                        position: "absolute",
                        top: "24px",
                        right: 0,
                        width: "120px",
                        background: "white",
                        border: "1px solid #eee",
                        borderRadius: "12px",
                        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                        overflow: "hidden",
                        zIndex: 5,
                      }}
                    >
                      {/* 신고 */}
                      <button
                        onClick={() => {
                          setReportingId(r.id);
                          setOpenedMenuId(null);
                        }}
                        style={{
                          width: "100%",
                          padding: "11px 14px",
                          border: "none",
                          background: "white",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: "13px",
                        }}
                      >
                        신고
                      </button>

                      {/* 수정 */}
                      <button
                        onClick={() => {
                          startEdit(r);
                          setOpenedMenuId(null);
                        }}
                        style={{
                          width: "100%",
                          padding: "11px 14px",
                          border: "none",
                          background: "white",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: "13px",
                        }}
                      >
                        수정
                      </button>

                      {/* 삭제 */}
                      <button
                        onClick={() => {
                          startDelete(r.id);
                          setOpenedMenuId(null);
                        }}
                        style={{
                          width: "100%",
                          padding: "11px 14px",
                          border: "none",
                          background: "white",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: "13px",
                          color: "#ef4444",
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 댓글 내용 */}
              {editingId === r.id ? (
                <div style={{ marginTop: "8px" }}>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={{
                      width: "100%",
                      minHeight: "60px",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid #ddd",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />

                  {!isOwner(r) && (
                    <input
                      placeholder="비밀번호 입력"
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      style={{
                        marginTop: "6px",
                        width: "100%",
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
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
                      onClick={() => handleEdit(r.id)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        border: "none",
                        background: "#111",
                        color: "white",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      저장하기
                    </button>

                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        background: "white",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: "5px",
                    fontSize: "14px",
                    fontStyle: r.deleted ? "italic" : "normal",
                    opacity: r.deleted ? 0.6 : 1,
                    color: "#333",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {r.content}
                </div>
              )}

              {/* 댓글 하단 */}
              {!r.deleted && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "10px",
                  }}
                >
                  {/* 왼쪽 */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                    }}
                  >
                    {/* 좋아요 */}
                    <button
                      onClick={() => likeReview(r.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <Heart
                        size={16}
                        color={
                          likedReviewIds.has(String(r.id))
                            ? "#ef4444"
                            : "#bbb"
                        }
                        fill={
                          likedReviewIds.has(String(r.id))
                            ? "#ef4444"
                            : "none"
                        }
                      />

                      <span
                        style={{
                          fontSize: "13px",
                          color: "#666",
                        }}
                      >
                        {r.likes || 0}
                      </span>
                    </button>

                    {/* 답글 */}
                    <button
                      onClick={() =>
                        setReplyingId(
                          replyingId === r.id ? null : r.id
                        )
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        color: "#666",
                        fontSize: "13px",
                      }}
                    >
                      <MessageCircle size={16} />
                      답글
                    </button>
                  </div>

                  {/* 날짜 */}
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#999",
                    }}
                  >
                    {formatDate(r.created_at)}
                  </span>
                </div>
              )}
              

              {/* 답글 입력 */}
              {replyingId === r.id && (
                <div
                  style={{
                    marginTop: "12px",
                    marginLeft: "34px",
                    padding: "12px",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  {/* 상단 입력 영역 */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "4fr 48px 6fr",
                      gap: "10px",
                      marginBottom: "10px",
                      alignItems: "stretch",
                    }}
                  >
                    {/* 닉네임 */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        background: "white",
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        overflow: "hidden",
                        fontSize: "14px",
                      }}
                    >
                      {myNickname}
                    </div>

                    {/* 랜덤 닉네임 버튼 */}
                    <button
                      onClick={createRandomNickname}
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        background: "white",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Shuffle size={18} />
                    </button>

                    {/* 비밀번호 */}
                    <input
                      placeholder="비밀번호"
                      type="password"
                      value={replyPassword}
                      onChange={(e) =>
                        setReplyPassword(e.target.value)
                      }
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  {/* 답글 입력 */}
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                    }}
                  >
                    <textarea
                      placeholder="답글을 입력하세요"
                      value={replyContent}
                      onChange={(e) =>
                        setReplyContent(e.target.value)
                      }
                      style={{
                        flex: 1,
                        minHeight: "72px",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        resize: "none",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                    />

                    <button
                      disabled={
                        !replyContent.trim() ||
                        !replyPassword.trim()
                      }
                      onClick={() => handleReplySubmit(r.id)}
                      style={{
                        width: "80px",
                        borderRadius: "8px",
                        border: "none",
                        background:
                          !replyContent.trim() ||
                          !replyPassword.trim()
                            ? "#ccc"
                            : "#111",
                        color: "white",
                        cursor:
                          !replyContent.trim() ||
                          !replyPassword.trim()
                            ? "default"
                            : "pointer",
                        fontSize: "13px",
                        fontWeight: 600,
                      }}
                    >
                      등록
                    </button>
                  </div>
                </div>
              )}

              {/* 답글 리스트 */}
              {replies
                .filter((reply) => reply.review_id === r.id)
                .map((reply) => (
                  <div
                    key={reply.id}
                    style={{
                      marginLeft: "34px",
                      marginTop: "10px",
                      padding: "10px 12px",
                      background: "#f8fafc",
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {/* 상단 */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      {/* 왼쪽 */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        {/* 프로필 */}
                        <div
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: getProfileColor(reply.nickname),
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          {reply.nickname?.charAt(0)}
                        </div>

                        {/* 닉네임 */}
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 700,
                          }}
                        >
                          {reply.nickname}
                        </div>
                      </div>

                      {/* 오른쪽 */}
                      <div
                        style={{
                          position: "relative",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                        }}
                      >
                        {/* 메뉴 버튼 */}
                        <button
                          onClick={() =>
                            setOpenedReplyMenuId(
                              openedReplyMenuId === reply.id
                                ? null
                                : reply.id
                            )
                          }
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          <MoreVertical size={15} color="#777" />
                        </button>

                        {/* 드롭다운 */}
                        {openedReplyMenuId === reply.id && (
                          <div
                            style={{
                              position: "absolute",
                              top: "22px",
                              right: 0,
                              width: "110px",
                              background: "white",
                              border: "1px solid #eee",
                              borderRadius: "12px",
                              boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                              overflow: "hidden",
                              zIndex: 5,
                            }}
                          >
                            {/* 신고 */}
                            <button
                              onClick={() => {
                                setReportingReplyId(reply.id);
                                setOpenedReplyMenuId(null);
                              }}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                border: "none",
                                background: "white",
                                cursor: "pointer",
                                textAlign: "left",
                                fontSize: "12px",
                              }}
                            >
                              신고
                            </button>

                            {/* 수정 */}
                            <button
                              onClick={() => {
                                setEditingReplyId(reply.id);
                                setEditReplyContent(reply.content);
                                setOpenedReplyMenuId(null);
                              }}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                border: "none",
                                background: "white",
                                cursor: "pointer",
                                textAlign: "left",
                                fontSize: "12px",
                              }}
                            >
                              수정
                            </button>

                            {/* 삭제 */}
                            <button
                              onClick={() => {
                                setDeletingReplyId(reply.id);
                                setOpenedReplyMenuId(null);
                              }}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                border: "none",
                                background: "white",
                                cursor: "pointer",
                                textAlign: "left",
                                fontSize: "12px",
                                color: "#ef4444",
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 내용 */}
                    {editingReplyId === reply.id ? (
                      <div style={{ marginTop: "8px" }}>
                        <textarea
                          value={editReplyContent}
                          onChange={(e) =>
                            setEditReplyContent(e.target.value)
                          }
                          style={{
                            width: "100%",
                            minHeight: "60px",
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #ddd",
                            fontSize: "13px",
                            boxSizing: "border-box",
                          }}
                        />

                        <input
                          placeholder="비밀번호 입력"
                          type="password"
                          value={editReplyPassword}
                          onChange={(e) =>
                            setEditReplyPassword(e.target.value)
                          }
                          style={{
                            marginTop: "6px",
                            width: "100%",
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #ddd",
                            fontSize: "13px",
                            boxSizing: "border-box",
                          }}
                        />

                        <div
                          style={{
                            marginTop: "8px",
                            display: "flex",
                            gap: "8px",
                          }}
                        >
                          <button
                            onClick={() =>
                              handleReplyEdit(reply.id)
                            }
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "none",
                              background: "#111",
                              color: "white",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            저장
                          </button>

                          <button
                            onClick={() =>
                              setEditingReplyId(null)
                            }
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid #ddd",
                              background: "white",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "13px",
                          lineHeight: 1.5,
                          color: "#333",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {reply.content}
                      </div>
                    )}

                    {/* 답글 하단 */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "8px",
                      }}
                    >
                      {/* 좋아요 */}
                      <button
                        onClick={() => likeReply(reply.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <Heart
                          size={14}
                          color={
                            likedReplyIds.has(String(reply.id))
                              ? "#ef4444"
                              : "#bbb"
                          }
                          fill={
                            likedReplyIds.has(String(reply.id))
                              ? "#ef4444"
                              : "none"
                          }
                        />

                        <span
                          style={{
                            fontSize: "12px",
                            color: "#666",
                          }}
                        >
                          {reply.likes || 0}
                        </span>
                      </button>

                      {/* 날짜 */}
                      <span
                        style={{
                          fontSize: "10px",
                          color: "#999",
                        }}
                      >
                        {formatDate(reply.created_at)}
                      </span>
                    </div>

                    {/* 답글 삭제 확인 */}
                    {deletingReplyId === reply.id && (
                      <div
                        style={{
                          marginTop: "8px",
                          background: "#fff3f3",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #fecaca",
                        }}
                      >
                        <p
                          style={{
                            margin: "0 0 8px",
                            fontSize: "12px",
                            color: "#c00",
                          }}
                        >
                          정말 삭제하시겠습니까?
                        </p>

                        {/* 비밀번호 */}
                        <input
                          placeholder="비밀번호 입력"
                          type="password"
                          value={deleteReplyPassword}
                          onChange={(e) =>
                            setDeleteReplyPassword(e.target.value)
                          }
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #ddd",
                            fontSize: "13px",
                            marginBottom: "8px",
                            boxSizing: "border-box",
                          }}
                        />

                        {/* 버튼 */}
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                          }}
                        >
                          {/* 삭제 */}
                          <button
                            onClick={() =>
                              handleReplyDelete(reply.id)
                            }
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "none",
                              background: "#ef4444",
                              color: "white",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            삭제하기
                          </button>

                          {/* 취소 */}
                          <button
                            onClick={() => {
                              setDeletingReplyId(null);
                              setDeleteReplyPassword("");
                            }}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid #ddd",
                              background: "white",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 답글 신고 확인 */}
                    {reportingReplyId === reply.id && (
                      <div
                        style={{
                          marginTop: "8px",
                          background: "#fff7ed",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #fed7aa",
                        }}
                      >
                        <p
                          style={{
                            margin: "0 0 8px",
                            fontSize: "12px",
                            color: "#c2410c",
                          }}
                        >
                          신고를 하시겠습니까?
                        </p>

                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                          }}
                        >
                          <button
                            onClick={() => {
                              alert("신고가 접수되었습니다.");
                              setReportingReplyId(null);
                            }}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "none",
                              background: "#ef4444",
                              color: "white",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            신고하기
                          </button>

                          <button
                            onClick={() =>
                              setReportingReplyId(null)
                            }
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid #ddd",
                              background: "white",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            아니요
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 신고 확인 */}
                    {reportingId === r.id && (
                      <div
                        style={{
                          marginTop: "8px",
                          background: "#fff8f0",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid #ffe0b2",
                        }}
                      >
                        <p
                          style={{
                            margin: "0 0 8px",
                            fontSize: "13px",
                            color: "#b45309",
                          }}
                        >
                          신고를 하시겠습니까?
                        </p>

                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                          }}
                        >
                          {/* 신고하기 */}
                          <button
                            onClick={() => {
                              alert("신고가 접수되었습니다.");
                              setReportingId(null);
                            }}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "6px",
                              border: "none",
                              background: "#ef4444",
                              color: "white",
                              cursor: "pointer",
                              fontSize: "13px",
                            }}
                          >
                            신고하기
                          </button>

                          {/* 아니요 */}
                          <button
                            onClick={() => setReportingId(null)}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "6px",
                              border: "1px solid #ddd",
                              background: "white",
                              cursor: "pointer",
                              fontSize: "13px",
                            }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

              {/* 삭제 확인 */}
              {deletingId === r.id && (
                <div
                  style={{
                    marginTop: "8px",
                    background: "#fff3f3",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #fecaca",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: "13px",
                      color: "#c00",
                    }}
                  >
                    정말 삭제하시겠습니까?
                  </p>

                  {!isOwner(r) && (
                    <input
                      placeholder="비밀번호 입력"
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        fontSize: "14px",
                        marginBottom: "8px",
                        boxSizing: "border-box",
                      }}
                    />
                  )}

                  {/* 비밀번호 */}
                  <input
                    placeholder="비밀번호 입력"
                    type="password"
                    value={deletePassword}
                    onChange={(e) =>
                      setDeletePassword(e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid #ddd",
                      fontSize: "14px",
                      marginBottom: "8px",
                      boxSizing: "border-box",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                    }}
                  >
                    <button
                      onClick={() => handleDelete(r.id)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        border: "none",
                        background: "#ef4444",
                        color: "white",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      삭제하기
                    </button>

                    <button
                      onClick={() => {
                        setDeletingId(null);
                        setDeletePassword("");
                      }}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        background: "white",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>

      {/* 이미지 확대 모달 */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.82)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          {/* 이미지 wrapper */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              display: "inline-block",
            }}
          >
            {/* 이미지 우측 상단 닫기 버튼 */}
            <button
              onClick={() => setSelectedImage(null)}
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                width: "38px",
                height: "38px",
                borderRadius: "50%",
                border: "none",
                background: "rgba(0,0,0,0.55)",
                color: "white",
                fontSize: "18px",
                cursor: "pointer",
                zIndex: 2,
                backdropFilter: "blur(4px)",
              }}
            >
              ✕
            </button>

            <img
              src={selectedImage}
              alt="확대 이미지"
              style={{
                maxWidth: "95vw",
                maxHeight: "90vh",
                borderRadius: "16px",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}