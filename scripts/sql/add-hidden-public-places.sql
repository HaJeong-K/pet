-- ── 공공데이터 출처 장소 "숨김(삭제)" 처리용 테이블 ──
-- Supabase SQL 편집기에서 그대로 실행하세요.
--
-- 배경: 관광공사·문화정보원·식품안전나라 공공데이터 출처 장소는 Supabase `places`
-- 테이블에 실제 행이 없는 합성 ID라(src/lib/publicDataPlaces.ts의 toNumericId 참고)
-- 지금까지는 관리자도 "장소 삭제하기"를 쓸 수 없었습니다(지울 실제 행이 없으므로).
--
-- 하지만 폐업 등으로 실제로는 없어진 장소를 최신화해야 하는 요구가 있어서, 실제로
-- 행을 지우는 대신 "이 합성 ID는 지도에 다시 표시하지 않는다"는 차단 목록을 둡니다.
-- src/lib/publicDataPlaces.ts가 공공데이터를 불러올 때마다 이 목록에 있는 id를
-- 걸러내고 반환하므로, 결과적으로 지도/리스트/검색 어디에도 다시 나타나지 않습니다.

create table if not exists public.hidden_public_places (
  place_id bigint primary key,
  reason text,
  hidden_by text,
  hidden_at timestamptz not null default now()
);

alter table public.hidden_public_places enable row level security;

-- 이 목록은 지도가 공공데이터를 로드할 때마다 읽어야 하므로 누구나 조회 가능해야
-- 합니다(민감 정보 없음 — id/사유/시각뿐). 쓰기(추가)는 관리자만 가능하도록
-- /api/admin/hide-public-place 서버 라우트(service role 키 사용)를 통해서만 합니다.
drop policy if exists "hidden_public_places_select_all" on public.hidden_public_places;
create policy "hidden_public_places_select_all"
  on public.hidden_public_places for select
  using (true);
