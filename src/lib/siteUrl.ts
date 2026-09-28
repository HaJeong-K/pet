// 사이트 절대 URL — OG 태그, canonical, sitemap, robots가 모두 여기 한 곳을 참조합니다.
// 도메인이 정해지면 배포 환경변수 NEXT_PUBLIC_SITE_URL만 바꾸면 됩니다(코드 수정 불필요).
// 미설정 시 Vercel 배포라면 자동 제공되는 프로덕션 도메인을, 그 외(로컬 개발)에는
// localhost를 사용합니다.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export const siteUrl = resolveSiteUrl();
