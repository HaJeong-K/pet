"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";

export default function PlaceDetail() {
  const params = useParams();
  const id = params.id as string;

  const [place, setPlace] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);

  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [content, setContent] = useState("");

  const [sort, setSort] = useState<"latest" | "like">("latest");

  // 📌 데이터 불러오기
  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("places")
        .select("*")
        .eq("id", id)
        .single();

      setPlace(data);

      const { data: reviewData } = await supabase
        .from("reviews")
        .select("*")
        .eq("place_id", id);

      setReviews(reviewData || []);
    };

    if (id) fetchData();
  }, [id]);

  // 📌 리뷰 작성
  const handleSubmit = async () => {
    if (!nickname || !password || !content) return;

    const { data } = await supabase.from("reviews").insert([
      {
        place_id: id,
        nickname,
        password,
        content,
        likes: 0,
      },
    ]);

    if (data) {
      setReviews([...reviews, ...data]);
      setContent("");
    }
  };

  // 📌 좋아요
  const likeReview = async (reviewId: number) => {
    const review = reviews.find((r) => r.id === reviewId);
    if (!review) return;

    await supabase
      .from("reviews")
      .update({ likes: (review.likes || 0) + 1 })
      .eq("id", reviewId);

    setReviews(
      reviews.map((r) =>
        r.id === reviewId
          ? { ...r, likes: (r.likes || 0) + 1 }
          : r
      )
    );
  };

  if (!place) return <div>로딩중...</div>;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>

      {/* ================= 가게 정보 ================= */}
      <h1 style={{ fontSize: "28px", fontWeight: "bold" }}>
        {place.name}
      </h1>

      <p style={{ color: "#666" }}>{place.category}</p>

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

      <div style={{ marginTop: "20px" }}>
        <h3>🐾 반려동물 정보</h3>
        <p>동반 가능: {place.pet_zone}</p>
        <p>대형견 가능: {place.large_dog ? "가능" : "불가"}</p>
        <p>펫 메뉴: {place.pet_menu}</p>
      </div>

      {/* ================= 액션 버튼 (수정됨) ================= */}
      <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
        <button>❤️ 찜</button>
        <button>👍 추천</button>
        <button>👎 비추천</button>

        <a
          href={`https://map.naver.com/v5/search/${place.name}`}
          target="_blank"
        >
          🗺 네이버 지도
        </a>
      </div>

      {/* ================= 댓글 헤더 ================= */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "30px" }}>
        <h3>댓글 {reviews.length}개</h3>

        <div>
          <button onClick={() => setSort("latest")}>최신순</button>
          <button onClick={() => setSort("like")}>좋아요순</button>
        </div>
      </div>

      {/* ================= 댓글 작성 ================= */}
      <div
        style={{
          padding: "15px",
          background: "#f5f6f8",
          borderRadius: "10px",
          marginTop: "10px",
        }}
      >
        <input
          placeholder="닉네임"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />

        <input
          placeholder="비밀번호"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <textarea
          placeholder="댓글을 입력하세요"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        <button onClick={handleSubmit}>등록</button>
      </div>

      {/* ================= 댓글 리스트 ================= */}
      <div style={{ marginTop: "20px" }}>
        {reviews
          .sort((a, b) =>
            sort === "latest"
              ? b.id - a.id
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
              <div style={{ fontWeight: "bold" }}>
                🧑 {r.nickname}
              </div>

              <div style={{ marginTop: "5px" }}>
                {r.content}
              </div>

              <div style={{ marginTop: "8px" }}>
                <button onClick={() => likeReview(r.id)}>
                  ❤️ {r.likes || 0}
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}