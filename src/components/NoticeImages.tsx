"use client";

// 가게 공지에 붙은 사진(최대 4장) — 장소 상세 공지·숙소 소식에서 함께 씁니다. 누르면 원본을 새 창으로 엽니다.

export default function NoticeImages({ images, size = 120 }: { images?: string[] | null; size?: number }) {
  if (!images || images.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
      {images.map((src) => (
        <a key={src} href={src} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
          <img src={src} alt="공지 사진" loading="lazy" style={{ display: "block", width: size, height: size, objectFit: "cover", borderRadius: 10, border: "1px solid #EDECEB" }} />
        </a>
      ))}
    </div>
  );
}
