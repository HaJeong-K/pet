"use client";
// src/components/LevelGuide.tsx
//
// 회원 레벨 안내 — 커뮤니티 공지 글 본문에 [[레벨 안내]]라고 적으면 그 자리에 이 안내가 그려집니다.
// 단계·점수·방문 조건은 src/lib/memberLevel.ts를 그대로 읽어 그리므로, 규칙을 바꾸면 공지도 저절로 맞춰집니다.

import Link from "next/link";
import { Ban, Camera, FileText, Flag, MapPin, MessageCircle, PencilLine, Star, type LucideIcon } from "lucide-react";
import { MEMBER_LEVELS, PLACE_PHOTOS_PER_CONTRIBUTION, POINT_RULES, type ActivityType } from "@/lib/memberLevel";
import { SchnauzerHead } from "@/components/brand/SchnauzerPeek";

/** 공지 본문에서 안내를 끼워 넣을 자리 표시 */
export const LEVEL_GUIDE_MARKER = "[[레벨 안내]]";

const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  tip_approved: MapPin, info_update_approved: PencilLine, report_accepted: Flag, review: Star,
  place_photo: Camera, post: FileText, comment: MessageCircle, admin_deleted: Ban,
};
const ACTIVITY_ORDER: ActivityType[] = ["tip_approved", "info_update_approved", "report_accepted", "review", "place_photo", "post", "comment"];

const INK = "#1f1a12", MUTED = "#7a7263", LINE = "#ECE6D8", GREEN = "#2F3B28";

function SectionTitle({ no, title, sub }: { no: string; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#5C7A4A", letterSpacing: "0.4px" }}>{no}</div>
      <div className="ggk-logo" style={{ fontSize: 18, fontWeight: 800, color: INK, marginTop: 3, letterSpacing: "-0.3px" }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: MUTED, marginTop: 5, lineHeight: 1.65 }}>{sub}</div>}
    </div>
  );
}

