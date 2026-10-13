import SupportClient from "./SupportClient";
import { getShelterDirectory } from "@/lib/server/shelterDirectory";
import { loadSupportOrgs } from "@/lib/server/supportOrgs";

// ⚠ 속도: 예전에는 빈 화면을 먼저 보내고 브라우저가 뜬 뒤에 목록을 받아 왔습니다(그동안 "불러오는 중").
// 이제 서버가 보호센터 목록과 후원 단체를 화면에 채워서 보내고, 이 화면을 10분마다 새로 만들어 둡니다.
export const revalidate = 600;

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export default async function ShelterSupportPage() {
  const [shelters, orgs] = await Promise.all([getShelterDirectory().catch(() => []), loadSupportOrgs().catch(() => [])]);
  // 운영 중에 새로 만들다가 목록을 못 받았으면 오류를 내서 직전 화면을 계속 보여 줍니다(빈 화면으로 덮어쓰지 않게).
  // 배포할 때(빌드)는 빈 채로 두고, 브라우저가 뜬 뒤에 받아 옵니다.
  if (shelters.length === 0 && !IS_BUILD) throw new Error("보호센터 목록을 받지 못했습니다");
  return (
    <SupportClient
      initialShelters={shelters.length > 0 ? shelters : null}
      initialOrgs={orgs.filter((org) => !org.hidden).map(({ id, name, description, url }) => ({ id, name, description, url }))}
    />
  );
}
