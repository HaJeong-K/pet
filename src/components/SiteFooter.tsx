"use client";

// 사이트 전체 공용 Footer — 이용약관/개인정보처리방침/운영정책/문의하기/사업자정보를
// 모든 페이지(커뮤니티, 마이페이지 등)에서 100% 동일하게 보여주기 위해 한 곳으로
// 모았습니다. 예전엔 페이지마다 이 내용을 각자 복사해 넣어서 문구가 서로 달라지는
// 문제(예: 마이페이지엔 운영정책 링크가 없었음, 문의 이메일이 서로 다른 값이었음)가
// 있었는데, 이 컴포넌트 하나만 각 페이지에서 불러다 쓰면 항상 똑같습니다.

import { useState } from "react";
import { X, Mail, Check, Copy } from "lucide-react";

const ADMIN_EMAIL = "infoker12@naver.com";

function FooterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 5, fontFamily: "'Pretendard', sans-serif" }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: "#555", lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, backdropFilter: "blur(4px)" }} />
      <div className="ggk-body" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(480px, 94vw)", maxHeight: "82vh", overflowY: "auto",
        background: "white", borderRadius: "20px", zIndex: 301,
        boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
      }}>
        <div style={{ position: "sticky", top: 0, background: "white", padding: "16px 18px 12px", borderBottom: "1px solid #f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "#f0f2f5", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} color="#666" />
          </button>
        </div>
        <div style={{ padding: "16px 18px 24px", fontSize: 12, color: "#444", lineHeight: 1.8 }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ── 문의하기 모달 — mailto 링크가 기본 메일 앱이 없는 환경에서는 아무 반응이
// 없어 보일 수 있어서(브라우저가 조용히 무시), 클립보드 복사 버튼을 1차 수단으로
// 두고 mailto는 보조 수단으로만 제공합니다. 복사 버튼은 메일 앱 설정과 무관하게
// 항상 동작합니다.
function ContactModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ADMIN_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <ModalShell title="문의하기" onClose={onClose}>
      <p style={{ fontSize: 12, color: "#555", marginBottom: 18, lineHeight: 1.7 }}>
        아래 이메일 주소로 문의해 주세요. 버튼을 누르면 주소가 복사되니, 평소 쓰시는
        메일 앱(Gmail, 네이버메일 등)을 열어 붙여넣기 해주시면 됩니다.
      </p>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        background: "#f8f9fb", border: "1px solid #e8eaed", borderRadius: 14,
        padding: "14px 16px", marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Mail size={16} color="#5C7A4A" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ADMIN_EMAIL}
          </span>
        </div>
        <button
          onClick={handleCopy}
          style={{
            flexShrink: 0, border: "none", borderRadius: 999, padding: "7px 12px",
            background: copied ? "#5C7A4A" : "#E4EBDC", color: copied ? "white" : "#48603A",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "복사됨" : "복사하기"}
        </button>
      </div>

      <a
        href={`mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent("[같이가개] 문의하기")}&body=${encodeURIComponent("안녕하세요, 문의 내용을 입력해주세요.")}`}
        style={{ fontSize: 11.5, color: "#5C7A4A", textDecoration: "underline", textUnderlineOffset: "2px" }}
      >
        메일 앱이 설치되어 있다면 여기를 눌러 바로 열기 →
      </a>
    </ModalShell>
  );
}

export default function SiteFooter() {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showContact, setShowContact] = useState(false);

  return (
    <>
      <div style={{ textAlign: "center" }}>
        <div className="ggk-logo" style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 10 }}>
          같이가개
        </div>

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={() => setShowTerms(true)} style={{ border: "none", background: "transparent", fontSize: 11, color: "#6b7280", cursor: "pointer" }}>
            이용약관
          </button>
          <span style={{ fontSize: 10, color: "#c5c9cf" }}>|</span>
          <button onClick={() => setShowPrivacy(true)} style={{ border: "none", background: "transparent", fontSize: 11, color: "#6b7280", cursor: "pointer", fontWeight: 700 }}>
            개인정보 처리방침
          </button>
          <span style={{ fontSize: 10, color: "#c5c9cf" }}>|</span>
          <button onClick={() => setShowPolicy(true)} style={{ border: "none", background: "transparent", fontSize: 11, color: "#6b7280", cursor: "pointer" }}>
            커뮤니티 운영정책
          </button>
          <span style={{ fontSize: 10, color: "#c5c9cf" }}>|</span>
          <button onClick={() => setShowContact(true)} style={{ border: "none", background: "transparent", fontSize: 11, color: "#6b7280", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Mail size={11} color="#6b7280" />
            문의하기
          </button>
        </div>

        <div style={{ fontSize: 10, color: "#9aa1aa", lineHeight: 1.9, marginBottom: 10, paddingTop: 10, borderTop: "1px solid #e2e5ea", maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
          상호명: 같이가개&nbsp;|&nbsp;대표자: 김하정&nbsp;|&nbsp;사업자등록번호: [등록 예정]
          <br />
          사업장 주소: [주소 등록 예정]&nbsp;|&nbsp;고객센터: {ADMIN_EMAIL}
          <br />
          통신판매업신고번호: [해당 시 등록 예정]
        </div>

        <div style={{ fontSize: 10, color: "#9aa1aa", lineHeight: 1.7 }}>
          © 2026 같이가개. All rights reserved.
        </div>
      </div>

      {showContact && <ContactModal onClose={() => setShowContact(false)} />}

      {showPrivacy && (
        <ModalShell title="개인정보 처리방침" onClose={() => setShowPrivacy(false)}>
          <p style={{ fontSize: 11, color: "#999", marginBottom: 16 }}>최종 수정일: 2025년 1월 1일</p>

          <FooterSection title="1. 개인정보의 수집 및 이용 목적">
            같이가개(이하 "서비스")는 다음의 목적으로 개인정보를 수집·이용합니다.<br />
            • 회원 가입 및 관리: 회원 식별, 서비스 이용 관리<br />
            • 서비스 제공: 장소 정보 제공, 댓글·찜 기능 운영<br />
            • 고객 지원: 문의 응대 및 민원 처리
          </FooterSection>

          <FooterSection title="2. 수집하는 개인정보 항목">
            • <strong>필수 항목:</strong> 이메일 주소, 닉네임, 비밀번호(암호화 저장)<br />
            • <strong>소셜 로그인 시:</strong> 소셜 계정 고유 식별자, 프로필 사진(선택)<br />
            • <strong>서비스 이용 시 자동 수집:</strong> 서비스 이용 기록, 접속 로그
          </FooterSection>

          <FooterSection title="3. 개인정보의 보유 및 이용 기간">
            • 회원 탈퇴 시 즉시 삭제(단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관)<br />
            • 전자상거래 기록: 5년 보관 (전자상거래 등에서의 소비자보호에 관한 법률)<br />
            • 서비스 이용 관련 분쟁 시 분쟁 해결 시까지 보관
          </FooterSection>

          <FooterSection title="4. 개인정보의 제3자 제공">
            서비스는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.<br />
            • 이용자가 사전에 동의한 경우<br />
            • 법령의 규정에 의거하거나 수사 목적으로 관련 기관의 요구가 있는 경우
          </FooterSection>

          <FooterSection title="5. 개인정보 처리 위탁">
            서비스는 원활한 운영을 위해 아래와 같이 개인정보 처리를 위탁합니다.<br />
            • <strong>Supabase Inc.:</strong> 데이터베이스 및 인증 서비스<br />
            • <strong>Vercel Inc.:</strong> 서버 호스팅 및 배포
          </FooterSection>

          <FooterSection title="6. 이용자의 권리 및 행사 방법">
            이용자는 다음의 권리를 가집니다.<br />
            • 개인정보 열람, 정정·삭제, 처리 정지 요청권<br />
            • 위 권리 행사는 서비스 내 설정 메뉴 또는 이메일 문의를 통해 가능합니다.<br />
            • 문의 이메일: <strong>{ADMIN_EMAIL}</strong>
          </FooterSection>

          <FooterSection title="7. 쿠키(Cookie) 운용">
            서비스는 로그인 상태 유지 등을 위해 쿠키를 사용합니다. 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 일부 서비스 이용이 제한될 수 있습니다.
          </FooterSection>

          <FooterSection title="8. 개인정보 보호 책임자">
            • <strong>책임자:</strong> 같이가개 관리자<br />
            • <strong>이메일:</strong> {ADMIN_EMAIL}<br />
            개인정보 처리에 관한 문의, 불만 처리, 피해 구제 등에 관한 사항은 위 연락처로 문의해 주시기 바랍니다.
          </FooterSection>

          <FooterSection title="9. 개인정보 처리방침 변경">
            본 방침은 법령, 정책 또는 서비스 변경 사항을 반영하기 위해 수정될 수 있습니다. 변경 시 서비스 내 공지사항을 통해 사전 안내합니다.
          </FooterSection>

          <div style={{ marginTop: 16, padding: "12px 14px", background: "#f8f9fb", borderRadius: 10, border: "1px solid #e8eaed" }}>
            <div style={{ fontSize: 11, color: "#888", lineHeight: 1.7 }}>
              본 개인정보 처리방침은 <strong>2025년 1월 1일</strong>부터 적용됩니다.<br />
              문의사항이 있으시면 <strong>{ADMIN_EMAIL}</strong>로 연락해 주세요.
            </div>
          </div>
        </ModalShell>
      )}

      {showTerms && (
        <ModalShell title="이용약관" onClose={() => setShowTerms(false)}>
          <p style={{ fontSize: 11, color: "#999", marginBottom: 16 }}>시행일: 2026년 8월 3일</p>

          <FooterSection title="제1조 (목적)">
            본 약관은 같이가개(이하 "회사")가 제공하는 반려동물 동반 장소 정보 및 커뮤니티 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
          </FooterSection>

          <FooterSection title="제2조 (정의)">
            • "서비스"란 회사가 제공하는 반려동물 동반 가능 장소 검색·정보 제공, 리뷰·찜하기, 커뮤니티 게시판 등 일체의 서비스를 말합니다.<br />
            • "이용자"란 본 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.<br />
            • "회원"이란 서비스에 개인정보를 제공하여 회원등록을 한 자로서 서비스를 지속적으로 이용할 수 있는 자를 말합니다.
          </FooterSection>

          <FooterSection title="제3조 (약관의 효력 및 변경)">
            본 약관은 서비스 화면에 게시하거나 기타의 방법으로 공지함으로써 효력이 발생합니다. 회사는 관계 법령을 위배하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일자와 변경사유를 명시하여 사전 공지합니다.
          </FooterSection>

          <FooterSection title="제4조 (서비스의 제공 및 변경)">
            회사는 반려동물 동반 가능 장소(동물병원·동물약국·카페·식당·숙소·공원 등) 정보 제공, 리뷰·찜하기, 커뮤니티 게시판 등을 제공합니다. 운영상·기술상의 필요에 따라 서비스의 전부 또는 일부를 변경·중단할 수 있으며, 이 경우 사전에 공지합니다.
          </FooterSection>

          <FooterSection title="제5조 (정보의 정확성)">
            서비스가 제공하는 장소 정보(영업시간, 진료과목, 반려동물 동반 가능 여부 등)는 공공데이터 및 이용자 제보를 기반으로 하며 실시간으로 정확하지 않을 수 있습니다. 이용자는 방문 전 해당 업체·기관에 정보를 재확인해야 하며, 회사는 정보의 부정확성으로 발생한 손해에 책임을 지지 않습니다.
          </FooterSection>

          <FooterSection title="제6조 (회원가입)">
            이용자는 회사가 정한 절차에 따라 회원가입을 신청하고 회사가 이를 승낙함으로써 가입이 완료됩니다. 타인의 정보 도용, 허위 정보 기재, 관계 법령 또는 본 약관 위반 시 회사는 가입을 거부하거나 이용계약을 해지할 수 있습니다.
          </FooterSection>

          <FooterSection title="제7조 (게시물의 관리 및 저작권)">
            이용자가 게시한 게시물의 저작권은 해당 이용자에게 귀속됩니다. 이용자는 게시물을 서비스 내 노출·전시 목적으로 회사가 사용하는 것에 동의합니다(상업적 목적의 제3자 제공 제외). 타인의 권리를 침해하거나 허위 사실을 유포하는 게시물, 커뮤니티 질서를 저해하는 게시물, 무단 광고성 게시물, 관계 법령 위반 게시물은 사전 통지 없이 삭제·이동될 수 있습니다.
          </FooterSection>

          <FooterSection title="제8조 (이용자의 의무)">
            이용자는 타인의 정보 도용, 서비스 운영 방해, 명예훼손, 무단 광고·스팸 게시, 관계 법령 위반 행위를 해서는 안 됩니다.
          </FooterSection>

          <FooterSection title="제9조 (면책조항)">
            회사는 천재지변 등 불가항력으로 서비스를 제공할 수 없는 경우 책임이 면제됩니다. 이용자 간 또는 이용자와 제3자 간 분쟁에 개입할 의무가 없으며, 이용자가 게재한 정보의 신뢰도·정확성을 보증하지 않습니다.
          </FooterSection>

          <FooterSection title="제10조 (분쟁해결 및 재판관할)">
            본 약관과 관련한 분쟁은 양 당사자가 원만히 해결하도록 노력하며, 협의가 이루어지지 않을 경우 관계 법령 및 민사소송법상의 관할법원에 따릅니다.
          </FooterSection>

          <div style={{ marginTop: 16, padding: "12px 14px", background: "#f8f9fb", borderRadius: 10, border: "1px solid #e8eaed" }}>
            <div style={{ fontSize: 11, color: "#888", lineHeight: 1.7 }}>
              본 이용약관은 <strong>2026년 8월 3일</strong>부터 적용됩니다.<br />
              문의사항이 있으시면 <strong>{ADMIN_EMAIL}</strong>로 연락해 주세요.
            </div>
          </div>
        </ModalShell>
      )}

      {showPolicy && (
        <ModalShell title="커뮤니티 운영정책" onClose={() => setShowPolicy(false)}>
          <p style={{ fontSize: 11, color: "#999", marginBottom: 16 }}>시행일: 2026년 8월 3일</p>

          <FooterSection title="1. 목적">
            같이가개 커뮤니티는 반려인과 반려동물 관련 사업자가 함께 정보를 나누고 소통하는 공간입니다. 모두가 안전하고 즐겁게 이용할 수 있도록 아래 운영정책을 준수해 주세요.
          </FooterSection>

          <FooterSection title="2. 금지되는 게시물">
            • 특정인에 대한 비방, 욕설, 혐오 표현<br />
            • 허위·과장 정보 유포<br />
            • 개인정보(전화번호, 주소 등) 무단 게시<br />
            • 도배, 스팸성 반복 게시물<br />
            • 사전 승인되지 않은 상업적 광고(사장님 게시판 외 지역)<br />
            • 동물 학대를 조장하거나 미화하는 내용<br />
            • 관계 법령을 위반하는 내용
          </FooterSection>

          <FooterSection title="3. 사장님(사업자) 게시판 이용 안내">
            • 반려동물 관련 사업자는 사장님 게시판에서 업체 소개, 이벤트, 소식을 게시할 수 있습니다.<br />
            • 사장님 게시판 외 일반 게시판에 상업적 홍보 글을 게시할 경우 사전 통지 없이 삭제될 수 있습니다.
          </FooterSection>

          <FooterSection title="4. 신고 및 제재">
            • 이용자는 부적절한 게시물·댓글을 신고할 수 있습니다.<br />
            • 신고가 접수된 게시물은 운영진 검토 후 삭제 또는 비공개 처리될 수 있습니다.<br />
            • 반복적으로 정책을 위반하는 회원은 이용 제한(경고 → 일시 정지 → 영구 정지) 조치를 받을 수 있습니다.
          </FooterSection>

          <FooterSection title="5. 문의">
            운영정책에 대한 문의나 이의제기는 이메일({ADMIN_EMAIL})로 접수해 주세요.
          </FooterSection>

          <div style={{ marginTop: 16, padding: "12px 14px", background: "#f8f9fb", borderRadius: 10, border: "1px solid #e8eaed" }}>
            <div style={{ fontSize: 11, color: "#888", lineHeight: 1.7 }}>
              본 운영정책은 <strong>2026년 8월 3일</strong>부터 시행됩니다.
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}
