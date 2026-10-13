import ShelterDetailClient from "./ShelterDetailClient";
import { getShelterWithNotices } from "@/lib/server/shelterDirectory";

// ⚠ 속도: 보호센터 한 곳의 공고를 서버가 화면에 채워서 보냅니다(예전에는 화면이 뜬 뒤에 받아 와 "불러오는 중"이 보였음).
// 한 번 만든 화면은 10분 동안 그대로 쓰고, 처음 열리는 보호센터는 그때 만듭니다.
export const revalidate = 600;
export const dynamicParams = true;
export function generateStaticParams() { return []; }

export default async function ShelterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id).slice(0, 80);
  const found = await getShelterWithNotices(id).catch(() => undefined);
  // undefined = 서버가 확인하지 못함(브라우저가 다시 받아 봄), null = 그런 보호센터가 없음
  // 카드 위 문구 순서를 정하는 숫자 — 화면을 새로 만들 때마다 바뀝니다(서버와 브라우저가 같은 값을 써야 화면이 어긋나지 않음).
  const phraseSeed = Math.floor(Date.now() / 1000);
  return <ShelterDetailClient id={id} initial={found === undefined ? null : found ?? "missing"} phraseSeed={phraseSeed} />;
}
