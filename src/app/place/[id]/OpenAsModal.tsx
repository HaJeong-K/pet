"use client";

// 장소 주소(/place/123)로 바로 들어오면(새 탭·새로고침·공유 링크·외부 링크) 예전엔 전체 화면으로 떴습니다.
// 이제 지도 화면으로 옮겨 그 위에 장소 창(모달)을 띄웁니다(2026-11-07 대표 요청) — 지도 안에서 누른 것과 똑같이 보입니다.
// 공유 미리보기(카카오톡·검색엔진)가 읽는 제목·사진은 이 주소의 서버 정보(generateMetadata)를 그대로 씁니다.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LogoLoader from "@/components/LogoLoader";

export default function OpenAsModal({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/?placeId=${encodeURIComponent(id)}`);
  }, [id, router]);
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 20000, background: "#FAF9F8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <LogoLoader />
    </div>
  );
}
