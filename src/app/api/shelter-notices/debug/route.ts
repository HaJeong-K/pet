import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { getRegionShelterNotices, getLastOpenApiDebug } from "@/lib/shelterNotices";

// GET /api/shelter-notices/debug
// ⚠ 운영(배포) 환경에서는 관리자만 볼 수 있습니다(Authorization: Bearer <관리자 로그인 토큰>).
// 예전엔 누구나 열 수 있어서, 외부에서 반복 호출해 공공데이터 API 한도를 소진시키거나 키 설정
// 상태 같은 내부 정보를 볼 수 있었습니다. 개발 중(로컬)에는 그대로 주소창에서 열어 볼 수 있습니다.
// 브라우저 주소창에 이 URL을 그대로 열어보면(개발 환경), Open API 키가
// 제대로 동작하는지 바로 확인할 수 있습니다. 서버 로그를 볼 필요 없이 화면에 결과가 뜹니다.
//   - keySet: 환경변수 ANIMAL_OPEN_API_KEY가 배포 환경에 실제로 들어가 있는지
//   - openApi: Open API 호출 결과 진단(성공 여부, data.go.kr이 내려준 resultCode/resultMsg 등)
//   - noticeCount / sampleNotice: 실제로 파싱된 공고 개수와 첫 번째 공고 미리보기
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !(await requireAdmin(req))) {
    return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
  }
  const keySet = Boolean(process.env.ANIMAL_OPEN_API_KEY);

  let notices: any[] = [];
  let fetchError: string | null = null;
  try {
    notices = await getRegionShelterNotices(null, 5);
  } catch (e) {
    fetchError = String(e);
  }

  return NextResponse.json({
    keySet,
    openApi: getLastOpenApiDebug(),
    noticeCount: notices.length,
    sampleNotice: notices[0] ?? null,
    fetchError,
  });
}
