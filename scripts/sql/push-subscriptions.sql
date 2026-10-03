-- ── 브라우저 알림 구독(유기동물 공고 지역 알림) ──
-- Supabase SQL 편집기에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 사용자가 "내 지역 새 공고 알림 받기"를 켜면 브라우저가 발급한 구독 정보(알림을 보낼 주소와 암호화 키)를
-- 여기에 저장합니다. 새벽 자동 작업이 지역별 새 공고를 찾아 이 구독자들에게 알림을 보냅니다.
-- 이름·연락처 같은 개인정보는 저장하지 않습니다(브라우저 구독 주소와 지역뿐).

create table if not exists push_subscriptions (
  endpoint text primary key,          -- 브라우저가 발급한 알림 수신 주소(구독마다 고유)
  p256dh text not null,               -- 알림 내용 암호화용 공개 키
  auth text not null,                 -- 알림 인증 값
  region text not null,               -- 알림 받을 시/도(짧은 이름: 서울, 대구 …)
  auth_user_id uuid,                  -- 로그인 사용자면 계정(탈퇴 시 정리용), 비회원이면 null
  created_at timestamptz default now(),
  last_sent_at timestamptz            -- 마지막으로 알림을 보낸 시각
);
create index if not exists idx_push_subscriptions_region on push_subscriptions(region);

-- 브라우저에서 직접 읽거나 쓰지 못하게 막습니다(정책 없음 = 서버만 접근). 등록·해제는 서버 API가 합니다.
alter table push_subscriptions enable row level security;

-- ── 확인용 ──
-- select region, count(*) from push_subscriptions group by region;
