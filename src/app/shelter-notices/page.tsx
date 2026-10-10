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
// 빈 결과(공고 서버가 잠깐 응답하지 않을 때)는 기억하지 않도록 오류로 돌립니다.
const getNationwideNotices = unstable_cache(async () => {
  const notices = await getRegionShelterNotices(null, 60);
  if (notices.length === 0) throw new Error("공고를 받지 못했습니다");
  return notices;
}, ["shelter-notices-initial-v2"], { revalidate: 300 });

// 배포할 때(빌드) 만드는 중인지 — 이때 공고를 못 받으면 빈 채로 만들어 두고, 브라우저가 예전처럼 직접 받습니다.
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

async function loadInitial(): Promise<ShelterNoticeLite[] | null> {
  try {
    const notices = await getNationwideNotices();
    // 목록 카드에 필요한 값만 보냅니다.
    return notices.map((n) => ({
      desertionNo: n.desertionNo, noticeNumber: n.noticeNumber, region: n.region, subRegion: n.subRegion,
      breed: n.breed, imageUrl: n.imageUrl, daysLeft: n.daysLeft,
    }));
  } catch (e) {
    console.error("[shelter-notices] 첫 목록 준비 실패:", e);
    // ⚠ 운영 중에 5분마다 화면을 새로 만들다가 실패한 경우: 여기서 오류를 내면 "공고가 채워진 직전 화면"을 계속
    // 보여 줍니다. 빈 화면을 새로 만들어 덮어쓰면, 다음에 성공할 때까지 모든 방문자가 빈 화면부터 보게 됩니다
    // (실제로 배포 직후 한 번 그렇게 됐습니다). 화면에 남은 공고가 조금 오래됐더라도 브라우저가 띄운 뒤 최신으로 바꿉니다.
    if (!IS_BUILD) throw e;
    return null;
  }
}

export default async function ShelterNoticesPage() {
  // 이 화면은 방문자가 기다리는 동안이 아니라 뒤에서 미리 만들어 두는 것이라, 공고 서버가 느려도 끝까지 기다립니다.
  // (예전에는 4초가 넘으면 빈 채로 만들었는데, 그 빈 화면이 5분 동안 모든 방문자에게 나갔습니다.)
  const initial = await loadInitial();
  // 카드 위 문구 순서를 정하는 숫자 — 화면을 새로 만들 때마다(5분마다) 바뀝니다.
  const phraseSeed = Math.floor(Date.now() / 1000);
  return <ShelterNoticesClient initial={initial} phraseSeed={phraseSeed} />;
}
