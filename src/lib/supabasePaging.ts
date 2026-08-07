// src/lib/supabasePaging.ts
//
// Supabase(PostgREST)는 .range()를 안 주면 한 번에 최대 1000행만 돌려줍니다(프로젝트
// 기본 max-rows 설정). culture_facilities(21,000여 건)처럼 1000행이 넘는 테이블을
// select()만으로 읽으면 조용히 앞쪽 1000건만 반환되고 나머지는 지도에 안 뜨는 문제가
// 있었습니다(에러가 안 나서 알아채기 어렵습니다). 이 헬퍼로 1000건씩 끊어 전량을 가져옵니다.

import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 1000;

export async function fetchAllRows(table: string, columns: string): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`${table} 조회 오류:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break; // 마지막 페이지
    from += PAGE_SIZE;
  }
  return all;
}
