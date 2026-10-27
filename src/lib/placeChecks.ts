// src/lib/placeChecks.ts
//
// 장소 정보가 "언제, 누구에게 마지막으로 확인됐는지"를 정하는 규칙(화면·서버·테스트가 같이 씁니다).
// 심사 의견("공공데이터는 갱신이 느리니 정확성·최신성을 확보할 방안이 필요")에 대한 답입니다:
//   · 다녀온 이용자의 확인(정보가 맞아요 / 달라졌어요)
//   · 사장님의 확인(정보 수정 또는 "지금 정보가 맞아요")
//   · 공공데이터 갱신일
// 이 셋 중 가장 최근 것을 "마지막 확인"으로 보여 주고, 최근에 "달라졌어요"가 몰리면 경고합니다.

export type CheckVerdict = "ok" | "changed";
export type ChangeDetail = "no_pets" | "closed" | "info";

export const CHANGE_DETAILS: { id: ChangeDetail; label: string; hint: string }[] = [
  { id: "no_pets", label: "반려동물 동반이 안 돼요", hint: "가 보니 동반이 안 되거나 조건이 바뀌었어요" },
  { id: "closed", label: "문을 닫았어요", hint: "폐업했거나 오랫동안 쉬고 있어요" },
  { id: "info", label: "영업시간 등 정보가 달라요", hint: "영업시간·전화번호·휴무일 등이 달라요" },
];
export const changeDetailLabel = (id: string | null | undefined) => CHANGE_DETAILS.find((d) => d.id === id)?.label ?? "정보가 달라졌어요";

/** 같은 사람이 같은 장소를 다시 확인할 수 있는 간격(그 안에 다시 누르면 앞의 확인을 바꿉니다) */
export const CHECK_COOLDOWN_DAYS = 7;
/** 확인 횟수를 세는 기간 */
export const CHECK_WINDOW_DAYS = 90;
/** "달라졌어요"가 이만큼 모이고 "맞아요"보다 많으면 경고를 띄웁니다 */
export const CHANGED_WARN_MIN = 2;

const DAY = 86_400_000;

export type CheckRow = { verdict: CheckVerdict; detail: ChangeDetail | null; created_at: string };
export type CheckSummary = {
  okCount: number;
  changedCount: number;
  lastOkAt: string | null;
  /** 최근 기간의 "달라졌어요"를 내용별로 센 것(많은 순) */
  changed: { detail: ChangeDetail | null; count: number; lastAt: string }[];
  /** 방문 전에 확인하라는 경고를 띄울지 */
  warn: boolean;
};

/** 최근 CHECK_WINDOW_DAYS일 안의 확인을 정리합니다 */
export function summarizeChecks(rows: CheckRow[], now = Date.now()): CheckSummary {
  const recent = rows.filter((r) => now - new Date(r.created_at).getTime() <= CHECK_WINDOW_DAYS * DAY);
  const ok = recent.filter((r) => r.verdict === "ok");
  const changed = recent.filter((r) => r.verdict === "changed");
  const byDetail = new Map<string, { detail: ChangeDetail | null; count: number; lastAt: string }>();
  for (const r of changed) {
    const key = r.detail ?? "";
    const prev = byDetail.get(key);
    if (!prev) byDetail.set(key, { detail: r.detail, count: 1, lastAt: r.created_at });
    else { prev.count += 1; if (r.created_at > prev.lastAt) prev.lastAt = r.created_at; }
  }
  const lastOkAt = ok.reduce<string | null>((latest, r) => (!latest || r.created_at > latest ? r.created_at : latest), null);
  // 맞아요가 더 최근이면, 그 뒤로 다시 확인된 것으로 보고 경고하지 않습니다.
  const lastChangedAt = changed.reduce<string | null>((latest, r) => (!latest || r.created_at > latest ? r.created_at : latest), null);
  const warn = changed.length >= CHANGED_WARN_MIN && changed.length > ok.length && !(lastOkAt && lastChangedAt && lastOkAt > lastChangedAt);
  return {
    okCount: ok.length,
    changedCount: changed.length,
    lastOkAt,
    changed: [...byDetail.values()].sort((a, b) => b.count - a.count),
    warn,
  };
}

export type FreshnessSource = "visitor" | "owner" | "data";
export type Freshness = {
  /** 가장 최근 확인 */
  at: string | null;
  by: FreshnessSource | null;
  /** fresh: 30일 안 · normal: 180일 안 · stale: 그보다 오래됐거나 확인 기록 없음 */
  tone: "fresh" | "normal" | "stale";
};

/** 방문자·사장님·공공데이터 확인 중 가장 최근 것과 그 신선도 */
export function freshnessOf(input: { lastOkAt?: string | null; ownerVerifiedAt?: string | null; dataSyncedAt?: string | null }, now = Date.now()): Freshness {
  const candidates: { at: string; by: FreshnessSource }[] = [];
  if (input.lastOkAt) candidates.push({ at: input.lastOkAt, by: "visitor" });
  if (input.ownerVerifiedAt) candidates.push({ at: input.ownerVerifiedAt, by: "owner" });
  if (input.dataSyncedAt) candidates.push({ at: input.dataSyncedAt, by: "data" });
  if (candidates.length === 0) return { at: null, by: null, tone: "stale" };
  // 같은 날이면 사람이 직접 확인한 것(방문자 > 사장님 > 공공데이터)을 앞에 둡니다.
  const rank: Record<FreshnessSource, number> = { visitor: 0, owner: 1, data: 2 };
  candidates.sort((a, b) => b.at.slice(0, 10).localeCompare(a.at.slice(0, 10)) || rank[a.by] - rank[b.by]);
  const latest = candidates[0];
  const age = now - new Date(latest.at).getTime();
  return { at: latest.at, by: latest.by, tone: age <= 30 * DAY ? "fresh" : age <= 180 * DAY ? "normal" : "stale" };
}

/** "오늘", "3일 전", "2주 전", "5개월 전", "2026.3.4" */
export function relativeDay(at: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(at).getTime()) / DAY);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 14) return `${days}일 전`;
  if (days < 60) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  const d = new Date(at);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/** 장소 번호로 데이터 출처를 알아냅니다(공공데이터 장소는 번호 범위가 정해져 있음 — src/lib/publicDataAggregate.ts) */
export function dataSourceOf(placeId: number): string | null {
  if (placeId >= 9_000_000_000) return "전국도시공원정보표준데이터";
  if (placeId >= 4_000_000_000) return "공공데이터";
  if (placeId >= 3_000_000_000) return "한국문화정보원";
  if (placeId >= 2_000_000_000) return "식품의약품안전처";
  if (placeId >= 1_000_000_000) return "한국관광공사";
  return null;
}
