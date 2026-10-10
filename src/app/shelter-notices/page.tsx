import { unstable_cache } from "next/cache";
import ShelterNoticesClient from "./ShelterNoticesClient";
import { getRegionShelterNotices } from "@/lib/shelterNotices";
import type { ShelterNoticeLite } from "@/components/ShelterNoticeCard";

// ⚠ 속도: 예전에는 빈 화면을 먼저 보내고, 브라우저가 준비된 뒤에야 공고를 받아 왔습니다(폰에서 3초 가까이 걸림).
// 이제 서버가 전국 공고(마감임박순 60건)를 화면에 채워서 보냅니다 — 화면이 뜨는 순간 공고가 보이고,
// 내 지역을 알게 되면 그 지역 공고로 바뀝니다(ShelterNoticesClient). 이 화면은 5분마다 새로 만들어 둡니다.
export const revalidate = 300;

// 공고를 받아 오는 코드는 "매번 새로 받기"로 되어 있어서, 여기서 5분 동안 결과를 기억해 두도록 감쌉니다.
// (감싸지 않으면 이 화면이 방문할 때마다 서버에서 새로 만들어져 오히려 느려집니다.)
const getNationwideNotices = unstable_cache(() => getRegionShelterNotices(null, 60), ["shelter-notices-initial-v1"], { revalidate: 300 });

async function loadInitial(): Promise<ShelterNoticeLite[] | null> {
  try {
    const notices = await getNationwideNotices();
    // 목록 카드에 필요한 값만 보냅니다.
    return notices.map((n) => ({
      desertionNo: n.desertionNo, noticeNumber: n.noticeNumber, region: n.region, subRegion: n.subRegion,
      breed: n.breed, imageUrl: n.imageUrl, daysLeft: n.daysLeft,
    }));
  } catch (e) {
    // 서버에서 못 받아도 화면은 떠야 합니다 — 브라우저가 예전처럼 직접 받습니다.
    console.error("[shelter-notices] 첫 목록 준비 실패:", e);
    return null;
  }
}

export default async function ShelterNoticesPage() {
  // 너무 오래 걸리면(4초) 기다리지 않고 빈 채로 보냅니다.
  const initial = await Promise.race([loadInitial(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))]);
  // 카드 위 문구 순서를 정하는 숫자 — 화면을 새로 만들 때마다(5분마다) 바뀝니다.
  const phraseSeed = Math.floor(Date.now() / 1000);
  return <ShelterNoticesClient initial={initial} phraseSeed={phraseSeed} />;
}
