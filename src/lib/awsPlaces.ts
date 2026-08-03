// lib/awsPlaces.ts
//
// ⚠ 폐기됨 (더 이상 사용하지 않음)
// AWS(DynamoDB + Lambda)를 통해 제공되던 전국 장소 데이터는
// scripts/migrate-aws-to-supabase.mjs 로 Supabase `places` 테이블에 전량(2,592건)
// 이관 완료되었습니다(2026-08-03). 이제 앱의 모든 장소 데이터는 Supabase 하나로
// 통합되어 AWS Lambda/DynamoDB/API Gateway를 별도로 호출하지 않습니다.
//
// 코드에서 이 파일의 fetchAwsPlaces() 호출부는 모두 제거되었습니다
// (src/components/KakaoMap.tsx, src/app/place/[id]/page.tsx 참고).
// 이 파일은 현재 어디에서도 import되지 않는 죽은 코드이며, 실수로 되살아나지
// 않도록 의도적으로 빈 함수만 남겨둡니다. 완전히 지우려면(선택 사항) 로컬에서
// `git rm src/lib/awsPlaces.ts` 를 실행해주세요.
//
// 실제 AWS 리소스(Lambda 함수, DynamoDB 테이블, API Gateway)는 코드와 별개로
// AWS 콘솔에서 직접 삭제해야 비용이 발생하지 않습니다 — 이 파일 정리만으로는
// AWS 쪽 과금이 멈추지 않습니다.

export async function fetchAwsPlaces(): Promise<any[]> {
  console.warn(
    "[awsPlaces] 폐기된 함수입니다. AWS 데이터는 Supabase로 이관되었으니 이 함수를 호출하는 코드가 있다면 제거해주세요."
  );
  return [];
}
