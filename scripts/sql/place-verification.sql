-- scripts/sql/place-verification.sql
--
-- 장소 정보의 "최신성"을 보여 주기 위한 표(심사 의견: 공공데이터는 갱신이 느리니 정확성·최신성 확보 방안 필요).
-- Supabase SQL 편집기에서 한 번 실행하세요(여러 번 실행해도 안전합니다).
--
--   1) places.owner_verified_at : 사장님이 정보를 수정하거나 "지금 정보가 맞아요"를 누른 때
--   2) place_checks             : 다녀온 이용자의 확인 — "정보가 맞아요"(ok) 또는 "달라졌어요"(changed: 동반 불가·폐업·정보 다름)
--
-- place_checks.place_id는 공공데이터 장소(번호 10억 이상)도 담아야 해서 places 표와 연결(외래키)하지 않습니다.
-- ⚠ RLS를 켜고 정책을 만들지 않습니다 = 브라우저로는 읽지도 쓰지도 못하고, 서버(/api/place-checks)만 대신 합니다.

alter table public.places add column if not exists owner_verified_at timestamptz;

create table if not exists public.place_checks (
  id            bigserial primary key,
  place_id      bigint not null,
  verdict       text not null check (verdict in ('ok', 'changed')),
  detail        text check (detail in ('no_pets', 'closed', 'info')),  -- changed일 때 무엇이 달라졌는지
  auth_user_id  uuid,                                                  -- 로그인한 회원
  user_key      text,                                                  -- 비회원 기기 식별값(로그인하지 않은 경우)
  created_at    timestamptz not null default now()
);
create index if not exists place_checks_place_idx on public.place_checks (place_id, created_at desc);
create index if not exists place_checks_changed_idx on public.place_checks (created_at desc) where verdict = 'changed';
alter table public.place_checks enable row level security;

notify pgrst, 'reload schema';
