// src/lib/supabasePaging.ts
//
// Supabase(PostgREST)는 .range()를 안 주면 한 번에 최대 1000행만 돌려줍니다(프로젝트
// 기본 max-rows 설정). culture_facilities(21,000여 건)처럼 1000행이 넘는 테이블을
// select()만으로 읽으면 조용히 앞쪽 1000건만 반환되고 나머지는 지도에 안 뜨는 문제가
// 있었습니다(에러가 안 나서 알아채기 어렵습니다). 이 헬퍼로 1000건씩 끊어 전량을 가져옵니다.
//
// ⚠ 최적화(2026.08.11): 예전엔 이 페이지들을 for 루프 안에서 하나씩 await하며
// 순차적으로 가져왔습니다 — culture_facilities처럼 21,000여 건(22페이지)인 테이블은
// 왕복 지연시간(RTT)이 22번 그대로 누적돼 느렸습니다. 먼저 count(head 요청, 데이터 없이
// 총 개수만 반환해 빠름)로 전체 페이지 수를 구한 뒤, 모든 페이지를 Promise.all로 동시에
// 요청하도록 바꿔서 총 대기시간을 "가장 느린 페이지 1개" 수준으로 줄였습니다.
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 1000;

export async function fetchAllRows(table: string, columns: string): Promise<any[]> {
  // 1) 전체 행 수를 먼저 파악합니다(head:true라 실제 데이터는 안 내려오고 카운트만 옵니다).
  const { count, error: countError } = await supabase
    .from(table)
    .select(columns, { count: "exact", head: true });

  if (countError || count == null) {
    // count를 못 구하면(권한 문제 등) 예전처럼 순차 페이지네이션으로 안전하게 폴백합니다.
    return fetchAllRowsSequential(table, columns);
  }
  if (count === 0) return [];

  // 2) 필요한 페이지 수만큼 한 번에 병렬 요청합니다.
  const pageCount = Math.ceil(count / PAGE_SIZE);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => {
      const from = i * PAGE_SIZE;
      return supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    })
  );

  const all: any[] = [];
  for (const { data, error } of pages) {
    if (error) {
      console.error(`${table} 조회 오류:`, error.message);
      continue;
    }
    if (data) all.push(...data);
  }
  return all;
}

/** count 조회가 실패했을 때만 쓰는 예전 방식 순차 폴백. */
async function fetchAllRowsSequential(table: string, columns: string): Promise<any[]> {
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
