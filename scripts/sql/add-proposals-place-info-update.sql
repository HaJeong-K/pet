-- ── 기존 장소의 "미기재 정보 추가/수정" 제안을 위한 proposals 확장 ──
-- Supabase SQL 편집기에서 그대로 실행하세요.
--
-- 지금까지 proposals 테이블은 "새 장소 등록 제보"(jebo) 용도로만 쓰였습니다.
-- 이제 장소 상세페이지 점세개 메뉴에 "장소 제보하기"(기존 장소의 빠진 정보를
-- 채워달라는 제안)를 추가하면서, 같은 테이블을 재사용하되 두 종류를 구분합니다.
--   - proposal_kind = 'new_place'   : 기존과 동일한 신규 장소 등록 제보
--   - proposal_kind = 'info_update' : 기존 장소(place_id)의 정보 추가/수정 제안
--
-- place_id는 신규 장소 제보에는 null이고, 정보 추가 제안에는 대상 장소의 id가
-- 들어갑니다(공공데이터 출처 장소는 실제 DB 행이 없는 합성 id일 수 있어, 승인 시
-- src/lib/applyInfoUpdateProposal.ts가 실제 행 존재 여부를 다시 확인합니다).

alter table public.proposals add column if not exists place_id bigint;
alter table public.proposals add column if not exists proposal_kind text not null default 'new_place';

-- places 테이블엔 있지만(사장님 정보수정 API가 씀) proposals엔 아직 없던 필드들 —
-- 정보 추가 제안에서 이 항목들도 제안할 수 있도록 추가합니다.
alter table public.proposals add column if not exists website text;
alter table public.proposals add column if not exists closed_days text;
alter table public.proposals add column if not exists parking text;
alter table public.proposals add column if not exists entry_fee text;
