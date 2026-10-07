"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Phone, MapPin, ExternalLink, Copy, Check, PawPrint } from "lucide-react";
import type { ShelterNoticeDetail } from "@/lib/shelterNotices";
import { shelterImageSrc } from "@/lib/shelterImage";

export default function ShelterNoticeDetailView({
  notice,
  officialUrl,
}: {
  notice: ShelterNoticeDetail | null;
  officialUrl: string;
}) {
  const router = useRouter();
  const [photo, setPhoto] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  // 사진은 가로 스크롤 + scroll-snap으로 손가락 스와이프를 그대로 받고, 점·화살표는 그 위치로 이동만 시킵니다.
  const goToPhoto = (i: number) => {
    const el = sliderRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  const onSliderScroll = () => {
    const el = sliderRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== photo) setPhoto(i);
  };
  const [copied, setCopied] = useState(false);

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/shelter-notices");
  };

  const header = (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
      background: "white", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 5,
    }}>
      <button onClick={goBack} aria-label="뒤로 가기" style={{
        border: "none", background: "#f5f6f8", borderRadius: "50%", width: 34, height: 34, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <ArrowLeft size={17} color="#555" />
      </button>
      <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: "#D9534F", flex: 1 }}>
        사지말고 입양하세요
      </div>
    </div>
  );

  if (!notice) {
    return (
      <div className="ggk-body" style={pageStyle}>
        <div style={columnStyle}>
          {header}
          <div style={{ ...cardStyle, margin: 16, textAlign: "center", padding: "48px 20px" }}>
            <PawPrint size={32} color="#ccc" />
            <div style={{ fontSize: 14, fontWeight: 700, color: "#444", marginTop: 10 }}>공고 정보를 불러오지 못했어요</div>
            <div style={{ fontSize: 12.5, color: "#888", marginTop: 6, lineHeight: 1.6 }}>
              공고가 종료됐거나 일시적인 오류일 수 있어요.<br />공고 원문에서 확인해 주세요.
            </div>
            <a href={officialUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle("#5C7A4A", "white"), marginTop: 16, display: "inline-flex" }}>
              <ExternalLink size={15} /> 공고 원문 보기
            </a>
          </div>
        </div>
      </div>
    );
  }

  const title = notice.breed || notice.kind || "보호동물";
  const ended = notice.daysLeft < 0 || (notice.processState && notice.processState !== "보호중");
  const telHref = notice.careTel ? `tel:${notice.careTel.replace(/[^\d+]/g, "")}` : "";
  const mapHref = notice.careAddr ? `https://map.kakao.com/link/search/${encodeURIComponent(notice.careAddr)}` : "";
  const inquiryText =
    `안녕하세요. 국가동물보호정보시스템 공고번호 ${notice.noticeNumber}(${title}, ${notice.sex}) 보고 연락드립니다. ` +
    `입양(또는 임시보호)을 하고 싶은데, 절차와 방문 가능한 시간을 알 수 있을까요?`;

  const copyInquiry = async () => {
    try {
      await navigator.clipboard.writeText(inquiryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("아래 문구를 복사해 주세요", inquiryText);
    }
  };

  const infoRows: [string, string][] = [
    ["성별", notice.sex],
    ["나이", notice.age],
    ["체중", notice.weight],
    ["털색", notice.color],
    ["중성화", notice.neuter],
    ["발견 장소", notice.happenPlace],
    ["공고 기간", notice.intakeDate && notice.deadline ? `${notice.intakeDate} ~ ${notice.deadline}` : notice.deadline],
    ["공고 번호", notice.noticeNumber],
  ].filter(([, v]) => !!v) as [string, string][];

  return (
    <div className="ggk-body" style={pageStyle}>
      <div style={columnStyle}>
        {header}

        {/* ── 사진 (좌우로 넘기기) ── */}
        <div style={{ position: "relative", background: "#e9e4d6", aspectRatio: "4 / 3", maxHeight: 460, width: "100%", flexShrink: 0 }}>
          {notice.images.length > 0 ? (
            <div
              ref={sliderRef}
              onScroll={onSliderScroll}
              className="ggk-photo-slider"
              style={{
                display: "flex", width: "100%", height: "100%",
                overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory",
                scrollbarWidth: "none", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain",
              }}
            >
              {notice.images.map((src, i) => (
                // 정부 서버의 원본(수백 KB, 느림) 대신 우리 서버가 줄인 사진을 받습니다(src/lib/shelterImage.ts).
                // 줄인 사진을 못 받으면 원본 주소로 한 번 더 시도합니다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={shelterImageSrc(src, 960)}
                  onError={(e) => { const img = e.currentTarget; if (!img.dataset.fallback) { img.dataset.fallback = "1"; img.src = src; } }}
                  alt={`${title} 사진 ${i + 1}`}
                  draggable={false}
                  loading={i === 0 ? "eager" : "lazy"}
                  style={{ flex: "0 0 100%", width: "100%", height: "100%", objectFit: "contain", scrollSnapAlign: "center" }}
                />
              ))}
            </div>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PawPrint size={40} color="#5C7A4A" />
            </div>
          )}
          {notice.images.length > 1 && (
            <>
              {photo > 0 && (
                <button onClick={() => goToPhoto(photo - 1)} aria-label="이전 사진" style={arrowStyle("left")}>
                  <ChevronLeft size={20} color="#333" />
                </button>
              )}
              {photo < notice.images.length - 1 && (
                <button onClick={() => goToPhoto(photo + 1)} aria-label="다음 사진" style={arrowStyle("right")}>
                  <ChevronRight size={20} color="#333" />
                </button>
              )}
              <div style={{ position: "absolute", top: 10, right: 12, background: "rgba(0,0,0,0.5)", color: "white", fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999 }}>
                {photo + 1} / {notice.images.length}
              </div>
              <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
                {notice.images.map((_, i) => (
                  <button key={i} onClick={() => goToPhoto(i)} aria-label={`사진 ${i + 1}`} style={{
                    width: i === photo ? 22 : 9, height: 9, borderRadius: 999, border: "none", cursor: "pointer", padding: 0,
                    background: i === photo ? "white" : "rgba(255,255,255,0.55)", transition: "width 0.15s",
                  }} />
                ))}
              </div>
            </>
          )}
          <style>{`.ggk-photo-slider::-webkit-scrollbar { display: none; }`}</style>
        </div>

        <div style={{ padding: "16px 16px var(--ggk-tabbar-space)", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* ── 이름·상태 ── */}
          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {notice.kind && <span style={chip("#EEF3E8", "#48603A")}>{notice.kind}</span>}
              <span style={chip("#EEF3E8", "#48603A")}>{notice.region} {notice.subRegion}</span>
              {ended ? (
                <span style={chip("#f1f2f4", "#666")}>{notice.processState || "공고 종료"}</span>
              ) : (
                <span style={chip(notice.daysLeft <= 2 ? "#D9534F" : "#333", "white")}>
                  {notice.daysLeft <= 0 ? "오늘 공고 마감" : `공고 마감 D-${notice.daysLeft}`}
                </span>
              )}
            </div>
            <div className="ggk-logo" style={{ fontSize: 20, fontWeight: 800, color: "#222" }}>{title}</div>
            {notice.specialMark && (
              <div style={{ fontSize: 13.5, color: "#555", marginTop: 8, lineHeight: 1.6 }}>{notice.specialMark}</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", rowGap: 7, columnGap: 10, marginTop: 14, fontSize: 13.5 }}>
              {infoRows.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <div style={{ color: "#999" }}>{k}</div>
                  <div style={{ color: "#333", wordBreak: "keep-all" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 보호소 연락 ── */}
          <div style={cardStyle}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5C7A4A", marginBottom: 4 }}>보호하고 있는 곳</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>{notice.careName || notice.orgName}</div>
            {notice.careAddr && <div style={{ fontSize: 13, color: "#777", marginTop: 4, lineHeight: 1.5 }}>{notice.careAddr}</div>}
            {notice.careTel && <div style={{ fontSize: 13, color: "#777", marginTop: 2 }}>{notice.careTel}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
              {telHref && (
                <a href={telHref} style={{ ...btnStyle("#5C7A4A", "white"), gridColumn: "1 / -1" }}>
                  <Phone size={16} /> 전화로 입양·임보 문의하기
                </a>
              )}
              {mapHref && (
                <a href={mapHref} target="_blank" rel="noopener noreferrer" style={btnStyle("#FEE500", "#191919")}>
                  <MapPin size={15} /> 보호소 위치
                </a>
              )}
              <a href={officialUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle("white", "#444"), border: "1px solid #ddd", ...(mapHref ? {} : { gridColumn: "1 / -1" }) }}>
                <ExternalLink size={15} /> 공고 원문
              </a>
            </div>
          </div>

          {/* ── 문의 방법 ── */}
          <div style={cardStyle}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#222", marginBottom: 10 }}>입양·임시보호, 이렇게 문의해요</div>
            <ol style={{ margin: 0, paddingLeft: 18, listStyle: "decimal", fontSize: 13.5, color: "#555", lineHeight: 1.75 }}>
              <li>보호소에 전화해서 <b>공고번호</b>를 알려주세요. 아래 문구를 복사해 문자로 보내도 돼요.</li>
              <li>공고 기간에는 원래 보호자가 찾아갈 수 있어서, <b>입양은 보통 공고가 끝난 뒤</b>에 진행돼요. 공고 중에도 미리 입양 의사를 밝혀 두면 순서를 안내받을 수 있어요.</li>
              <li><b>임시보호</b>는 보호소마다 운영 방식이 달라요. 가능한지, 필요한 조건은 무엇인지 함께 물어보세요.</li>
              <li>방문할 때는 신분증을 챙기고, 가족 모두 동의했는지 한 번 더 확인해 주세요.</li>
            </ol>
            <div style={{ marginTop: 12, padding: "11px 12px", background: "#f8f7f2", borderRadius: 10, fontSize: 12.5, color: "#666", lineHeight: 1.6 }}>
              {inquiryText}
            </div>
            <button onClick={copyInquiry} style={{ ...btnStyle(copied ? "#EEF3E8" : "white", "#48603A"), border: "1px solid #cfdcc3", width: "100%", marginTop: 8 }}>
              {copied ? <><Check size={15} /> 복사했어요</> : <><Copy size={15} /> 문의 문구 복사하기</>}
            </button>
          </div>

          <div style={{ fontSize: 11.5, color: "#999", textAlign: "center", lineHeight: 1.6 }}>
            공고 정보는 국가동물보호정보시스템(농림축산식품부) 공공데이터를 바탕으로 해요.<br />
            실제 보호 상태는 보호소에 꼭 확인해 주세요.
          </div>
        </div>
      </div>
    </div>
  );
}

// 사이트 전체의 body가 overflow:hidden(지도 화면용)이라, 페이지 자체를 스크롤 영역으로 둡니다.
const pageStyle: React.CSSProperties = {
  height: "100dvh", overflowY: "auto", background: "#F7F3E8", display: "flex", justifyContent: "center", alignItems: "flex-start",
};
const arrowStyle = (side: "left" | "right"): React.CSSProperties => ({
  position: "absolute", top: "50%", [side]: 10, transform: "translateY(-50%)",
  width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
  background: "rgba(255,255,255,0.85)", boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  display: "flex", alignItems: "center", justifyContent: "center",
});
const columnStyle: React.CSSProperties = { width: "100%", maxWidth: 640, display: "flex", flexDirection: "column" };
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 16, border: "1px solid rgba(0,0,0,0.06)",
};
const chip = (bg: string, color: string): React.CSSProperties => ({
  background: bg, color, fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999,
});
const btnStyle = (bg: string, color: string): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  minHeight: 44, padding: "0 14px", borderRadius: 11, border: "none", background: bg, color,
  fontSize: 14, fontWeight: 700, textDecoration: "none", cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif",
});
