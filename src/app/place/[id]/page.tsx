"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import {
  Heart,
  ThumbsUp,
  ThumbsDown,
  MoreVertical,
  MessageCircle,
  Shuffle,
  MapPin,
  Clock,
  PawPrint,
  Plus,
  ExternalLink,
  ImageOff,
  ChefHat,
  LandPlot,
  Dog,
  Bone,
  Shield,   // ← 추가: 관리자 삭제 아이콘
} from "lucide-react";

// ── 폰트 (Pretendard 제목/로고 + Noto Sans KR 본문)
const FONT_STYLE = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  .ggk-title { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
  .ggk-body  { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }
`;

const adjectives = ["행복한","귀여운","용감한","졸린","말랑한","똑똑한","신난","배고픈"];
const animals    = ["강아지","고양이","햄스터","토끼","리트리버","푸들","치와와","코기"];

const profileColors = [
  "#FF6B6B","#F06595","#CC5DE8","#845EF7","#5C7CFA","#339AF0","#22B8CF","#20C997",
  "#51CF66","#94D82D","#FCC419","#FF922B","#E64980","#BE4BDB","#7950F2","#4C6EF5",
  "#228BE6","#15AABF","#12B886","#40C057","#82C91E","#FAB005","#FD7E14","#FA5252",
  "#D6336C","#AE3EC9","#7048E8","#4263EB","#1C7ED6","#1098AD","#0CA678","#37B24D",
  "#74B816","#F59F00","#F76707",
];

const getProfileColor = (nickname: string) => {
  if (!nickname) return "#999";
  const charCode = nickname.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return profileColors[charCode % profileColors.length];
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const yy  = String(date.getFullYear()).slice(2);
  const mm  = String(date.getMonth() + 1).padStart(2, "0");
  const dd  = String(date.getDate()).padStart(2, "0");
  const hh  = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${min}`;
};

const sortBtn = (active: boolean) => ({
  padding: "5px 11px",
  borderRadius: "8px",
  border: "none",
  background: active
    ? "linear-gradient(145deg, #2a2a2a, #111)"
    : "linear-gradient(145deg, #f5f6f8, #eaebee)",
  color: active ? "white" : "#555",
  cursor: "pointer",
  marginLeft: "5px",
  fontSize: "11px",
  fontWeight: 600,
  boxShadow: active
    ? "0 1px 5px rgba(0,0,0,0.22)"
    : "0 1px 3px rgba(0,0,0,0.07)",
  transition: "all 0.15s ease",
  fontFamily: "'Noto Sans KR', sans-serif",
});

const generateRandomNickname = () => {
  const adj    = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num    = Math.floor(1000 + Math.random() * 9000);
  return `${adj}${animal}${num}`;
};

const getUserKey = () => {
  if (typeof window === "undefined") return "";
  let key = localStorage.getItem("user_key");
  if (!key) { key = crypto.randomUUID(); localStorage.setItem("user_key", key); }
  return key;
};

type VoteReaction = "like" | "dislike" | null;

const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const MAX_PX  = 1200;
    const QUALITY = 0.85;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) { height = Math.round((height * MAX_PX) / width); width = MAX_PX; }
        else { width = Math.round((width * MAX_PX) / height); height = MAX_PX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas context 없음")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error("압축 실패")); }, "image/jpeg", QUALITY);
    };
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = objectUrl;
  });
};

