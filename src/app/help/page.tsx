import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "@/components/brand/BrandLogo";
import SiteFooter from "@/components/SiteFooter";
import { AUTO_CONFIRM_DAYS, BASIC_FEE_RATE } from "@/lib/lodgingPolicy";
import { APPEAL_DAYS, AUTO_HOLD_REPORTERS, SANCTION_STEPS } from "@/lib/sanctions";
import { FULL_REFUND_DAYS } from "@/lib/ownerPlans";

// 고객센터 · 자주 묻는 질문(/help) — 2026-11-13
// 예약·결제·취소·환불·쇼핑 주문·회원·제재 안내를 한 곳에 모았습니다(결제를 받는 서비스의 기본 안내).
// 숫자는 정책 파일의 값을 그대로 씁니다(lodgingPolicy.ts · sanctions.ts · ownerPlans.ts) — 정책이 바뀌면 여기도 함께 바뀝니다.

export const metadata: Metadata = {
  title: "고객센터 · 자주 묻는 질문 | 펫츠로드",
  description: "숙소 예약·결제·취소·환불, 쇼핑 주문, 회원 정보, 신고와 이용 제한까지 자주 묻는 질문을 모았어요.",
};

type Faq = { q: string; a: React.ReactNode };
const GROUPS: { id: string; title: string; items: Faq[] }[] = [
  {
    id: "stay", title: "숙소 예약·결제",
    items: [
      { q: "예약은 언제 확정되나요?", a: <>결제를 마치면 예약이 접수되고, 숙소가 확인하면 확정돼요.<br />확정·거절 결과는 마이페이지 알림으로 알려 드려요. 숙소가 거절하면 결제 금액은 전액 환불돼요.</> },
      { q: "현장에서 따로 내는 돈이 있나요?", a: <>없어요. 반려동물 추가 요금과 추가 인원·옵션 요금까지 예약할 때 한 번에 결제해요.<br />현장에서 추가 요금을 요구받으면 예약 상세의 &lsquo;문제 있어요&rsquo;로 알려 주세요.</> },
      { q: "반려동물 조건은 어떻게 확인하나요?", a: <>숙소마다 동반 가능한 종류·크기·몸무게·마릿수가 달라요.<br />예약할 때 반려동물 정보를 적으면 조건에 맞는지 자동으로 확인하고, 입실 규정에 동의를 받아요.<br />사실과 다르게 적으면 입실이 거절될 수 있어요.</> },
      { q: "이용 확정은 무엇인가요?", a: <>체크아웃 뒤 손님이 &lsquo;이용 확정&rsquo;을 누르면 숙소에 정산돼요.<br />누르지 않아도 체크아웃 {AUTO_CONFIRM_DAYS}일 뒤에는 자동으로 확정돼요. 문제가 있었다면 그 전에 알려 주세요.</> },
    ],
  },
  {
    id: "refund", title: "취소·환불",
    items: [
      { q: "숙소 예약을 취소하면 얼마나 환불되나요?", a: <>공정거래위원회 소비자분쟁해결기준(숙박업)을 따라요.<br />예약한 지 24시간 안이면 전액 환불돼요(체크인이 임박한 경우 제외).<br />그 뒤에는 체크인까지 남은 날과 성수기·주말 여부에 따라 환불 금액이 달라요.<br />취소하기 전에 예약 상세에서 지금 취소하면 돌려받는 금액을 먼저 확인할 수 있어요.</> },
      { q: "숙소 사정으로 취소되면요?", a: <>결제 금액 전액을 환불하고, 소비자분쟁해결기준에 따른 배상이 있으면 함께 안내해 드려요.</> },
      { q: "환불은 언제 들어오나요?", a: <>결제한 수단으로 돌려드려요. 카드사·간편결제사에 따라 영업일 기준 3~7일 걸릴 수 있어요.</> },
      { q: "날짜를 바꿀 수 있나요?", a: <>날짜 변경 기능은 없어요. 취소한 뒤 새로 예약해 주세요(환불 기준이 적용돼요).</> },
    ],
  },
  {
    id: "shop", title: "쇼핑(포장·매장 식사)",
    items: [
      { q: "포장 주문은 언제 받을 수 있나요?", a: <>포장은 주문한 당일에만 받을 수 있어요. 매장 식사 예약은 14일 안의 날짜로 할 수 있어요.</> },
      { q: "주문을 취소할 수 있나요?", a: <>가게가 수락하기 전에는 바로 취소되고 전액 환불돼요.<br />가게가 이미 수락했다면 주문 상세의 [취소 요청]으로 가게에 요청해 주세요.</> },
      { q: "가게가 주문을 거절하면요?", a: <>결제 금액은 전액 환불돼요. 결과는 마이페이지 알림으로 알려 드려요.</> },
    ],
  },
  {
    id: "member", title: "회원·개인정보",
    items: [
      { q: "이름과 휴대폰 번호는 왜 필요한가요?", a: <>예약·주문 확인 연락과 아이디 찾기에만 써요. 숙박 예약·쇼핑 주문·커뮤니티 글쓰기 전에 한 번 등록해요.</> },
      { q: "비회원도 이용할 수 있나요?", a: <>지도·장소 정보·입양 공고는 로그인 없이 볼 수 있고, 장소 후기는 비회원도 닉네임과 비밀번호로 남길 수 있어요.<br />커뮤니티 글쓰기, 숙박 예약, 쇼핑 주문은 회원만 할 수 있어요.</> },
      { q: "닉네임을 바꾸면 예전 글은 어떻게 되나요?", a: <>내가 쓴 커뮤니티 글·댓글과 장소 후기·답글의 닉네임도 함께 바뀌어요.</> },
      { q: "탈퇴하고 싶어요.", a: <>마이페이지에서 탈퇴할 수 있어요. 진행 중인 예약·주문이 있으면 먼저 끝내 주세요.<br />법으로 보관해야 하는 거래 기록은 정해진 기간 동안 보관한 뒤 지워요(개인정보처리방침 참고).</> },
    ],
  },
  {
    id: "rules", title: "신고·이용 제한",
    items: [
      { q: "부적절한 글은 어떻게 신고하나요?", a: <>글·댓글·후기의 메뉴에서 &lsquo;신고&rsquo;를 눌러 주세요. 운영진이 확인해요.<br />같은 글을 서로 다른 회원 {AUTO_HOLD_REPORTERS}명 이상이 신고하면 확인 전까지 임시로 가려져요.</> },
      { q: "이용 제한 기준이 궁금해요.", a: <>운영진이 위반으로 확인한 횟수(최근 1년)에 따라 정해요.<br />{SANCTION_STEPS.map((s, i) => `${i + 1 === SANCTION_STEPS.length ? `${i + 1}회 이상` : `${i + 1}회`} ${s.label}`).join(" → ")}<br />작성 제한 중에도 읽기와 예약·주문은 그대로 이용할 수 있어요. 자세한 기준은 화면 아래 &lsquo;커뮤니티 운영정책&rsquo;에 있어요.</> },
      { q: "제재에 이의가 있어요.", a: <>알림을 받은 날부터 {APPEAL_DAYS}일 안에 화면 아래 &lsquo;문의하기&rsquo;로 알려 주세요. 이의가 받아들여지면 제재를 해제하고 위반 횟수에서도 빼요.</> },
    ],
  },
  {
    id: "owner", title: "사장님",
    items: [
      { q: "입점 비용이 있나요?", a: <>가입비는 없어요. 숙소는 예약이 이용 확정됐을 때만 수수료(기본 {BASIC_FEE_RATE}%)를 받아요.<br />자세한 조건은 <Link href="/partner/lodging" style={{ color: "#A05A32", fontWeight: 700 }}>숙소 입점 안내</Link>와 <Link href="/partner/store" style={{ color: "#A05A32", fontWeight: 700 }}>가게 입점 안내</Link>에서 볼 수 있어요.</> },
      { q: "광고 요금제는 어떻게 해지하나요?", a: <>사장님 센터 → 광고에서 [해지하기]를 누르면 돼요. 위약금은 없어요.<br />결제 {FULL_REFUND_DAYS}일 안에는 전액, 그 뒤에는 남은 날만큼 돌려드려요.</> },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="ggk-body" style={{ minHeight: "100dvh", background: "#FAF9F8", color: "#1F1A16" }}>
      <header style={{ background: "white", borderBottom: "1px solid #EDECEB" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" aria-label="펫츠로드 지도"><BrandLogo height={30} /></Link>
          <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#3B2A20", textDecoration: "none" }}>지도로 가기</Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 120px" }}>
        <h1 className="ggk-logo" style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#3B2A20" }}>고객센터</h1>
        <p style={{ margin: "8px 0 0", fontSize: 14.5, color: "#5E5048", lineHeight: 1.7 }}>
          자주 묻는 질문을 모았어요.<br />찾는 내용이 없으면 화면 아래 &lsquo;문의하기&rsquo;로 알려 주세요.
        </p>

        <nav aria-label="질문 분류" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          {GROUPS.map((g) => (
            <a key={g.id} href={`#${g.id}`} style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid #E7E1DC", background: "white", color: "#3B2A20", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>{g.title}</a>
          ))}
        </nav>

        {GROUPS.map((g) => (
          <section key={g.id} id={g.id} style={{ marginTop: 30, scrollMarginTop: 16 }}>
            <h2 className="ggk-logo" style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 800, color: "#3B2A20" }}>{g.title}</h2>
            <div style={{ background: "white", border: "1px solid #E7E1DC", borderRadius: 16, overflow: "hidden" }}>
              {g.items.map((item, i) => (
                <details key={i} style={{ borderTop: i ? "1px solid #F1EFEE" : "none" }}>
                  <summary style={{ padding: "15px 18px", fontSize: 14.5, fontWeight: 700, color: "#1F1A16", cursor: "pointer", lineHeight: 1.5 }}>{item.q}</summary>
                  <div style={{ padding: "0 18px 16px", fontSize: 14, color: "#4a4038", lineHeight: 1.75 }}>{item.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}

        <p style={{ marginTop: 26, fontSize: 12.5, color: "#5E5048", lineHeight: 1.7 }}>
          안내와 약관의 내용이 다르면 이용약관과 각 예약·주문 화면에 표시된 조건이 우선해요.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
