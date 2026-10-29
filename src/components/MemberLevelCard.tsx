"use client";
// src/components/MemberLevelCard.tsx
//
// 마이페이지의 "내 레벨" 카드 — 지금 단계, 다음 단계까지 남은 것, 이번 달 방문, 점수 내역을 보여 줍니다.
// 계산은 서버(/api/me/level)가 하고, 규칙은 src/lib/memberLevel.ts에 있습니다.
// 레벨 표가 아직 없으면(SQL 실행 전) 아무것도 그리지 않습니다.
// variant="hero"면 마이페이지 위쪽 초록색 프로필 칸 안에 어울리는 색(밝은 글씨·반투명 칸)으로 그립니다.
import { useEffect, useState } from "react";
import LevelBadge from "@/components/LevelBadge";
import LogoLoader from "@/components/LogoLoader";
import { MEMBER_LEVELS, POINT_RULES, type ActivityType, type LevelProgress, type ScoreBreakdown } from "@/lib/memberLevel";

type LevelResponse = { available: boolean; progress?: LevelProgress; score?: ScoreBreakdown };

const ROW_ORDER: ActivityType[] = ["tip_approved", "info_update_approved", "report_accepted", "review", "place_photo", "post", "comment", "admin_deleted"];

export default function MemberLevelCard({ accessToken, onLevel, variant = "card" }: {
  accessToken: string | null | undefined;
  /** 레벨을 받으면 알려 줍니다(위쪽 프로필에 배지를 붙일 때) */
  onLevel?: (level: number) => void;
  /** card = 흰 카드, hero = 초록색 프로필 칸 안 */
  variant?: "card" | "hero";
}) {
  const [data, setData] = useState<LevelResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    fetch("/api/me/level", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((json: LevelResponse) => { if (cancelled) return; setData(json); if (json.progress) onLevel?.(json.progress.current.level); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  if (failed || (data && !data.available)) return null;
  const hero = variant === "hero";
  // 색 묶음 — 흰 카드 / 초록 칸
  const t = hero
    ? { title: "white", strong: "white", text: "rgba(255,255,255,0.86)", muted: "rgba(255,255,255,0.62)", accent: "#E8F0DD", track: "rgba(255,255,255,0.22)", bar: "white", box: "rgba(255,255,255,0.12)", line: "rgba(255,255,255,0.18)", warn: "#FFD7B0", bad: "#FFB4A8" }
    : { title: "#111", strong: "#333", text: "#777", muted: "#aaa", accent: "#5C7A4A", track: "#EEF0EA", bar: "#5C7A4A", box: "#F6F7F3", line: "#f0f1f3", warn: "#A8551F", bad: "#C0392B" };
  const card: React.CSSProperties = hero
    ? { padding: "13px 15px", borderRadius: 16, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.24)", boxSizing: "border-box" }
    : { margin: "12px 16px 0", padding: "14px 16px", borderRadius: 16, background: "white", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" };
  if (!data || !data.progress || !data.score) return hero ? <div style={{ ...card, color: t.text, fontSize: 12 }}>레벨을 확인하는 중…</div> : <div style={card}><LogoLoader size={32} label="레벨을 확인하는 중…" /></div>;

  const { progress, score } = data;
  const { current, earned, next } = progress;
  const percent = Math.round(progress.progress * 100);
  const small: React.CSSProperties = { fontSize: 11.5, color: t.text, lineHeight: 1.6 };

  return (
    <div data-member-level-card style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="ggk-logo" style={{ fontSize: 13, fontWeight: 800, color: t.title }}>내 레벨</div>
        <LevelBadge level={current.level} size="large" onDark={hero} />
        <div style={{ marginLeft: "auto", fontSize: hero ? 14 : 12, fontWeight: 800, color: hero ? "white" : "#48603A" }}>{score.total.toLocaleString()}점</div>
      </div>
      <div style={{ ...small, marginTop: 6 }}>{current.description}</div>

      {/* 다음 단계까지 */}
      {next ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 8, borderRadius: 999, background: t.track, overflow: "hidden" }}>
            <div style={{ width: `${percent}%`, height: "100%", borderRadius: 999, background: t.bar, transition: "width 0.3s" }} />
          </div>
          <div style={{ ...small, marginTop: 5 }}>
            다음 단계 <strong style={{ color: t.strong }}>{next.name}</strong>까지{" "}
            {progress.pointsToNext > 0 ? <><strong style={{ color: t.strong }}>{progress.pointsToNext.toLocaleString()}점</strong> 남았어요</> : "점수는 채웠어요"}
            {progress.mapContributionsToNext > 0 && <> · 지도 기여 <strong style={{ color: t.strong }}>{progress.mapContributionsToNext}회</strong> 더 필요해요</>}
          </div>
        </div>
      ) : (
        <div style={{ ...small, marginTop: 8 }}>가장 높은 단계예요. 🎉</div>
      )}

      {/* 이번 달 방문 */}
      <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 10, background: t.box, ...small, color: hero ? t.text : "#555" }}>
        이번 달 방문 <strong style={{ color: hero ? "white" : "#222" }}>{progress.visitsThisMonth}일</strong>
        {current.monthlyVisits > 0 && <> · {current.name} 유지 조건은 한 달 <strong style={{ color: hero ? "white" : "#222" }}>{current.monthlyVisits}일</strong></>}
        {progress.demoted ? (
          <div style={{ color: t.warn, fontWeight: 600 }}>
            지난달 방문이 모자라 {earned.name}에서 한 단계 내려와 있어요.
            {progress.visitsToRecover > 0 ? ` 이번 달에 ${progress.visitsToRecover}일 더 오면 바로 다시 올라가요.` : ""}
          </div>
        ) : progress.visitsToKeep > 0 ? (
          <div>다음 달에도 지금 단계를 지키려면 이번 달에 <strong style={{ color: hero ? "white" : "#222" }}>{progress.visitsToKeep}일</strong> 더 와야 해요.</div>
        ) : current.monthlyVisits > 0 ? (
          <div>이번 달 방문 조건을 채웠어요.</div>
        ) : null}
      </div>

      {/* 점수 내역 · 단계 안내 */}
      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
        <button onClick={() => setOpen((v) => !v)} style={{ background: "none", border: "none", padding: 0, fontSize: 11.5, fontWeight: 700, color: t.accent, cursor: "pointer", textDecoration: hero ? "underline" : "none" }}>
          {open ? "점수 내역 접기" : "점수 내역 보기"}
        </button>
        <button onClick={() => setShowSteps((v) => !v)} style={{ background: "none", border: "none", padding: 0, fontSize: 11.5, fontWeight: 700, color: t.accent, cursor: "pointer", textDecoration: hero ? "underline" : "none" }}>
          {showSteps ? "단계 안내 접기" : "단계 안내 보기"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 8, borderTop: `1px solid ${t.line}`, paddingTop: 8 }}>
          {ROW_ORDER.map((type) => {
            const row = score.byType[type];
            const rule = POINT_RULES[type];
            if (row.count === 0 && type === "admin_deleted") return null;
            return (
              <div key={type} style={{ display: "flex", justifyContent: "space-between", gap: 8, ...small, color: hero ? t.text : "#555", padding: "2px 0" }}>
                <span>
                  {rule.label} <span style={{ color: t.muted }}>({rule.points > 0 ? "+" : ""}{rule.points}점{rule.dailyLimit ? ` · 하루 ${rule.dailyLimit}회까지` : ""})</span>
                </span>
                <span style={{ flexShrink: 0 }}>
                  {row.count}회{row.counted !== row.count ? ` (인정 ${row.counted}회)` : ""} · <strong style={{ color: row.points < 0 ? t.bad : t.strong }}>{row.points > 0 ? "+" : ""}{row.points}점</strong>
                </span>
              </div>
            );
          })}
          <div style={{ ...small, color: t.muted, marginTop: 6 }}>지도 기여(제보·정보 추가 승인, 받아들여진 신고, 장소 사진 3장당 1회): {score.mapContributions}회</div>
        </div>
      )}
      {showSteps && (
        <div style={{ marginTop: 8, borderTop: `1px solid ${t.line}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {MEMBER_LEVELS.map((step) => (
            <div key={step.level} style={{ display: "flex", alignItems: "center", gap: 8, opacity: step.level === current.level ? 1 : 0.8 }}>
              <LevelBadge level={step.level} onDark={hero} />
              <span style={{ ...small, color: hero ? t.text : "#666" }}>
                {step.minPoints.toLocaleString()}점 이상
                {step.minMapContributions > 0 ? ` · 지도 기여 ${step.minMapContributions}회` : ""}
                {step.monthlyVisits > 0 ? ` · 한 달 ${step.monthlyVisits}일 방문` : ""}
              </span>
            </div>
          ))}
          <div style={{ ...small, color: t.muted }}>방문이 모자라면 한 달에 한 단계씩만 내려가고, 다시 채우면 바로 올라와요.</div>
        </div>
      )}
    </div>
  );
}
