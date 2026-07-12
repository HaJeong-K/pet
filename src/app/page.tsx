import { Suspense } from "react";
import KakaoMap from "@/components/KakaoMap";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <KakaoMap />
    </Suspense>
  );
}