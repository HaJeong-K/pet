"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { fetchPublicDataPlaces } from "@/lib/publicDataPlaces";
import { trackEvent, extractRegion, extractSubRegion } from "@/lib/analytics";
import OwnerPlaceEditPanel from "@/components/OwnerPlaceEditPanel";
import {
  calculateAffinityBreakdown,
  getAffinityTier,
  AFFINITY_TIER_LABEL,
  AFFINITY_TIER_COLOR,
  AFFINITY_TIER_BG,
} from "@/lib/affinityScore";
import { hasInfo, getPetZoneLabel } from "@/lib/placeConstants";
import { isPlacePremiumNow } from "@/lib/premium";
import { useParams, useRouter } from "next/navigation";
import {
  Heart, ThumbsUp, ThumbsDown, MoreVertical, MessageCircle,
  Shuffle, MapPin, Clock, PawPrint, Plus, ExternalLink,
  ImageOff, ChefHat, LandPlot, Dog, Shield,
  ChevronLeft, ChevronRight, Phone,
  Car,         // 주차
  Ticket,      // 입장료
  Globe,       // 홈페이지
  CalendarOff, // 휴무일
  Stethoscope, // 진료과목 (동물병원)
  Trash2,      // 관리자 장소 삭제
  X,           // 이미지 확대 모달 닫기
  Flag,        // 이미지 신고
  Crown,       // 프리미엄 배지
} from "lucide-react";

// ── 동물병원 진료과목 기본값: 특정 전문과가 지정되어 있지 않으면 '종합진료'로 표기
const DEFAULT_VET_DEPARTMENT = "종합진료";