export default function LevelGuide() {
  return (
    <div className="ggk-body" style={{ whiteSpace: "normal", wordBreak: "keep-all", color: INK, display: "grid", gap: 16, margin: "6px 0" }}>
      {/* 머리말 */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, padding: "24px 22px 22px", background: "linear-gradient(150deg,#1F2A1A 0%,#2F3B28 50%,#4A6339 100%)", color: "white" }}>
        <div style={{ position: "absolute", right: 14, bottom: -38, opacity: 0.95 }}><SchnauzerHead width={74} /></div>
        <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 8, background: "rgba(255,255,255,0.14)", fontSize: 12, fontWeight: 800 }}>회원 레벨 안내</div>
        <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.35, marginTop: 10, letterSpacing: "-0.4px" }}>
          도움이 되는 활동을 할수록<br /><span style={{ color: "#F3DA9B" }}>레벨이 올라가요</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", marginTop: 10, lineHeight: 1.7, maxWidth: 400, paddingRight: 70 }}>
          레벨은 기능을 막는 데 쓰지 않아요.<br />높을수록 더 드리는 데만 써요.
        </div>
      </div>

      {/* 1. 단계 */}
      <div style={{ borderRadius: 18, border: `1px solid ${LINE}`, background: "white", padding: "20px 18px" }}>
        <SectionTitle no="STEP 1" title="6단계로 올라가요" sub="점수를 모으면 다음 단계로 올라가요. 가장 높은 두 단계는 지도에 도움이 된 기여도 함께 있어야 해요." />
        <div style={{ position: "relative", display: "grid", gap: 10 }}>
          <div aria-hidden style={{ position: "absolute", left: 21, top: 22, bottom: 22, width: 2, background: "#E7E2D5" }} />
          {MEMBER_LEVELS.map((lv) => (
            <div key={lv.level} style={{ position: "relative", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div className="ggk-logo" style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: lv.background, color: lv.color, border: "2px solid white", boxShadow: "0 0 0 1px rgba(0,0,0,0.05)", zIndex: 1 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.75, lineHeight: 1 }}>Lv.</span>
                <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>{lv.level}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: "10px 13px", borderRadius: 14, background: "#FCFBF8", border: `1px solid ${LINE}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: lv.color }}>{lv.name}</span>
                  <span style={{ fontSize: 12.5, color: MUTED }}>{lv.description}</span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                  <Chip>{lv.minPoints === 0 ? "가입하면 바로" : `${lv.minPoints.toLocaleString()}점`}</Chip>
                  {lv.minMapContributions > 0 && <Chip strong>지도 기여 {lv.minMapContributions}회</Chip>}
                  {lv.monthlyVisits > 0 && <Chip>유지: 한 달 {lv.monthlyVisits}일 방문</Chip>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 점수 */}
      <div style={{ borderRadius: 18, border: `1px solid ${LINE}`, background: "white", padding: "20px 18px" }}>
        <SectionTitle no="STEP 2" title="이렇게 하면 점수를 받아요" sub="지도를 실제로 넓혀 주는 활동일수록 점수가 커요. 글·댓글처럼 쉽게 늘릴 수 있는 활동은 하루에 받을 수 있는 횟수가 정해져 있어요." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 8 }}>
          {ACTIVITY_ORDER.map((type, i) => {
            const rule = POINT_RULES[type];
            const Icon = ACTIVITY_ICON[type];
            const top = i === 0;
            return (
              <div key={type} style={{ padding: "13px 13px 12px", borderRadius: 14, background: top ? "#F1F6EB" : "#FCFBF8", border: `1px solid ${top ? "#CFDDBF" : LINE}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: top ? GREEN : "#EFEAE0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={15} color={top ? "#F3DA9B" : "#6b604d"} />
                  </span>
                  <span className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, color: top ? GREEN : INK }}>+{rule.points}</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 9 }}>{rule.label}</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{rule.dailyLimit ? `하루 ${rule.dailyLimit}번까지` : top ? "가장 큰 점수" : "횟수 제한 없음"}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12, padding: "11px 13px", borderRadius: 12, background: "#FDF3F1", border: "1px solid #F4D6CF", fontSize: 12.5, color: "#8a3b2c", lineHeight: 1.6 }}>
          <Ban size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>내 글·후기가 운영 정책 위반으로 삭제되면 <b>{POINT_RULES.admin_deleted.points}점</b>이에요. 받은 좋아요 수는 점수에 넣지 않아요.</span>
        </div>
      </div>

      {/* 3. 지도 기여 · 방문 */}
      <div style={{ borderRadius: 18, border: `1px solid ${LINE}`, background: "white", padding: "20px 18px" }}>
        <SectionTitle no="STEP 3" title="지도 기여와 방문" />
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ padding: "13px 14px", borderRadius: 14, background: "#FCFBF8", border: `1px solid ${LINE}` }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>지도 기여란?</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4, lineHeight: 1.7 }}>
              장소 제보나 정보 추가가 승인되거나, 신고가 받아들여지면 1회예요.<br />
              장소 사진은 {PLACE_PHOTOS_PER_CONTRIBUTION}장을 올리면 1회로 쳐요.
            </div>
          </div>
          <div style={{ padding: "13px 14px", borderRadius: 14, background: "#FCFBF8", border: `1px solid ${LINE}` }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>단계를 지키려면 가끔 들러 주세요</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 10 }}>
              {[
                ["매달 초", "지난달 방문 일수를 확인해요. 로그인하고 들어온 날을 하루 한 번 세요."],
                ["모자라면", "한 번에 딱 한 단계만 내려가요. 모아 둔 점수는 그대로예요."],
                ["다시 채우면", "이번 달 방문을 채우는 순간 바로 다시 올라가요."],
              ].map(([head, text], i) => (
                <div key={head} style={{ padding: "11px 12px", borderRadius: 12, background: "white", border: `1px solid ${LINE}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 999, background: GREEN, color: "white", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 800 }}>{head}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>{text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Link href="/mypage" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "14px", borderRadius: 14, background: "linear-gradient(135deg,#2F3B28,#4A6339)", color: "white", fontSize: 15, fontWeight: 800, textDecoration: "none", boxShadow: "0 10px 22px rgba(47,59,40,0.2)" }}>
        내 레벨 확인하러 가기
      </Link>
    </div>
  );
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: strong ? "#2F3B28" : "white", color: strong ? "white" : "#5b5444", border: strong ? "none" : `1px solid ${LINE}` }}>
      {children}
    </span>
  );
}