export default function PlaceDetail() {
  const params  = useParams();
  const router  = useRouter();
  const placeId = Number(params.id);

  const [place, setPlace]             = useState<any>(null);
  const [reviews, setReviews]         = useState<any[]>([]);
  const [session, setSession]         = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin]         = useState(false); // ★ 관리자 상태 추가
  const isLoggedIn = !!session?.user;

  const [myNickname, setMyNickname] = useState("");
  const [password, setPassword]     = useState("");
  const [content, setContent]       = useState("");
  const [sort, setSort]             = useState<"latest" | "like">("latest");

  const [bookmarked, setBookmarked]       = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);

  const [voteReaction, setVoteReaction]   = useState<VoteReaction>(null);
  const [likesCount, setLikesCount]       = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);

  const [likedReviewIds, setLikedReviewIds] = useState<Set<string>>(new Set());

  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editContent, setEditContent]   = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

  const [galleryImages, setGalleryImages] = useState<{ id: number; image_url: string }[]>([]);
  const [isUploading, setIsUploading]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollRef               = useRef<HTMLDivElement>(null);
  const isProcessingRef         = useRef(false);
  const isBookmarkProcessingRef = useRef(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [openedMenuId, setOpenedMenuId]   = useState<string | null>(null);
  const [reportingId, setReportingId]     = useState<string | null>(null);

  const [replyingId, setReplyingId]       = useState<string | null>(null);
  const [replyContent, setReplyContent]   = useState("");
  const [replyPassword, setReplyPassword] = useState("");
  const [replies, setReplies]             = useState<any[]>([]);

  const [likedReplyIds, setLikedReplyIds]   = useState<Set<string>>(new Set());
  const [reportCategory, setReportCategory] = useState("");
  const [reportReason, setReportReason]     = useState("");

  const [reportTargetType, setReportTargetType] = useState<"review" | "reply" | null>(null);
  const [reportTargetId, setReportTargetId]     = useState<string | null>(null);

  const [openedReplyMenuId, setOpenedReplyMenuId]   = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId]         = useState<string | null>(null);
  const [editReplyContent, setEditReplyContent]     = useState("");
  const [editReplyPassword, setEditReplyPassword]   = useState("");
  const [deletingReplyId, setDeletingReplyId]       = useState<string | null>(null);
  const [deleteReplyPassword, setDeleteReplyPassword] = useState("");
  const [reportingReplyId, setReportingReplyId]     = useState<string | null>(null);

  // ── 랜덤 닉네임
  const createRandomNickname = async () => {
    const userKey = getUserKey();
    let created = false;
    while (!created) {
      const randomNickname = generateRandomNickname();
      const { error } = await supabase.from("users").upsert(
        [{ user_key: userKey, nickname: randomNickname }],
        { onConflict: "user_key" }
      );
      if (!error) { setMyNickname(randomNickname); created = true; }
    }
  };

  // ── 리뷰 불러오기
  const fetchReviews = async () => {
    const { data: reviewData } = await supabase
      .from("reviews")
      .select("id, nickname, content, likes, created_at, auth_user_id, user_key, deleted, is_edited, is_admin_deleted, avatar_url")
      .eq("place_id", placeId)
      .order("id", { ascending: false });
    if (!reviewData) { setReviews([]); return; }
    const authIds = [...new Set(reviewData.map((r) => r.auth_user_id).filter(Boolean))];
    const needsAvatarLookup = reviewData.some(r => !r.avatar_url && r.auth_user_id);
    if (needsAvatarLookup && authIds.length > 0) {
      const { data: userData } = await supabase.from("users").select("auth_user_id, avatar_url").in("auth_user_id", authIds);
      const avatarMap = Object.fromEntries((userData || []).map(u => [u.auth_user_id, u.avatar_url]));
      setReviews(reviewData.map(r => ({ ...r, avatar_url: r.avatar_url || avatarMap[r.auth_user_id] || null })));
    } else { setReviews(reviewData); }
  };

  const fetchReplies = async () => {
    const { data: reviewIds } = await supabase.from("reviews").select("id").eq("place_id", placeId);
    if (!reviewIds || reviewIds.length === 0) { setReplies([]); return; }
    const ids = reviewIds.map((r) => r.id);
    const { data: replyData2 } = await supabase.from("review_replies").select("*").in("review_id", ids).order("created_at", { ascending: true });
    if (!replyData2) { setReplies([]); return; }
    const authIds = replyData2.map((r) => r.auth_user_id).filter(Boolean);
    const { data: userData } = authIds.length > 0
      ? await supabase.from("users").select("auth_user_id, avatar_url").in("auth_user_id", authIds)
      : { data: [] };
    const merged = replyData2.map((r) => ({ ...r, avatar_url: r.avatar_url || userData?.find((u) => u.auth_user_id === r.auth_user_id)?.avatar_url || null }));
    setReplies(merged);
  };

  const fetchGalleryImages = async () => {
    const { data, error } = await supabase.from("place_images").select("id, image_url").eq("place_id", placeId).order("id", { ascending: true });
    setGalleryImages(data || []);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !placeId) return;
    if (!file.type.startsWith("image/")) { alert("이미지 파일만 업로드 가능합니다."); return; }
    if (file.size > 10 * 1024 * 1024) { alert("10MB 이하의 이미지만 업로드 가능합니다."); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      const fileName = `place_${placeId}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("place-images").upload(fileName, compressed, { contentType: "image/jpeg", upsert: false });
      if (uploadError) { alert("업로드 실패: " + uploadError.message); return; }
      const { data: urlData } = supabase.storage.from("place-images").getPublicUrl(fileName);
      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) { alert("URL 생성 실패"); return; }
      const { error: insertError } = await supabase.from("place_images").insert([{ place_id: placeId, image_url: publicUrl }]);
      if (insertError) { console.error(insertError); return; }
      await fetchGalleryImages();
      alert("이미지가 성공적으로 업로드 되었습니다!");
    } catch (err) {
      console.error("이미지 처리 오류:", err);
      alert("이미지 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── 로그인 세션 + 관리자 체크 ★
  useEffect(() => {
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session?.user) {
        const { data } = await supabase.from("users").select("*").eq("auth_user_id", session.user.id).single();
        setUserProfile(data);
        setIsAdmin(!!data?.is_admin); // ★ 관리자 여부 세팅
      }
    };
    loadSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s?.user) {
        const { data } = await supabase.from("users").select("*").eq("auth_user_id", s.user.id).single();
        setUserProfile(data);
        setIsAdmin(!!data?.is_admin); // ★
      } else {
        setUserProfile(null);
        setIsAdmin(false); // ★
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── 데이터 로딩
  useEffect(() => {
    const fetchData = async () => {
      if (!placeId) return;
      const { data: placeData } = await supabase.from("places").select("*").eq("id", placeId).single();
      setPlace(placeData);
      await Promise.all([fetchReviews(), fetchReplies(), fetchGalleryImages()]);
      const userKey = getUserKey();
      const currentSession = (await supabase.auth.getSession()).data.session;
      if (currentSession?.user) {
        const { data: dbUser } = await supabase.from("users").select("nickname").eq("auth_user_id", currentSession.user.id).maybeSingle();
        if (dbUser?.nickname) { setMyNickname(dbUser.nickname); }
        else {
          const nickname = currentSession.user.user_metadata?.full_name || currentSession.user.user_metadata?.preferred_username || currentSession.user.user_metadata?.nickname || currentSession.user.user_metadata?.name || currentSession.user.email?.split("@")[0] || "사용자";
          setMyNickname(nickname);
          await supabase.from("users").upsert([{ auth_user_id: currentSession.user.id, email: currentSession.user.email || "", nickname }], { onConflict: "auth_user_id" });
        }
      } else {
        const { data: existingUser } = await supabase.from("users").select("*").eq("user_key", userKey).maybeSingle();
        if (!existingUser) { await createRandomNickname(); } else { setMyNickname(existingUser.nickname); }
      }
      const [{ count: fetchedLikes }, { count: fetchedDislikes }, { count: fetchedBookmarks }, { data: fetchedMyReactions }] = await Promise.all([
        supabase.from("reactions").select("*", { count: "exact", head: true }).eq("place_id", placeId).eq("type", "like"),
        supabase.from("reactions").select("*", { count: "exact", head: true }).eq("place_id", placeId).eq("type", "dislike"),
        supabase.from("reactions").select("*", { count: "exact", head: true }).eq("place_id", placeId).eq("type", "bookmark"),
        supabase.from("reactions").select("type").eq("place_id", placeId).eq("user_key", userKey),
      ]);
      setLikesCount(fetchedLikes || 0);
      setDislikesCount(fetchedDislikes || 0);
      setBookmarkCount(fetchedBookmarks || 0);
      const myBookmark = fetchedMyReactions?.find((r) => r.type === "bookmark");
      const myVote = fetchedMyReactions?.find((r) => r.type === "like" || r.type === "dislike");
      setBookmarked(!!myBookmark);
      setVoteReaction((myVote?.type as VoteReaction) ?? null);
      const { data: myLikes } = await supabase.from("review_likes").select("review_id").eq("user_key", userKey);
      setLikedReviewIds(new Set((myLikes || []).map((l) => String(l.review_id))));
    };
    fetchData();
  }, [placeId]);

  // ── ★ 관리자 댓글/답글 삭제
  const handleAdminDeleteReview = async (reviewId: string) => {
    if (!confirm("관리자 권한으로 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("reviews").update({
      is_admin_deleted: true,
      content: "부적절한 내용으로 관리자에 의해 삭제되었습니다.",
    }).eq("id", reviewId);
    if (error) { console.error(error); return; }
    setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, is_admin_deleted: true, content: "부적절한 내용으로 관리자에 의해 삭제되었습니다." } : r));
    setOpenedMenuId(null);
  };

  const handleAdminDeleteReply = async (replyId: string) => {
    if (!confirm("관리자 권한으로 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("review_replies").update({
      is_admin_deleted: true,
      content: "부적절한 내용으로 관리자에 의해 삭제되었습니다.",
    }).eq("id", replyId);
    if (error) { console.error(error); return; }
    setReplies((prev) => prev.map((r) => r.id === replyId ? { ...r, is_admin_deleted: true, content: "부적절한 내용으로 관리자에 의해 삭제되었습니다." } : r));
    setOpenedReplyMenuId(null);
  };

  // ── 댓글 등록
  const handleSubmit = async () => {
    if (!myNickname || !content) return;
    if (!session && !password) return;
    const userKey    = getUserKey();
    const authUserId = session?.user?.id ?? null;
    const { error } = await supabase.from("reviews").insert([{ place_id: placeId, nickname: myNickname, password: isLoggedIn ? null : password, content, likes: 0, user_key: isLoggedIn ? null : userKey, auth_user_id: authUserId }]);
    if (error) { console.error(error); alert(error.message); return; }
    setContent("");
    await fetchReviews();
  };

  const handleReplySubmit = async (reviewId: string) => {
    if (!replyContent.trim()) return;
    if (!isLoggedIn && !replyPassword.trim()) return;
    const userKey = getUserKey();
    const { error } = await supabase.from("review_replies").insert([{ review_id: reviewId, nickname: myNickname, password: isLoggedIn ? null : replyPassword, content: replyContent, auth_user_id: session?.user?.id ?? null, user_key: isLoggedIn ? null : userKey }]);
    if (error) { console.error(error); alert(error.message); return; }
    setReplyContent(""); setReplyPassword(""); setReplyingId(null);
    await fetchReplies();
  };

  const likeReview = async (reviewId: string) => {
    const userKey = getUserKey();
    const review  = reviews.find((r) => r.id === reviewId);
    if (!review) return;
    const isLiked = likedReviewIds.has(String(reviewId));
    if (isLiked) {
      await supabase.from("review_likes").delete().eq("review_id", reviewId).eq("user_key", userKey);
      const newLikes = Math.max(0, (review.likes || 0) - 1);
      await supabase.from("reviews").update({ likes: newLikes }).eq("id", reviewId);
      setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, likes: newLikes } : r));
      setLikedReviewIds((prev) => { const next = new Set(prev); next.delete(String(reviewId)); return next; });
    } else {
      await supabase.from("review_likes").insert([{ review_id: reviewId, user_key: userKey }]);
      const newLikes = (review.likes || 0) + 1;
      await supabase.from("reviews").update({ likes: newLikes }).eq("id", reviewId);
      setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, likes: newLikes } : r));
      setLikedReviewIds((prev) => new Set(prev).add(String(reviewId)));
    }
  };

  const likeReply = async (replyId: string) => {
    const userKey = getUserKey();
    const reply   = replies.find((r) => r.id === replyId);
    if (!reply) return;
    const isLiked = likedReplyIds.has(String(replyId));
    if (isLiked) {
      await supabase.from("reply_likes").delete().eq("reply_id", replyId).eq("user_key", userKey);
      const newLikes = Math.max(0, (reply.likes || 0) - 1);
      await supabase.from("review_replies").update({ likes: newLikes }).eq("id", replyId);
      setReplies((prev) => prev.map((r) => r.id === replyId ? { ...r, likes: newLikes } : r));
      setLikedReplyIds((prev) => { const next = new Set(prev); next.delete(String(replyId)); return next; });
    } else {
      await supabase.from("reply_likes").insert([{ reply_id: replyId, user_key: userKey }]);
      const newLikes = (reply.likes || 0) + 1;
      await supabase.from("review_replies").update({ likes: newLikes }).eq("id", replyId);
      setReplies((prev) => prev.map((r) => r.id === replyId ? { ...r, likes: newLikes } : r));
      setLikedReplyIds((prev) => new Set(prev).add(String(replyId)));
    }
  };

  const closeAll = () => {
    setOpenedMenuId(null); setEditingId(null); setDeletingId(null); setReportingId(null);
    setOpenedReplyMenuId(null); setEditingReplyId(null); setDeletingReplyId(null);
    setReportingReplyId(null); setReplyingId(null);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => closeAll();
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const isOwner = (review: any): boolean => {
    if (session) return session.user.id === review.auth_user_id;
    return review.user_key === getUserKey();
  };
  const isOwnerReply = (reply: any): boolean => {
    if (session) return session.user.id === reply.auth_user_id;
    return reply.user_key === getUserKey();
  };

  const startEdit   = (review: any) => { setEditingId(review.id); setEditContent(review.content); setEditPassword(""); setDeletingId(null); };
  const startDelete = (reviewId: string) => { setDeletingId(reviewId); setDeletePassword(""); setEditingId(null); };

  const handleEdit = async (reviewId: string) => {
    const review = reviews.find((r) => r.id === reviewId);
    if (!review || !editContent.trim()) return;
    if (!session && editPassword !== review.password) { alert("비밀번호가 일치하지 않습니다."); return; }
    const { error } = await supabase.from("reviews").update({ content: editContent, is_edited: true }).eq("id", reviewId);
    if (error) { console.error(error); return; }
    setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, content: editContent, is_edited: true } : r));
    setEditingId(null);
  };

  const handleReplyEdit = async (replyId: string) => {
    const reply = replies.find((r) => r.id === replyId);
    if (!reply) return;
    if (!isLoggedIn && reply.password && reply.password !== editReplyPassword) { alert("비밀번호가 일치하지 않습니다."); return; }
    const { error } = await supabase.from("review_replies").update({ content: editReplyContent, is_edited: true }).eq("id", replyId);
    if (error) { console.error(error); return; }
    setReplies((prev) => prev.map((r) => r.id === replyId ? { ...r, content: editReplyContent, is_edited: true } : r));
    setEditingReplyId(null); setEditReplyContent(""); setEditReplyPassword("");
  };

  const handleDelete = async (reviewId: string) => {
    const review = reviews.find((r) => r.id === reviewId);
    if (!review) return;
    if (!session && deletePassword !== review.password) { alert("비밀번호가 일치하지 않습니다."); return; }
    const { error } = await supabase.from("reviews").update({ deleted: true, content: "삭제된 댓글입니다." }).eq("id", reviewId);
    if (error) { console.error(error); return; }
    setDeletingId(null);
    await fetchReviews();
  };

  const handleReplyDelete = async (replyId: string) => {
    const reply = replies.find((r) => r.id === replyId);
    if (!reply) return;
    if (!isLoggedIn && reply.password && reply.password !== deleteReplyPassword) { alert("비밀번호가 일치하지 않습니다."); return; }
    const { error } = await supabase.from("review_replies").delete().eq("id", replyId);
    if (error) { console.error(error); return; }
    setReplies((prev) => prev.filter((r) => r.id !== replyId));
    setDeletingReplyId(null); setDeleteReplyPassword("");
  };

  const handleBookmark = async () => {
    if (!session) { router.push(`/login?redirect=/place/${placeId}`); return; }
    if (isBookmarkProcessingRef.current) return;
    isBookmarkProcessingRef.current = true;
    try {
      const userKey = getUserKey();
      if (bookmarked) {
        await supabase.from("reactions").delete().eq("place_id", placeId).eq("user_key", userKey).eq("type", "bookmark");
        setBookmarked(false); setBookmarkCount((prev) => Math.max(0, prev - 1));
      } else {
        await supabase.from("reactions").insert([{ place_id: placeId, user_key: userKey, type: "bookmark" }]);
        setBookmarked(true); setBookmarkCount((prev) => prev + 1);
      }
    } finally { isBookmarkProcessingRef.current = false; }
  };

  const handleVote = async (type: "like" | "dislike") => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      const userKey = getUserKey();
      await supabase.from("reactions").delete().eq("place_id", placeId).eq("user_key", userKey).in("type", ["like", "dislike"]);
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
    } finally { isProcessingRef.current = false; }
  };

  const allGalleryImages = useMemo(() => {
    if (!place) return [];
    return place.image_url ? [{ id: -1, image_url: place.image_url }, ...galleryImages] : [...galleryImages];
  }, [place, galleryImages]);

  const hasImages = allGalleryImages.length > 0;

  if (!place) return (
    <div className="ggk-body" style={{ padding: "40px 16px", textAlign: "center", color: "#888", fontSize: "13px" }}>로딩중...</div>
  );

  return (
    <>
      <style>{FONT_STYLE}</style>

      <div
        ref={scrollRef}
        className="ggk-body"
        onScroll={() => closeAll()}
        style={{ padding: "4px 0 20px" }}
      >
        {/* 장소명 */}
        <h1 className="ggk-title" style={{ fontSize: "18px", fontWeight: 800, marginBottom: "2px", color: "#111", letterSpacing: "-0.3px" }}>
          {place.name}
        </h1>

        {/* 주소 */}
        <p style={{ margin: "0 0 10px", fontSize: "11px", color: "#888", display: "flex", alignItems: "center", gap: "3px" }}>
          <MapPin size={11} color="#bbb" />
          {place.address}
        </p>

        {/* 관리자 표시 배지 ★ */}
        {isAdmin && (
          <div style={{
            display:"inline-flex", alignItems:"center", gap:5,
            padding:"4px 10px", borderRadius:999, marginBottom:10,
            background:"linear-gradient(135deg,#f3e8ff,#ede9fe)",
            border:"1px solid #ddd6fe",
            fontSize:11, fontWeight:700, color:"#7c3aed",
          }}>
            <Shield size={11} />
            관리자 모드
          </div>
        )}

        {/* 이미지 갤러리 */}
        <div style={{ position: "relative" }}>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
          {!hasImages ? (
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ flexShrink:0, width:"130px", height:"130px", borderRadius:"12px", border:"1.5px dashed #d0d3d9", background:"#f5f6f8", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"6px", color:"#bbb" }}>
                <ImageOff size={26} color="#ccc" />
                <span style={{ fontSize:"10px", color:"#bbb", textAlign:"center", lineHeight:1.4 }}>이미지를<br />추가해주세요</span>
              </div>
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} style={{ flexShrink:0, width:"130px", height:"130px", borderRadius:"12px", border:"1.5px dashed #ccc", background:"#fafafa", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"5px", cursor:isUploading?"default":"pointer", color:"#aaa", fontSize:"11px" }}>
                {isUploading ? <span style={{ fontSize:"11px", color:"#aaa" }}>업로드 중...</span> : <><Plus size={22} color="#bbb" /><span>사진 추가</span></>}
              </button>
            </div>
          ) : (
            <div style={{ display:"flex", gap:"8px", overflowX:"auto", paddingBottom:"6px", scrollbarWidth:"thin", scrollbarColor:"#ddd transparent" }}>
              {allGalleryImages.map((img) => (
                <div key={img.id} onClick={() => setSelectedImage(img.image_url)} style={{ cursor:"pointer", flexShrink:0, width:"130px", height:"130px", borderRadius:"12px", overflow:"hidden", border:"1px solid #eee" }}>
                  <img src={img.image_url} alt="장소 이미지" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                </div>
              ))}
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} style={{ flexShrink:0, width:"130px", height:"130px", borderRadius:"12px", border:"1.5px dashed #ccc", background:"#fafafa", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"5px", cursor:isUploading?"default":"pointer", color:"#aaa", fontSize:"11px" }}>
                {isUploading ? <span style={{ fontSize:"11px", color:"#aaa" }}>업로드 중...</span> : <><Plus size={22} color="#bbb" /><span>사진 추가</span></>}
              </button>
            </div>
          )}
        </div>

        {/* 정보 그리드 */}
        <div style={{ marginTop:"12px", border:"1px solid #eee", borderRadius:"12px", overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid #eee" }}>
            <div style={{ padding:"10px 12px", borderRight:"1px solid #eee" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, letterSpacing:"0.2px", display:"flex", alignItems:"center", gap:"3px" }}><ChefHat size={10} />카테고리</div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>{place.category || "—"}</div>
            </div>
            <div style={{ padding:"10px 12px" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, letterSpacing:"0.2px", display:"flex", alignItems:"center", gap:"3px" }}><LandPlot size={10} />동반 가능 범위</div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>{place.pet_zone || "—"}</div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid #eee" }}>
            <div style={{ padding:"10px 12px", borderRight:"1px solid #eee" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}><Clock size={10} />영업시간</div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>{place.hours || "—"}</div>
            </div>
            <div style={{ padding:"10px 12px" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}><Dog size={10} />대형견 가능 여부</div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>{place.large_dog ? "✅ 가능" : "❌ 불가"}</div>
            </div>
          </div>
          <div style={{ padding:"10px 12px" }}>
            <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}><Bone size={10} />펫 메뉴</div>
            <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>{place.pet_menu || "—"}</div>
          </div>
        </div>

        {/* 찜/추천/비추천/네이버 */}
        <div style={{ marginTop:"12px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"7px" }}>
          <button onClick={handleBookmark} className="ggk-body" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"5px", padding:"9px 10px", borderRadius:"10px", border:`1px solid ${bookmarked?"#ff3040":"#e2e4e8"}`, background:bookmarked?"#fff0f2":"linear-gradient(145deg,#fafbfc,#f2f3f5)", cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
            <Heart size={14} fill={bookmarked?"#ff3040":"none"} color={bookmarked?"#ff3040":"#666"} />
            <span style={{ fontSize:"12px", fontWeight:600, color:bookmarked?"#ff3040":"#555" }}>찜 {bookmarkCount}</span>
          </button>
          <button onClick={() => handleVote("like")} className="ggk-body" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"5px", padding:"9px 10px", borderRadius:"10px", border:`1px solid ${voteReaction==="like"?"#3b82f6":"#e2e4e8"}`, background:voteReaction==="like"?"#eff6ff":"linear-gradient(145deg,#fafbfc,#f2f3f5)", cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
            <ThumbsUp size={14} color={voteReaction==="like"?"#3b82f6":"#666"} fill={voteReaction==="like"?"#3b82f6":"none"} />
            <span style={{ fontSize:"12px", fontWeight:600, color:voteReaction==="like"?"#3b82f6":"#555" }}>추천 {likesCount}</span>
          </button>
          <a href={`https://map.naver.com/v5/search/${encodeURIComponent(place.name)}`} target="_blank" rel="noreferrer" className="ggk-body" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"5px", padding:"9px 10px", borderRadius:"10px", border:"1px solid #e2e4e8", background:"linear-gradient(145deg,#fafbfc,#f2f3f5)", textDecoration:"none", color:"#555", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
            <ExternalLink size={14} color="#555" />
            <span style={{ fontSize:"12px", fontWeight:600 }}>네이버 지도로 보기</span>
          </a>
          <button onClick={() => handleVote("dislike")} className="ggk-body" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"5px", padding:"9px 10px", borderRadius:"10px", border:`1px solid ${voteReaction==="dislike"?"#ef4444":"#e2e4e8"}`, background:voteReaction==="dislike"?"#fff1f1":"linear-gradient(145deg,#fafbfc,#f2f3f5)", cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
            <ThumbsDown size={14} color={voteReaction==="dislike"?"#ef4444":"#666"} fill={voteReaction==="dislike"?"#ef4444":"none"} />
            <span style={{ fontSize:"12px", fontWeight:600, color:voteReaction==="dislike"?"#ef4444":"#555" }}>비추천 {dislikesCount}</span>
          </button>
        </div>

        {/* 댓글 헤더 */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"18px", marginBottom:"8px" }}>
          <h3 className="ggk-title" style={{ margin:0, fontSize:"13px", fontWeight:800, color:"#111" }}>
            댓글{" "}
            {reviews.filter((r) => {
              const hasReplies = replies.some((reply) => reply.review_id === r.id);
              if (r.deleted && !hasReplies) return false;
              return true;
            }).length}개
          </h3>
          <div>
            <button style={sortBtn(sort==="latest")} onClick={() => setSort("latest")}>최신순</button>
            <button style={sortBtn(sort==="like")} onClick={() => setSort("like")}>좋아요순</button>
          </div>
        </div>

        {/* 댓글 작성 */}
        <div style={{ padding:"10px", background:"#f5f6f8", borderRadius:"10px", marginBottom:"8px" }}>
          <div style={{ display:"grid", gridTemplateColumns: isLoggedIn ? "calc(40% - 21px)" : "4fr auto 6fr", gap:"7px", marginBottom:"7px", alignItems:"stretch" }}>
            <div style={{ display:"flex", alignItems:"center", background:"white", padding:"7px 10px", borderRadius:"7px", border:"1px solid #ddd", fontSize:"12px", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", width:"100%" }}>
              {myNickname}
            </div>
            {!isLoggedIn && (
              <button onClick={createRandomNickname} style={{ width:"38px", height:"38px", aspectRatio:"1/1", borderRadius:"7px", border:"1px solid #ddd", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Shuffle size={14} />
              </button>
            )}
            {!isLoggedIn && (
              <input placeholder="비밀번호" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width:"100%", padding:"7px 10px", borderRadius:"7px", border:"1px solid #ddd", fontSize:"12px", background:"white" }} />
            )}
          </div>
          <div style={{ display:"flex", gap:"7px", alignItems:"stretch" }}>
            <textarea placeholder="댓글을 입력하세요" value={content} onChange={(e) => setContent(e.target.value)} style={{ flex:1, minHeight:"58px", padding:"8px 10px", borderRadius:"7px", background:"white", border:"1px solid #ddd", fontSize:"12px", resize:"none" }} />
            <button onClick={handleSubmit} disabled={(!session && !password) || !content} className="ggk-body" style={{ width:"52px", borderRadius:"7px", border:"none", background:((!session && !password)||!content)?"#ccc":"linear-gradient(145deg,#2a2a2a,#111)", color:"white", cursor:((!session && !password)||!content)?"default":"pointer", fontSize:"12px", fontWeight:700 }}>
              등록
            </button>
          </div>
        </div>

        {/* 비로그인 로그인 유도 */}
        {!isLoggedIn && (
          <div style={{ padding:"12px 14px", background:"#f5f6f8", borderRadius:"10px", marginBottom:"10px", textAlign:"center", border:"1px solid #eee" }}>
            <div style={{ marginBottom:"10px", fontSize:"12px", color:"#555" }}>회원으로 댓글을 작성하고, 찜 기능을 이용해보세요!</div>
            <div style={{ display:"flex", justifyContent:"center", gap:"8px" }}>
              <button onClick={() => router.push(`/login?redirect=/place/${placeId}`)} className="ggk-body" style={{ padding:"8px 16px", borderRadius:"8px", border:"none", background:"linear-gradient(145deg,#2a2a2a,#111)", color:"white", fontWeight:700, cursor:"pointer", fontSize:"12px", boxShadow:"0 1px 5px rgba(0,0,0,0.18)" }}>로그인</button>
              <button onClick={() => router.push(`/signup?redirect=/place/${placeId}`)} className="ggk-body" style={{ padding:"8px 16px", borderRadius:"8px", border:"1px solid #ddd", background:"linear-gradient(145deg,#f5f6f8,#eaebee)", color:"#333", fontWeight:700, cursor:"pointer", fontSize:"12px", boxShadow:"0 1px 4px rgba(0,0,0,0.07)" }}>회원가입</button>
            </div>
          </div>
        )}

        {/* ── 댓글 리스트 ── */}
        <div style={{ marginTop:"4px" }}>
          {[...reviews]
            .sort((a, b) => {
              if (sort === "latest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              const diff = (b.likes || 0) - (a.likes || 0);
              return diff !== 0 ? diff : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            })
            .map((r) => {
              const hasReplies = replies.some((reply) => reply.review_id === r.id);
              if (r.deleted && !hasReplies) return null;
              return (
                <div key={r.id} style={{ borderBottom:"1px solid #eee", padding:"10px 0" }}>
                  {/* 상단 */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <div style={{ width:"24px", height:"24px", borderRadius:"50%", background:getProfileColor(r.nickname), color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", fontWeight:700, flexShrink:0, overflow:"hidden" }}>
                        {r.avatar_url ? <img src={r.avatar_url} alt={r.nickname} referrerPolicy="no-referrer" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : r.nickname?.charAt(0)}
                      </div>
                      <div className="ggk-body" style={{ fontWeight:700, fontSize:"12px", color:"#111" }}>{r.nickname}</div>
                      {isOwner(r) && <span style={{ fontSize:"10px", background:"#e8f0fe", color:"#1a73e8", padding:"1px 6px", borderRadius:"99px" }}>내 댓글</span>}
                    </div>
                    <div style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"flex-end" }}>
                      {!r.deleted && (
                        <button onClick={() => { closeAll(); setOpenedMenuId(openedMenuId===r.id?null:r.id); }} style={{ border:"none", background:"transparent", cursor:"pointer", padding:0 }}>
                          <MoreVertical size={15} color="#999" />
                        </button>
                      )}
                      {openedMenuId === r.id && (
                        <div style={{ position:"absolute", top:"20px", right:0, width:"120px", background:"white", border:"1px solid #eee", borderRadius:"10px", boxShadow:"0 4px 16px rgba(0,0,0,0.10)", overflow:"hidden", zIndex:5 }}>
                          {isOwner(r) ? (
                            <>
                              <button onClick={() => { closeAll(); startEdit(r); }} style={dropdownBtnStyle}>수정</button>
                              <button onClick={() => { closeAll(); startDelete(r.id); }} style={{ ...dropdownBtnStyle, color:"#ef4444" }}>삭제</button>
                            </>
                          ) : isAdmin ? (
                            /* ★ 관리자: 신고 + 관리자 삭제 */
                            <>
                              <button onClick={() => { closeAll(); setReportingId(r.id); setReportTargetType("review"); setReportTargetId(r.id); setReportCategory(""); setReportReason(""); }} style={dropdownBtnStyle}>신고</button>
                              <button onClick={() => handleAdminDeleteReview(r.id)} style={{ ...dropdownBtnStyle, color:"#7c3aed", display:"flex", alignItems:"center", gap:5 }}>
                                <Shield size={11} color="#7c3aed" />관리자 삭제
                              </button>
                            </>
                          ) : (
                            <button onClick={() => { closeAll(); setReportingId(r.id); setReportTargetType("review"); setReportTargetId(r.id); setReportCategory(""); setReportReason(""); }} style={dropdownBtnStyle}>신고</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 내용 */}
                  {editingId === r.id ? (
                    <div style={{ marginTop:"7px" }}>
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ width:"100%", minHeight:"52px", padding:"7px", borderRadius:"6px", border:"1px solid #ddd", fontSize:"12px", boxSizing:"border-box" }} />
                      {!session && <input placeholder="비밀번호 입력" type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} style={{ marginTop:"5px", width:"100%", padding:"7px", borderRadius:"6px", border:"1px solid #ddd", fontSize:"12px", boxSizing:"border-box" }} />}
                      <div style={{ marginTop:"6px", display:"flex", gap:"6px" }}>
                        <button onClick={() => handleEdit(r.id)} style={saveBtn}>저장하기</button>
                        <button onClick={() => setEditingId(null)} style={cancelBtn}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop:"4px", fontSize:"12px", fontStyle:(r.deleted||r.is_admin_deleted)?"italic":"normal", opacity:(r.deleted||r.is_admin_deleted)?0.6:1, color:r.is_admin_deleted?"#ef4444":"#333", lineHeight:1.5, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                      {r.is_admin_deleted ? "부적절한 내용으로 관리자에 의해 삭제되었습니다." : r.content}
                    </div>
                  )}

                  {/* 하단 */}
                  {!r.deleted && (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"7px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                        <button onClick={() => likeReview(r.id)} style={{ display:"flex", alignItems:"center", gap:"4px", background:"transparent", border:"none", cursor:"pointer", padding:0 }}>
                          <Heart size={13} color={likedReviewIds.has(String(r.id))?"#ef4444":"#bbb"} fill={likedReviewIds.has(String(r.id))?"#ef4444":"none"} />
                          <span style={{ fontSize:"11px", color:"#777" }}>{r.likes||0}</span>
                        </button>
                        <button onClick={() => { closeAll(); setReplyingId(replyingId===r.id?null:r.id); }} style={{ display:"flex", alignItems:"center", gap:"4px", background:"transparent", border:"none", cursor:"pointer", padding:0, color:"#777", fontSize:"11px" }}>
                          <MessageCircle size={13} />답글
                        </button>
                      </div>
                      <span style={{ fontSize:"10px", color:"#bbb" }}>
                        {formatDate(r.created_at)}{r.is_edited && <span style={{ marginLeft:"3px", color:"#ccc" }}>(수정됨)</span>}
                      </span>
                    </div>
                  )}

                  {/* 답글 입력 */}
                  {replyingId === r.id && (
                    <div style={{ marginTop:"8px", marginLeft:"28px", padding:"10px", background:"#f8fafc", borderRadius:"9px", border:"1px solid #e2e8f0" }}>
                      <div style={{ display:"grid", gridTemplateColumns:isLoggedIn?"calc(40% - 20px)":"4fr auto 6fr", gap:"7px", marginBottom:"7px" }}>
                        <div style={{ display:"flex", alignItems:"center", background:"white", padding:"6px 9px", borderRadius:"6px", border:"1px solid #ddd", fontSize:"11px", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{myNickname}</div>
                        {!isLoggedIn && <button onClick={createRandomNickname} style={{ width:"36px", height:"36px", borderRadius:"6px", border:"1px solid #ddd", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><Shuffle size={13} /></button>}
                        {!isLoggedIn && <input placeholder="비밀번호" type="password" value={replyPassword} onChange={(e) => setReplyPassword(e.target.value)} style={{ width:"100%", padding:"6px 9px", borderRadius:"6px", border:"1px solid #ddd", background:"white", fontSize:"11px", boxSizing:"border-box" }} />}
                      </div>
                      <div style={{ display:"flex", gap:"7px" }}>
                        <textarea placeholder="답글을 입력하세요" value={replyContent} onChange={(e) => setReplyContent(e.target.value)} style={{ flex:1, minHeight:"52px", padding:"7px 9px", borderRadius:"6px", border:"1px solid #ddd", background:"white", resize:"none", fontSize:"11px", boxSizing:"border-box" }} />
                        <button disabled={!replyContent.trim()||(!isLoggedIn&&!replyPassword.trim())} onClick={() => handleReplySubmit(r.id)} className="ggk-body" style={{ width:"46px", borderRadius:"6px", border:"none", background:(!replyContent.trim()||(!isLoggedIn&&!replyPassword.trim()))?"#ccc":"linear-gradient(145deg,#2a2a2a,#111)", color:"white", cursor:(!replyContent.trim()||(!isLoggedIn&&!replyPassword.trim()))?"default":"pointer", fontSize:"11px", fontWeight:700 }}>등록</button>
                      </div>
                    </div>
                  )}

                  {/* 답글 리스트 */}
                  {replies.filter((reply) => reply.review_id === r.id).map((reply) => (
                    <div key={reply.id} style={{ marginLeft:"28px", marginTop:"8px", padding:"8px 10px", background:"#f8fafc", borderRadius:"9px", border:"1px solid #e2e8f0" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                          <div style={{ width:"20px", height:"20px", borderRadius:"50%", background:getProfileColor(reply.nickname), color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontWeight:700, overflow:"hidden" }}>
                            {reply.avatar_url ? <img src={reply.avatar_url} referrerPolicy="no-referrer" alt={reply.nickname} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : reply.nickname?.charAt(0)}
                          </div>
                          <div className="ggk-body" style={{ fontSize:"11px", fontWeight:700, color:"#111" }}>{reply.nickname}</div>
                          {isOwnerReply(reply) && <span style={{ fontSize:"10px", background:"#e8f0fe", color:"#1a73e8", padding:"1px 6px", borderRadius:"99px" }}>내 댓글</span>}
                        </div>
                        <div style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"flex-end" }}>
                          <button onClick={() => { closeAll(); setOpenedReplyMenuId(openedReplyMenuId===reply.id?null:reply.id); }} style={{ border:"none", background:"transparent", cursor:"pointer", padding:0 }}>
                            <MoreVertical size={13} color="#999" />
                          </button>
                          {openedReplyMenuId === reply.id && (
                            <div style={{ position:"absolute", top:"18px", right:0, width:"120px", background:"white", border:"1px solid #eee", borderRadius:"10px", boxShadow:"0 4px 16px rgba(0,0,0,0.10)", overflow:"hidden", zIndex:5 }}>
                              {isOwnerReply(reply) ? (
                                <>
                                  <button onClick={() => { closeAll(); setEditingReplyId(reply.id); setEditReplyContent(reply.content); }} style={dropdownBtnStyle}>수정</button>
                                  <button onClick={() => { closeAll(); setDeletingReplyId(reply.id); }} style={{ ...dropdownBtnStyle, color:"#ef4444" }}>삭제</button>
                                </>
                              ) : isAdmin ? (
                                /* ★ 관리자: 신고 + 관리자 삭제 */
                                <>
                                  <button onClick={() => { closeAll(); setReportingReplyId(reply.id); setReportTargetType("reply"); setReportTargetId(reply.id); setReportCategory(""); setReportReason(""); }} style={dropdownBtnStyle}>신고</button>
                                  <button onClick={() => handleAdminDeleteReply(reply.id)} style={{ ...dropdownBtnStyle, color:"#7c3aed", display:"flex", alignItems:"center", gap:5 }}>
                                    <Shield size={11} color="#7c3aed" />관리자 삭제
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => { closeAll(); setReportingReplyId(reply.id); setReportTargetType("reply"); setReportTargetId(reply.id); setReportCategory(""); setReportReason(""); }} style={dropdownBtnStyle}>신고</button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {editingReplyId === reply.id ? (
                        <div style={{ marginTop:"6px" }}>
                          <textarea value={editReplyContent} onChange={(e) => setEditReplyContent(e.target.value)} style={{ width:"100%", minHeight:"48px", padding:"6px", borderRadius:"5px", border:"1px solid #ddd", fontSize:"11px", boxSizing:"border-box" }} />
                          {!isLoggedIn && <input placeholder="비밀번호 입력" type="password" value={editReplyPassword} onChange={(e) => setEditReplyPassword(e.target.value)} style={{ marginTop:"5px", width:"100%", padding:"6px", borderRadius:"5px", border:"1px solid #ddd", fontSize:"11px", boxSizing:"border-box" }} />}
                          <div style={{ marginTop:"5px", display:"flex", gap:"5px" }}>
                            <button onClick={() => handleReplyEdit(reply.id)} style={{ ...saveBtn, fontSize:"11px", padding:"5px 10px" }}>저장</button>
                            <button onClick={() => setEditingReplyId(null)} style={{ ...cancelBtn, fontSize:"11px", padding:"5px 10px" }}>취소</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop:"4px", fontSize:"11px", lineHeight:1.5, color:reply.is_admin_deleted?"#ef4444":"#333", fontStyle:reply.is_admin_deleted?"italic":"normal", opacity:reply.is_admin_deleted?0.6:1, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                          {reply.is_admin_deleted ? "부적절한 내용으로 관리자에 의해 삭제되었습니다." : reply.content}
                        </div>
                      )}

                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"6px" }}>
                        <button onClick={() => likeReply(reply.id)} style={{ display:"flex", alignItems:"center", gap:"3px", background:"transparent", border:"none", cursor:"pointer", padding:0 }}>
                          <Heart size={12} color={likedReplyIds.has(String(reply.id))?"#ef4444":"#bbb"} fill={likedReplyIds.has(String(reply.id))?"#ef4444":"none"} />
                          <span style={{ fontSize:"10px", color:"#777" }}>{reply.likes||0}</span>
                        </button>
                        <span style={{ fontSize:"10px", color:"#bbb" }}>
                          {formatDate(reply.created_at)}{reply.is_edited && <span style={{ marginLeft:"3px", color:"#ccc" }}>(수정됨)</span>}
                        </span>
                      </div>

                      {deletingReplyId === reply.id && (
                        <div style={{ marginTop:"6px", background:"#fff3f3", padding:"8px 10px", borderRadius:"7px", border:"1px solid #fecaca" }}>
                          <p style={{ margin:"0 0 6px", fontSize:"11px", color:"#c00" }}>정말 삭제하시겠습니까?</p>
                          {!isLoggedIn && <input placeholder="비밀번호 입력" type="password" value={deleteReplyPassword} onChange={(e) => setDeleteReplyPassword(e.target.value)} style={{ width:"100%", padding:"6px", borderRadius:"5px", border:"1px solid #ddd", fontSize:"11px", marginBottom:"6px", boxSizing:"border-box" }} />}
                          <div style={{ display:"flex", gap:"5px" }}>
                            <button onClick={() => handleReplyDelete(reply.id)} style={{ padding:"5px 10px", borderRadius:"5px", border:"none", background:"#ef4444", color:"white", cursor:"pointer", fontSize:"11px" }}>삭제하기</button>
                            <button onClick={() => { setDeletingReplyId(null); setDeleteReplyPassword(""); }} style={{ padding:"5px 10px", borderRadius:"5px", border:"1px solid #ddd", background:"white", cursor:"pointer", fontSize:"11px" }}>취소</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 댓글 삭제 확인 */}
                  {deletingId === r.id && (
                    <div style={{ marginTop:"7px", background:"#fff3f3", padding:"9px 11px", borderRadius:"8px", border:"1px solid #fecaca" }}>
                      <p style={{ margin:"0 0 6px", fontSize:"12px", color:"#c00" }}>정말 삭제하시겠습니까?</p>
                      {!session && <input placeholder="비밀번호 입력" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} style={{ width:"100%", padding:"7px", borderRadius:"5px", border:"1px solid #ddd", fontSize:"12px", marginBottom:"6px", boxSizing:"border-box" }} />}
                      <div style={{ display:"flex", gap:"6px" }}>
                        <button onClick={() => handleDelete(r.id)} style={{ padding:"5px 12px", borderRadius:"5px", border:"none", background:"#ef4444", color:"white", cursor:"pointer", fontSize:"12px" }}>삭제하기</button>
                        <button onClick={() => { setDeletingId(null); setDeletePassword(""); }} style={{ padding:"5px 12px", borderRadius:"5px", border:"1px solid #ddd", background:"white", cursor:"pointer", fontSize:"12px" }}>취소</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* 신고 모달 */}
        {(reportingId || reportingReplyId) && (
          <div onClick={() => { setReportingId(null); setReportingReplyId(null); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
            <div onClick={(e) => e.stopPropagation()} className="ggk-body" style={{ width:"100%", maxWidth:"380px", background:"white", borderRadius:"18px", padding:"20px", boxSizing:"border-box", boxShadow:"0 16px 48px rgba(0,0,0,0.22)" }}>
              <h2 className="ggk-title" style={{ margin:0, marginBottom:"16px", fontSize:"18px", fontWeight:800 }}>신고하기</h2>
              <div style={{ marginBottom:"12px" }}>
                <div style={{ fontSize:"11px", fontWeight:700, marginBottom:"6px", color:"#444" }}>신고 유형</div>
                <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)} style={{ width:"100%", padding:"9px 10px", borderRadius:"8px", border:"1px solid #ddd", fontSize:"12px", outline:"none" }}>
                  <option value="">선택해주세요</option>
                  <option value="spam">광고 / 도배</option>
                  <option value="abuse">욕설 / 비방</option>
                  <option value="sexual">음란물</option>
                  <option value="hate">혐오 표현</option>
                  <option value="etc">기타</option>
                </select>
              </div>
              <div style={{ marginBottom:"16px" }}>
                <div style={{ fontSize:"11px", fontWeight:700, marginBottom:"6px", color:"#444" }}>상세 사유</div>
                <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="신고 사유를 입력해주세요." style={{ width:"100%", minHeight:"90px", padding:"9px 10px", borderRadius:"8px", border:"1px solid #ddd", resize:"none", fontSize:"12px", outline:"none", boxSizing:"border-box" }} />
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <button onClick={() => { setReportingId(null); setReportingReplyId(null); }} style={{ flex:1, padding:"11px", borderRadius:"8px", border:"1px solid #ddd", background:"white", cursor:"pointer", fontWeight:700, fontSize:"12px" }}>취소</button>
                <button
                  disabled={!reportCategory||!reportReason.trim()}
                  onClick={async () => {
                    const userKey = getUserKey();
                    const { error } = await supabase.from("reports").insert([{ type:reportTargetType, target_id:reportTargetId, reporter_key:userKey, report_category:reportCategory, report_reason:reportReason }]);
                    if (error) { console.error("신고 오류:", JSON.stringify(error, null, 2)); return; }
                    alert("신고가 정상적으로 접수되었습니다.");
                    setReportingId(null); setReportingReplyId(null); setReportCategory(""); setReportReason("");
                  }}
                  style={{ flex:1, padding:"11px", borderRadius:"8px", border:"none", background:(!reportCategory||!reportReason.trim())?"#ccc":"#ef4444", color:"white", cursor:(!reportCategory||!reportReason.trim())?"default":"pointer", fontWeight:700, fontSize:"12px" }}
                >신고하기</button>
              </div>
            </div>
          </div>
        )}

        {/* 이미지 확대 모달 */}
        {selectedImage && (
          <div onClick={() => setSelectedImage(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ position:"relative", display:"inline-block" }}>
              <button onClick={() => setSelectedImage(null)} style={{ position:"absolute", top:"10px", right:"10px", width:"34px", height:"34px", borderRadius:"50%", border:"none", background:"rgba(0,0,0,0.55)", color:"white", fontSize:"16px", cursor:"pointer", zIndex:2, backdropFilter:"blur(4px)" }}>✕</button>
              <img src={selectedImage} alt="확대 이미지" style={{ maxWidth:"95vw", maxHeight:"90vh", borderRadius:"14px", objectFit:"contain", display:"block" }} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const dropdownBtnStyle: React.CSSProperties = {
  width:"100%", padding:"9px 12px", border:"none",
  background:"white", cursor:"pointer", textAlign:"left", fontSize:"12px",
  fontFamily:"'Noto Sans KR', sans-serif",
};
const saveBtn: React.CSSProperties = {
  padding:"5px 12px", borderRadius:"5px", border:"none",
  background:"linear-gradient(145deg,#2a2a2a,#111)", color:"white",
  cursor:"pointer", fontSize:"12px", fontFamily:"'Noto Sans KR', sans-serif",
};
const cancelBtn: React.CSSProperties = {
  padding:"5px 12px", borderRadius:"5px", border:"1px solid #ddd",
  background:"white", cursor:"pointer", fontSize:"12px",
  fontFamily:"'Noto Sans KR', sans-serif",
};