// ── 폰트 (Pretendard 제목/로고 + Noto Sans KR 본문)
const FONT_STYLE = `
  * { box-sizing: border-box; }
  .ggk-title { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
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

// 모달(@modal/(.)place/[id]/page.tsx)에서 이 컴포넌트를 감싸 쓸 때는 onAdminMenu를
// 넘겨서 관리자 삭제 메뉴를 모달 자체의 헤더 점세개 버튼 안으로 합칩니다(중복 버튼 방지).
// onAdminMenu가 없으면(=직접 URL 접속 등 standalone) 아래에서 자체적으로 점세개
// 버튼을 렌더링합니다.
type AdminMenuState = {
  isAdmin: boolean;
  canDelete: boolean;
  isPublicData: boolean;
  // true면 실제로 원본 데이터까지 지워지는 "삭제"(DB 실제 장소, 또는 CSV 출처 공공데이터),
  // false면 관광공사 실시간 API 출처라 원본은 못 지우고 "숨김" 처리만 됩니다.
  willActuallyDelete: boolean;
  deleting: boolean;
  deletePlace: () => void;
};

// 영업시간처럼 "월~화 09:30~19:00, 수 09:30~13:30, 목~토 09:30~19:00"같이 쉼표로 요일별
// 구간이 나뉘어 있는 값은 한 줄에 다 이어붙어 있으면 읽기 어려워서, 쉼표 단위로
// 줄바꿈해서 보여줍니다. 쉼표가 없는 값(예: "매일 10:00~22:00")은 그대로 한 줄입니다.
function MultilineText({ text }: { text: string | null | undefined }) {
  if (!text) return <>—</>;
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => (
        <div key={i}>{part}</div>
      ))}
    </>
  );
}

export default function PlaceDetail({
  onAdminMenu,
}: {
  onAdminMenu?: (menu: AdminMenuState) => void;
} = {}) {
  const params  = useParams();
  const router  = useRouter();
  const placeId = Number(params.id);
  // 실시간 공공데이터(식품안전나라·한국관광공사·한국문화정보원) 출처 장소인지 여부.
  // 이런 장소는 Supabase `places` 테이블에 실제 행이 없는 클라이언트 합성 ID라
  // 리뷰 답글·갤러리 이미지 등 부가 기능은 건너뜁니다.
  const [isPublicDataPlace, setIsPublicDataPlace] = useState(false);

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
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);

  const [openedMenuId, setOpenedMenuId]   = useState<string | null>(null);
  const [reportingId, setReportingId]     = useState<string | null>(null);

  // ★ 관리자 전용 — 장소 자체 삭제(폐업 등으로 실제 존재하지 않는 장소 정리용)
  const [showPlaceMenu, setShowPlaceMenu]     = useState(false);
  const [deletingPlace, setDeletingPlace]     = useState(false);

  const [replyingId, setReplyingId]       = useState<string | null>(null);
  const [replyContent, setReplyContent]   = useState("");
  const [replyPassword, setReplyPassword] = useState("");
  const [replies, setReplies]             = useState<any[]>([]);

  const [likedReplyIds, setLikedReplyIds]   = useState<Set<string>>(new Set());
  const [reportCategory, setReportCategory] = useState("");
  const [reportReason, setReportReason]     = useState("");

  const [reportTargetType, setReportTargetType] = useState<"review" | "reply" | "place_image" | null>(null);
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
  // AWS(DynamoDB+Lambda) 리뷰 백엔드는 정식 배포 전이라 실제 데이터가 없어
  // 코드 자체를 걷어냈습니다. 이제 모든 장소(공공데이터 출처 포함)의 리뷰는
  // Supabase reviews 테이블 하나로 통일됩니다.
  const fetchReviews = async () => {
    const { data: reviewData } = await supabase
      .from("reviews")
      .select(
        "id, nickname, content, likes, created_at, auth_user_id, user_key, deleted, is_edited, is_admin_deleted, avatar_url, password, sentiment_score"
      )
      .eq("place_id", placeId)
      .order("id", { ascending: false });

    if (!reviewData) {
      setReviews([]);
      return;
    }

    const authIds = [
      ...new Set(reviewData.map((r) => r.auth_user_id).filter(Boolean)),
    ];

    const needsAvatarLookup = reviewData.some(
      (r) => !r.avatar_url && r.auth_user_id
    );

    if (needsAvatarLookup && authIds.length > 0) {
      const { data: userData } = await supabase
        .from("users")
        .select("auth_user_id, avatar_url")
        .in("auth_user_id", authIds);

      const avatarMap = Object.fromEntries(
        (userData || []).map((u) => [u.auth_user_id, u.avatar_url])
      );

      setReviews(
        reviewData.map((r) => ({
          ...r,
          avatar_url: r.avatar_url || avatarMap[r.auth_user_id] || null,
        }))
      );
    } else {
      setReviews(reviewData);
    }
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
      if (insertError) {
        console.error(insertError);
        // 공공데이터(관광공사·문화정보원·식품안전나라) 출처 장소는 Supabase `places` 테이블에
        // 실제 행이 없는 합성 ID라, place_images.place_id에 외래키(FK) 제약이 걸려 있으면
        // insert가 조용히 실패합니다. scripts/sql/fix-place-images-fk.sql 실행 여부를 안내합니다.
        alert(
          isPublicDataPlace
            ? "이미지 업로드에 실패했습니다. 공공데이터 출처 장소는 별도 설정이 필요할 수 있습니다. (관리자: fix-place-images-fk.sql 실행 필요)"
            : "이미지 업로드에 실패했습니다: " + insertError.message
        );
        return;
      }
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

  // ── 모달 인터셉트 실패 감지 → 팝업 폴백
  // 정상 흐름: 지도 화면에서 장소를 클릭하면 openPlace.ts가 router.push(`/place/${id}`)를
  // 호출하고, Next.js Intercepting Routes(src/app/@modal/(.)place/[id]/page.tsx)가 이 컴포넌트를
  // "감싸서" 지도 위에 모달로 띄웁니다 — 이때는 onAdminMenu prop이 전달됩니다.
  // onAdminMenu가 없다는 건 이 컴포넌트가 모달 없이 "단독 페이지"로 렌더링됐다는 뜻인데,
  // 여기엔 두 가지 서로 다른 경우가 섞여 있습니다.
  //   1) 정상: 공유 링크로 직접 접속, 새 탭에서 열기, 새로고침 — 지도가 애초에 없으므로
  //      단독 페이지로 보이는 게 맞습니다. 이때 document.referrer는 비어 있거나 우리 앱이
  //      아닙니다.
  //   2) 오류: 지도 화면 안에서 클릭했는데(=우리 앱 내부에서 실제 페이지 이동이 발생했는데)
  //      어떤 이유로 인터셉트가 걸리지 않아 전체화면으로 렌더링된 경우. 이땐 브라우저가 실제
  //      네비게이션을 했으므로 document.referrer가 우리 앱의 다른 페이지(지도 화면) 주소로
  //      찍힙니다 — 이 신호로만 "오류" 케이스를 구분합니다.
  // 오류 케이스로 판단되면: 실제 팝업창으로 상세페이지를 다시 열고, 현재 탭은 원래 있던
  // 지도 화면(referrer)으로 되돌려 보내 지도 뷰가 그대로 유지되도록 합니다.
  useEffect(() => {
    if (onAdminMenu) return; // 모달로 정상 렌더링된 경우 — 아무 것도 안 함
    if (typeof window === "undefined") return;

    const referrer = document.referrer;
    if (!referrer) return; // 직접 접속/새 탭 — 정상적인 단독 페이지, 폴백 불필요

    let referrerUrl: URL;
    try {
      referrerUrl = new URL(referrer);
    } catch {
      return;
    }
    if (referrerUrl.origin !== window.location.origin) return; // 외부 링크 — 정상
    if (referrerUrl.pathname.startsWith("/place/")) return; // 다른 상세페이지에서 온 이동 — 폴백 대상 아님

    // 여기까지 왔으면 "우리 앱(지도 등) 안에서 클릭했는데 모달 인터셉트가 실패한" 케이스입니다.
    const fallbackUrl = referrerUrl.pathname + referrerUrl.search;
    window.open(
      window.location.href,
      `place_${placeId}`,
      "width=480,height=860,noopener,noreferrer,scrollbars=yes,resizable=yes"
    );
    router.replace(fallbackUrl || "/");
  }, []);

  // ── 데이터 로딩
  useEffect(() => {
    const fetchData = async () => {
      if (!placeId) return;
      const { data: placeData } = await supabase
        .from("places")
        .select("*")
        .eq("id", placeId)
        .single();

      let resolvedPlace = placeData;
      let publicDataPlace = false;

      // AWS(DynamoDB+Lambda) 전국 데이터는 Supabase `places` 테이블로 이관 완료되어
      // 위 Supabase 조회 한 번으로 커버됩니다. 아래는 이관 대상이 아닌, 실시간
      // 공공데이터(식품안전나라·한국관광공사·한국문화정보원) 출처 장소 폴백입니다.
      if (!resolvedPlace) {
          const publicDataPlaces = await fetchPublicDataPlaces();

          resolvedPlace =
              publicDataPlaces.find((p) => p.id === placeId) || null;

          if (resolvedPlace) {
              publicDataPlace = true;
              setIsPublicDataPlace(true);
          }
      }

      setPlace(resolvedPlace);

      await fetchReviews();

      // 갤러리 이미지(place_images)는 공공데이터 출처 장소(합성 ID)라도 항상 불러옵니다 —
      // 문화원/식약처 CSV 장소는 원본에 이미지가 전혀 없어 관리자·업주가 직접 올린 대표
      // 사진이 유일한 이미지 소스인 경우가 많습니다. 답글(review_replies)만 실제 Supabase
      // 행이 필요한 리뷰(reviews)에 종속돼 있어 공공데이터 장소에는 아직 의미가 없습니다.
      await fetchGalleryImages();
      if (!publicDataPlace) {
          await fetchReplies();
      }
      const userKey = getUserKey();
      const currentSession = (await supabase.auth.getSession()).data.session;
      const reactionsKey = currentSession?.user?.id ?? userKey;
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
        supabase.from("reactions").select("type").eq("place_id", placeId).eq("user_key", reactionsKey),
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

  // 관리자 통계 분석 탭의 "지역별 인기 장소 TOP10" 계산용 — 상세페이지 조회 이벤트
  useEffect(() => {
    if (!place) return;
    trackEvent("place_view", {
      placeId: place.id,
      placeName: place.name,
      region: extractRegion(place.address),
      subRegion: extractSubRegion(place.address),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.id]);

  // ── ★ 관리자 댓글/답글 삭제
  const handleAdminDeleteReview = async (reviewId: string) => {
    if (!confirm("관리자 권한으로 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("reviews").update({
      is_admin_deleted: true,
      deleted: true,
    }).eq("id", reviewId);
    if (error) { console.error(error); return; }
    setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, is_admin_deleted: true, deleted: true } : r));
    setOpenedMenuId(null);
  };

  const handleAdminDeleteReply = async (replyId: string) => {
    if (!confirm("관리자 권한으로 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("review_replies").update({
      is_admin_deleted: true,
      deleted: true,
    }).eq("id", replyId);
    if (error) { console.error(error); return; }
    setReplies((prev) => prev.map((r) => r.id === replyId ? { ...r, is_admin_deleted: true, deleted: true } : r));
    setOpenedReplyMenuId(null);
  };

  // ── 관리자: 장소 자체 삭제 (폐업 등으로 실제 존재하지 않는 장소 정리용)
  // ⚠ 공공데이터(식품안전나라·관광공사·문화정보원) 출처 장소는 Supabase `places`에
  // 실제 행이 없는 합성 ID라 "지울" 수는 없지만, 폐업 등 최신화가 필요하다는 요청에
  // 따라 hidden_public_places 차단 목록에 올려서 이후 지도/리스트/검색 어디에도
  // 다시 나타나지 않도록 "숨김" 처리합니다(scripts/sql/add-hidden-public-places.sql).
  // DB에 실제 행이 있는 장소는 기존처럼 완전히 삭제합니다.
  // ── 공공데이터 출처 장소의 세부 소스 구분 ──
  // "공공데이터"라고 다 같은 취급을 하면 안 됩니다:
  //   - tour(한국관광공사 실시간 API): 우리 쪽에 원본 행이 없어서(매번 API로 새로 받음)
  //     실제로 지울 대상이 없습니다 → 계속 hidden_public_places로 "숨김" 처리.
  //   - foodsafety/culture(식품안전나라·문화정보원, CSV로 미리 반입해둔 것): 우리
  //     Supabase(foodsafety_restaurants/culture_facilities)에 실제 원본 행이 있어서
  //     완전히 지울 수 있습니다 → 관리자 요청대로 "삭제" 처리.
  // (place는 아직 로딩 중이면 null일 수 있어 옵셔널 체이닝으로 안전하게 접근합니다.)
  const publicDataSource = place?.sourceId ? String(place.sourceId).split("-")[0] : null;
  const isCsvSourcedPublicData = publicDataSource === "foodsafety" || publicDataSource === "culture";

  const handleDeletePlace = async () => {
    const confirmMsg = !isPublicDataPlace
      ? "이 장소를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다."
      : isCsvSourcedPublicData
      ? "이 장소를 완전히 삭제하시겠습니까? (식품안전나라/문화정보원 CSV 출처라 원본 데이터까지 지워지며, 되돌릴 수 없습니다)"
      : "이 장소를 목록에서 숨기시겠습니까? (관광공사 실시간 API 출처라 원본을 지울 수는 없어, 앞으로 지도/검색/통계에 다시 나타나지 않도록 처리합니다)";
    if (!confirm(confirmMsg)) return;
    setDeletingPlace(true);
    try {
      // ★ 클라이언트(anon key)로 직접 delete()/insert()를 호출하면 RLS 정책에 막혀
      //   에러 없이 조용히 실패했습니다. service role 키를 쓰는 서버 라우트를
      //   통해 처리합니다.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("로그인이 필요합니다.");
        return;
      }
      // 공공데이터 장소 중에서도 소스에 따라 처리가 갈립니다:
      //   - CSV 출처(foodsafety/culture): 원본 테이블 행까지 완전 삭제
      //   - 실시간 API 출처(tour) 또는 그 외 판단 불가: 기존처럼 숨김 처리
      const endpoint = !isPublicDataPlace
        ? "/api/admin/delete-place"
        : isCsvSourcedPublicData
        ? "/api/admin/delete-public-data-place"
        : "/api/admin/hide-public-place";
      const body = !isPublicDataPlace
        ? { placeId: Number(placeId) }
        : isCsvSourcedPublicData
        ? { placeId: Number(placeId), sourceId: place.sourceId, reason: "관리자 삭제(공공데이터 CSV 출처 완전 삭제)" }
        : { placeId: Number(placeId), reason: "관리자 삭제(공공데이터 API 출처 숨김)" };
      const res = await fetch(endpoint, {
        method: isPublicDataPlace ? "POST" : "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[handleDeletePlace] API 오류:", data);
        alert(`삭제 실패: ${data.error || "알 수 없는 오류"}`);
        return;
      }
      setShowPlaceMenu(false);
      router.push("/");
    } finally {
      setDeletingPlace(false);
    }
  };

  // 모달 헤더의 기존 점세개 버튼에 관리자 삭제 메뉴를 실어 보냅니다.
  useEffect(() => {
    if (!onAdminMenu) return;
    onAdminMenu({
      isAdmin,
      canDelete: isAdmin,
      isPublicData: isPublicDataPlace,
      willActuallyDelete: !isPublicDataPlace || isCsvSourcedPublicData,
      deleting: deletingPlace,
      deletePlace: handleDeletePlace,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isPublicDataPlace, isCsvSourcedPublicData, deletingPlace]);

  // ── 댓글 등록
  const handleSubmit = async () => {
    if (!myNickname || !content) return;

    if (!session && !password) return;

    // 모든 장소는 Supabase reviews 테이블 하나로 저장합니다
    // (예전 AWS 리뷰 백엔드는 정식 배포 전이라 실제 데이터 없이 코드만 걷어냄).
    const userKey = getUserKey();
    const authUserId = session?.user?.id ?? null;

    const { error } = await supabase.from("reviews").insert([
      {
        place_id: placeId,
        nickname: myNickname,
        password: isLoggedIn ? null : password,
        content,
        likes: 0,
        user_key: isLoggedIn ? null : userKey,
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
    setReportingReplyId(null); setReplyingId(null); setShowPlaceMenu(false);
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
    const { error } = await supabase.from("reviews")
      .update({ deleted: true })
      .eq("id", reviewId);
    if (error) { console.error(error); return; }
    setDeletingId(null);
    await fetchReviews();
  };

  const handleReplyDelete = async (replyId: string) => {
    const reply = replies.find((r) => r.id === replyId);

    if (!reply) return;

    if (
      !isLoggedIn &&
      reply.password &&
      reply.password !== deleteReplyPassword
    ) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    const { error } = await supabase.from("review_replies")
      .update({ deleted: true })
      .eq("id", replyId);

    if (error) {
      console.error(error);
      return;
    }

    setReplies((prev) => prev.filter((r) => r.id !== replyId));

    // 추가 — 부모 댓글이 deleted 상태이고 이제 살아있는 답글이 없으면 reviews에서도 제거
    const parentReview = reviews.find(rv => 
      replies.some(r => r.id === replyId && r.review_id === rv.id)
    );
    if (parentReview?.deleted) {
      const remainingReplies = replies.filter(
        r => r.id !== replyId && r.review_id === parentReview.id && !r.deleted
      );
      if (remainingReplies.length === 0) {
        setReviews(prev => prev.filter(r => r.id !== parentReview.id));
      }
    }

    setDeletingReplyId(null);
    setDeleteReplyPassword("");
  };

  const handleBookmark = async () => {
    if (!session) { router.push(`/login?redirect=/place/${placeId}`); return; }
    if (isBookmarkProcessingRef.current) return;
    isBookmarkProcessingRef.current = true;
    try {
      const userKey = session.user.id;
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

  // ⚠ 공공데이터 출처 장소는 image_url이 항상 "/images/default-place.png"(진짜 사진이
  // 아닌 실루엣 아이콘)로 채워져 있어서 hasImages만으로는 "진짜 사진이 있는지"를
  // 구분 못 합니다. 실사진이 하나도 없으면 "사진 추가" 안내만 보여줍니다(로드뷰는
  // 제거 — 작은 칸에선 잘 안 보이기도 하고, 실제 간판/가게 사진만 쓰는 쪽으로 결정).
  const hasRealPhoto = allGalleryImages.some(
    (img) => img.image_url && img.image_url !== "/images/default-place.png"
  );

  // ── 반려동물 친화도 점수 (0~100, Rule-based) — 신청서 1.2) AI 기술 활용 항목 구현
  const affinity = useMemo(() => {
    if (!place) return null;
    return calculateAffinityBreakdown({
      reviews: reviews
        .filter((r) => !r.deleted)
        .map((r) => ({ content: r.content, likes: r.likes, sentimentScore: r.sentiment_score })),
      likesCount,
      dislikesCount,
      bookmarkCount,
      isPublicDataVerified: isPublicDataPlace, // 공공데이터(전국 데이터셋) 출처 여부
      amenities: {
        largeDog: place.large_dog,
        petZone: place.pet_zone,
        hours: place.hours,
        phone: place.phone,
        parking: place.parking,
        entryFee: place.entry_fee,
        website: place.website,
      },
    });
  }, [place, reviews, likesCount, dislikesCount, bookmarkCount, isPublicDataPlace]);

  if (!place) return (
    <div className="ggk-body" style={{ padding: "40px 16px", textAlign: "center", color: "#888", fontSize: "13px" }}>로딩중...</div>
  );

  // ── 동물병원 전용 파생 값
  // 세부 진료과목이 입력돼 있으면 그대로("심장내과" 등), 특정과 중심이 아니거나
  // 확인이 안 된 경우엔 '종합진료'로 기본 표기합니다.
  const isVetHospital = place.category === "동물병원";
  const vetDepartment = place.specialty_department?.trim()
    ? place.specialty_department.trim()
    : DEFAULT_VET_DEPARTMENT;
  const vetTreatableAnimals = place.treatable_animals?.trim()
    ? place.treatable_animals.trim()
    : "—";
  // ── 일반(비-동물병원) 장소용 "가능 동물" — 동물병원처럼 진료과목과 짝지어 보여줄
  // 필드가 없어서, 대신 전화번호 옆 빈 공간에 같은 컬럼(treatable_animals)을 그대로
  // 노출합니다. 값이 없으면 다른 필드들과 동일하게 "—"로 표기합니다.
  const generalTreatableAnimals = place.treatable_animals?.trim() || "—";

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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <h1 className="ggk-title" style={{ fontSize: "18px", fontWeight: 800, marginBottom: "2px", color: "#111", letterSpacing: "-0.3px", display: "flex", alignItems: "center", gap: 6 }}>
            {place.name}
            {isPlacePremiumNow(place) && (
              <span title="프리미엄 등록 업장" style={{
                display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800,
                padding: "2px 8px", borderRadius: 999, flexShrink: 0,
                background: "linear-gradient(135deg,#F0D28A,#D4A24C)", color: "#5C4106",
              }}>
                <Crown size={10} />PREMIUM
              </span>
            )}
          </h1>

          {/* ★ 관리자 전용 — 폐업 등으로 실제 존재하지 않는 장소를 정리하기 위한 삭제 메뉴.
              공공데이터(식품안전나라·관광공사·문화정보원) 출처 장소는 Supabase에 실제 행이
              없는 합성 ID라 진짜로 지울 순 없지만, handleDeletePlace가 대신 차단 목록에
              올려 숨김 처리합니다 — 그래서 여기서도 isPublicDataPlace 여부와 무관하게
              노출합니다.
              onAdminMenu가 전달된 경우(모달 안에서 렌더링될 때)는 모달 자체의 헤더
              점세개 버튼이 이 메뉴를 대신 보여주므로, 여기서는 중복 렌더링하지 않습니다. */}
          {!onAdminMenu && isAdmin && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => { closeAll(); setShowPlaceMenu((v) => !v); }}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2 }}
              >
                <MoreVertical size={17} color="#999" />
              </button>
              {showPlaceMenu && (
                <div style={{ position: "absolute", top: "22px", right: 0, width: "120px", background: "white", border: "1px solid #eee", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)", overflow: "hidden", zIndex: 5 }}>
                  <button
                    onClick={handleDeletePlace}
                    disabled={deletingPlace}
                    style={{ ...dropdownBtnStyle, color: "#ef4444", display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <Trash2 size={12} color="#ef4444" />
                    {deletingPlace ? "처리 중..." : (isPublicDataPlace && !isCsvSourcedPublicData) ? "숨기기" : "삭제하기"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 주소 */}
        <p style={{ margin: "0 0 10px", fontSize: "11px", color: "#888", display: "flex", alignItems: "center", gap: "3px" }}>
          <MapPin size={11} color="#bbb" />
          {place.address}
        </p>

        {/* 반려동물 친화도 점수 — 0~100점 + 신호등(초록/노랑/빨강) 배지 */}
        {affinity && (() => {
          const tier = getAffinityTier(affinity.total);
          return (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 12, marginBottom: 10,
              background: AFFINITY_TIER_BG[tier],
              border: `1px solid ${AFFINITY_TIER_COLOR[tier]}33`,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                background: AFFINITY_TIER_COLOR[tier],
                color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 13,
              }}>
                {affinity.total}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="ggk-title" style={{ fontSize: 12, fontWeight: 800, color: "#222" }}>
                  반려동물 친화도 {affinity.total}점 · {AFFINITY_TIER_LABEL[tier]}
                </div>
                <div className="ggk-body" style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                  리뷰 만족도 {affinity.reviewSatisfaction} · 공공데이터 검증 {affinity.governmentVerification} · 사용자 반응 {affinity.userReaction} · 편의시설 {affinity.amenity}
                </div>
              </div>
            </div>
          );
        })()}

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

        {/* 사장님 본인 업장 수정 패널 — 인증된 사장님이 본인 업장을 볼 때만 노출 ★ */}
        {userProfile?.owner_status === "verified" &&
          userProfile?.owner_place_id != null &&
          String(userProfile.owner_place_id) === String(place.id) && (
            <OwnerPlaceEditPanel
              place={place}
              onUpdated={(fields) => setPlace((p: any) => ({ ...p, ...fields }))}
            />
        )}

        {/* 이미지 갤러리 */}
        <div style={{ position: "relative" }}>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
          {!hasRealPhoto ? (
            <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "6px" }}>
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
              {allGalleryImages.map((img, idx) => (
                <div key={img.id} style={{ position:"relative", flexShrink:0, width:"130px", height:"130px" }}>
                  <div onClick={() => { setSelectedImage(img.image_url); setSelectedImageIndex(idx); }} style={{ cursor:"pointer", width:"100%", height:"100%", borderRadius:"12px", overflow:"hidden", border:"1px solid #eee" }}>
                    <img src={img.image_url} alt="장소 이미지" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                  </div>
                  {/* 이미지가 실제 장소와 다르거나 부적절한 경우 신고 — 장소 신고(reports.type="place")와
                      같은 데이터 모델을 쓰되, 어떤 사진인지 사유에 자동으로 표시해 관리자가 구분할 수 있게 합니다. */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const imageLabel = img.id === -1 ? "대표 이미지" : `${idx + 1}번째 사진`;
                      setReportTargetType("place_image");
                      setReportTargetId(String(placeId));
                      setReportingId(`image_${img.id}`);
                      setReportCategory("wrong_image");
                      setReportReason(`[${imageLabel}] `);
                    }}
                    title="이 사진 신고하기"
                    style={{ position:"absolute", top:6, right:6, width:24, height:24, borderRadius:"50%", border:"none", background:"rgba(0,0,0,0.45)", color:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}
                  >
                    <Flag size={12} />
                  </button>
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

          {/* 행1: 카테고리 / 동반 가능 범위 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid #eee" }}>
            <div style={{ padding:"10px 12px", borderRight:"1px solid #eee" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, letterSpacing:"0.2px", display:"flex", alignItems:"center", gap:"3px" }}>
                <ChefHat size={10} />카테고리
              </div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                {place.category || "—"}
              </div>
            </div>
            <div style={{ padding:"10px 12px" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, letterSpacing:"0.2px", display:"flex", alignItems:"center", gap:"3px" }}>
                <LandPlot size={10} />동반 가능 범위
              </div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                {getPetZoneLabel(place.pet_zone) || "—"}
              </div>
            </div>
          </div>

          {/* 행2: 영업시간 / 대형견 가능 여부 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid #eee" }}>
            <div style={{ padding:"10px 12px", borderRight:"1px solid #eee" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                <Clock size={10} />영업시간
              </div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500, lineHeight:1.6 }}>
                <MultilineText text={place.hours} />
              </div>
            </div>
            <div style={{ padding:"10px 12px" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                <Dog size={10} />대형견 가능 여부
              </div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                {place.large_dog ? "가능" : "불가"}
              </div>
            </div>
          </div>

          {/* 행2-1: 동물병원 전용 — 진료과목 / 가능 동물 */}
          {isVetHospital && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid #eee" }}>
              <div style={{ padding:"10px 12px", borderRight:"1px solid #eee" }}>
                <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                  <Stethoscope size={10} />진료과목
                </div>
                <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                  {vetDepartment}
                </div>
              </div>
              <div style={{ padding:"10px 12px" }}>
                <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                  <PawPrint size={10} />가능 동물
                </div>
                <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                  {vetTreatableAnimals}
                </div>
              </div>
            </div>
          )}

          {/* 행3: 전화번호 (+ 동물병원이 아닌 일반 장소는 옆의 빈 공간에 가능 동물도 함께 표시) */}
          {isVetHospital ? (
            <div style={{ padding:"10px 12px", borderBottom:"1px solid #eee" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                <Phone size={10} />전화번호
              </div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                {place.phone
                  ? <a href={`tel:${place.phone}`} style={{ color:"#2563eb", textDecoration:"none", fontWeight:600 }}>
                      {place.phone}
                    </a>
                  : "—"
                }
              </div>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid #eee" }}>
              <div style={{ padding:"10px 12px", borderRight:"1px solid #eee" }}>
                <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                  <Phone size={10} />전화번호
                </div>
                <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                  {place.phone
                    ? <a href={`tel:${place.phone}`} style={{ color:"#2563eb", textDecoration:"none", fontWeight:600 }}>
                        {place.phone}
                      </a>
                    : "—"
                  }
                </div>
              </div>
              <div style={{ padding:"10px 12px" }}>
                <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                  <PawPrint size={10} />가능 동물
                </div>
                <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                  {generalTreatableAnimals}
                </div>
              </div>
            </div>
          )}

          {/* 행4: 홈페이지 / 휴무일  ← 신규 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid #eee" }}>
            <div style={{ padding:"10px 12px", borderRight:"1px solid #eee" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                <Globe size={10} />홈페이지
              </div>
              <div className="ggk-body" style={{ fontSize:"12px", fontWeight:500 }}>
                {hasInfo(place.website)
                  ? <a href={place.website} target="_blank" rel="noreferrer"
                      style={{ color:"#2563eb", textDecoration:"none", fontWeight:600 }}>
                      바로가기
                    </a>
                  : <span style={{ color:"#222" }}>—</span>
                }
              </div>
            </div>
            <div style={{ padding:"10px 12px" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                <CalendarOff size={10} />휴무일
              </div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                {place.closed_days || "—"}
              </div>
            </div>
          </div>

          {/* 행5: 주차 / 입장료  ← 신규 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", borderBottom:"1px solid #eee" }}>
            <div style={{ padding:"10px 12px", borderRight:"1px solid #eee" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                <Car size={10} />주차
              </div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                {place.parking || "—"}
              </div>
            </div>
            <div style={{ padding:"10px 12px" }}>
              <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
                <Ticket size={10} />입장료
              </div>
              <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500 }}>
                {place.entry_fee || "—"}
              </div>
            </div>
          </div>

          {/* 행6: 메모 (단독) */}
          <div style={{ padding:"10px 12px", borderTop:"1px solid #eee" }}>
            <div className="ggk-title" style={{ fontSize:"10px", color:"#aaa", marginBottom:"3px", fontWeight:800, display:"flex", alignItems:"center", gap:"3px" }}>
              <MessageCircle size={10} />메모
            </div>
            <div className="ggk-body" style={{ fontSize:"12px", color:"#222", fontWeight:500, lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
              {place.memo || " "}
            </div>
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
              const hasReplies = replies.some(
                (reply) => reply.review_id === r.id && !reply.deleted
              );
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
              const hasReplies = replies.some(
                (reply) => reply.review_id === r.id && !reply.deleted
              );
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
                      {!r.deleted && !r.is_admin_deleted && (
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
                            /* ★ 관리자: 삭제만 */
                            <button onClick={() => handleAdminDeleteReview(r.id)} style={{ ...dropdownBtnStyle, color:"#7c3aed", display:"flex", alignItems:"center", gap:5 }}>
                              <Shield size={11} color="#7c3aed" />관리자 삭제
                            </button>
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
                      {r.is_admin_deleted ? "부적절한 내용으로 관리자에 의해 삭제되었습니다." : r.deleted ? "삭제된 댓글입니다." : r.content}
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
                          {!reply.deleted && !reply.is_admin_deleted && (
                            <button onClick={() => { closeAll(); setOpenedReplyMenuId(openedReplyMenuId===reply.id?null:reply.id); }} style={{ border:"none", background:"transparent", cursor:"pointer", padding:0 }}>
                              <MoreVertical size={13} color="#999" />
                            </button>
                          )}
                          {openedReplyMenuId === reply.id && (
                            <div style={{ position:"absolute", top:"18px", right:0, width:"120px", background:"white", border:"1px solid #eee", borderRadius:"10px", boxShadow:"0 4px 16px rgba(0,0,0,0.10)", overflow:"hidden", zIndex:5 }}>
                              {isOwnerReply(reply) ? (
                                <>
                                  <button onClick={() => { closeAll(); setEditingReplyId(reply.id); setEditReplyContent(reply.content); }} style={dropdownBtnStyle}>수정</button>
                                  <button onClick={() => { closeAll(); setDeletingReplyId(reply.id); }} style={{ ...dropdownBtnStyle, color:"#ef4444" }}>삭제</button>
                                </>
                              ) : isAdmin ? (
                                /* ★ 관리자: 삭제만 */
                                <button onClick={() => handleAdminDeleteReply(reply.id)} style={{ ...dropdownBtnStyle, color:"#7c3aed", display:"flex", alignItems:"center", gap:5 }}>
                                  <Shield size={11} color="#7c3aed" />관리자 삭제
                                </button>
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
                          {reply.is_admin_deleted
                            ? "부적절한 내용으로 관리자에 의해 삭제되었습니다."
                            : reply.deleted
                              ? "삭제된 답글입니다."
                              : reply.content}
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
          <div onClick={() => { setReportingId(null); setReportingReplyId(null); setReportTargetType(null); setReportTargetId(null); setReportCategory(""); setReportReason(""); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
            <div onClick={(e) => e.stopPropagation()} className="ggk-body" style={{ width:"100%", maxWidth:"380px", background:"white", borderRadius:"18px", padding:"20px", boxSizing:"border-box", boxShadow:"0 16px 48px rgba(0,0,0,0.22)" }}>
              <h2 className="ggk-title" style={{ margin:0, marginBottom:"16px", fontSize:"18px", fontWeight:800 }}>신고하기</h2>
              <div style={{ marginBottom:"12px" }}>
                <div style={{ fontSize:"11px", fontWeight:700, marginBottom:"6px", color:"#444" }}>신고 유형</div>
                <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)} style={{ width:"100%", padding:"9px 10px", borderRadius:"8px", border:"1px solid #ddd", fontSize:"12px", outline:"none" }}>
                  <option value="">선택해주세요</option>
                  {reportTargetType === "place_image" && (
                    <option value="wrong_image">등록된 이미지가 실제 장소와 다름/잘못됨</option>
                  )}
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
                <button onClick={() => { setReportingId(null); setReportingReplyId(null); setReportTargetType(null); setReportTargetId(null); setReportCategory(""); setReportReason(""); }} style={{ flex:1, padding:"11px", borderRadius:"8px", border:"1px solid #ddd", background:"white", cursor:"pointer", fontWeight:700, fontSize:"12px" }}>취소</button>
                <button
                  disabled={!reportCategory||!reportReason.trim()}
                  onClick={async () => {
                    const userKey = getUserKey();
                    // 이미지 신고는 특정 리뷰/답글 작성자가 없으므로 닉네임 조회를 건너뜁니다.
                    const targetReview =
                      reportTargetType === "review"
                        ? reviews.find((r) => r.id === reportTargetId)
                        : reportTargetType === "reply"
                        ? replies.find((r) => r.id === reportTargetId)
                        : null;

                    const { error } = await supabase
                      .from("reports")
                      .insert([
                        {
                          // 이미지 신고는 관리자 페이지의 "장소 신고"(type="place")와 같은 모델로 들어가고,
                          // 어떤 사진인지는 report_reason 앞부분에 자동으로 표시됩니다.
                          type: reportTargetType === "place_image" ? "place" : reportTargetType,

                          target_id: String(reportTargetId),

                          // 장소 상세 이동용
                          place_id: placeId,

                          // ⚠ 관리자 페이지가 매번 places 테이블을 다시 조회해 이름을
                          // 맞추면, 공공데이터 출처(합성 ID) 장소는 항상 "—"로 보였습니다.
                          // 지금 화면에 이미 떠 있는 이름/주소를 그대로 같이 저장해둡니다.
                          place_name: place?.name || null,
                          place_address: place?.address || null,

                          reporter_key: userKey,

                          // 신고 유형
                          report_category: reportCategory,

                          // 상세 신고 사유
                          report_reason: reportReason,

                          // 신고 대상 작성자 (이미지 신고는 특정 작성자가 없음)
                          nickname: reportTargetType === "place_image" ? "—" : targetReview?.nickname || "—",
                        },
                      ]);
                    if (error) {
                      // ⚠ 예전엔 콘솔에만 찍고 화면엔 아무 알림이 없어 신고가 됐는지 알 수
                      // 없었습니다. 공공데이터 출처 장소는 place_id에 FK/정수범위 문제가
                      // 있을 수 있어(scripts/sql/fix-reports-place-id.sql 참고) 실제
                      // 에러 메시지를 그대로 알려줍니다.
                      console.error("신고 오류:", error.message, error.details, error.hint, error.code);
                      alert("신고 접수에 실패했습니다: " + (error.message || "알 수 없는 오류"));
                      return;
                    }
                    alert("신고가 정상적으로 접수되었습니다.");
                    setReportingId(null); setReportingReplyId(null); setReportTargetType(null); setReportTargetId(null); setReportCategory(""); setReportReason("");
                  }}
                  style={{ flex:1, padding:"11px", borderRadius:"8px", border:"none", background:(!reportCategory||!reportReason.trim())?"#ccc":"#ef4444", color:"white", cursor:(!reportCategory||!reportReason.trim())?"default":"pointer", fontWeight:700, fontSize:"12px" }}
                >신고하기</button>
              </div>
            </div>
          </div>
        )}

        {/* 이미지 확대 모달 */}
        {selectedImage && (
          <div
            onClick={() => setSelectedImage(null)}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ position:"relative", display:"flex", alignItems:"center", gap:"12px" }}>

              {/* 닫기 버튼 */}
              <button
                onClick={() => setSelectedImage(null)}
                style={{ position:"absolute", top:"-44px", right:0, width:"34px", height:"34px", borderRadius:"50%", border:"none", background:"rgba(0,0,0,0.55)", color:"white", cursor:"pointer", zIndex:2, backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center" }}
              ><X size={16} color="white" /></button>

              {/* 이전 버튼 */}
              <button
                onClick={() => {
                  const prevIdx = (selectedImageIndex - 1 + allGalleryImages.length) % allGalleryImages.length;
                  setSelectedImageIndex(prevIdx);
                  setSelectedImage(allGalleryImages[prevIdx].image_url);
                }}
                style={{ width:"40px", height:"40px", borderRadius:"50%", border:"none", background:"rgba(255,255,255,0.15)", color:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)", flexShrink:0, transition:"background 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.30)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
              >
                <ChevronLeft size={22} color="white" />
              </button>

              {/* 이미지 */}
              <div style={{ position:"relative" }}>
                <img
                  src={selectedImage}
                  alt="확대 이미지"
                  style={{ maxWidth:"80vw", maxHeight:"85vh", borderRadius:"14px", objectFit:"contain", display:"block" }}
                />
                {/* 인덱스 표시 */}
                <div style={{ position:"absolute", bottom:"12px", left:"50%", transform:"translateX(-50%)", background:"rgba(0,0,0,0.5)", color:"white", fontSize:"12px", fontWeight:600, padding:"4px 12px", borderRadius:"999px", backdropFilter:"blur(4px)", whiteSpace:"nowrap" }}>
                  {selectedImageIndex + 1} / {allGalleryImages.length}
                </div>
              </div>

              {/* 다음 버튼 */}
              <button
                onClick={() => {
                  const nextIdx = (selectedImageIndex + 1) % allGalleryImages.length;
                  setSelectedImageIndex(nextIdx);
                  setSelectedImage(allGalleryImages[nextIdx].image_url);
                }}
                style={{ width:"40px", height:"40px", borderRadius:"50%", border:"none", background:"rgba(255,255,255,0.15)", color:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)", flexShrink:0, transition:"background 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.30)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
              >
                <ChevronRight size={22} color="white" />
              </button>

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