// src/lib/imageUrl.ts
//
// 외부 이미지 주소를 https로 맞춥니다. 카카오 로그인 프로필 사진(k.kakaocdn.net)·관광공사 이미지
// 등은 http 주소로 오는데, next/image는 http 출처를 막아 두어(next.config.ts) 그대로 쓰면
// 화면 전체가 오류로 멈춥니다(마이페이지 프로필 사진에서 실제로 발생). 두 서버 모두 https를
// 지원하므로 저장·표시 전에 바꿔 씁니다.
export function toHttps<T extends string | null | undefined>(url: T): T {
  if (typeof url !== "string") return url;
  return (url.startsWith("http://") ? "https://" + url.slice("http://".length) : url) as T;
}
