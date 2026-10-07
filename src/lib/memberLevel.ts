// src/lib/memberLevel.ts
//
// 회원 레벨 — 점수 규칙과 단계(브라우저·서버 공용, 계산만 하는 순수 함수).
//
// 원칙
//  1) "많이 한 사람"이 아니라 "도움이 된 기여"에 점수를 줍니다. 지도 데이터를 실제로 늘리는 일(제보 승인)이 가장 큽니다.
//  2) 글·댓글처럼 쉽게 늘릴 수 있는 활동은 점수가 낮고 하루 상한이 있습니다(도배로 레벨을 올리지 못하게).
//  3) 관리자가 삭제한 글·후기는 점수를 깎습니다.
//  4) 가장 높은 두 단계는 점수만으로는 오를 수 없고, 지도에 도움이 된 기여(제보·정보 추가 승인, 받아들여진 신고)가
//     일정 횟수 이상 있어야 합니다.
//  5) 단계는 "쌓은 것"과 "요즘 방문"을 함께 봅니다.
//     · 달성 단계(earned): 점수와 지도 기여로 정해지고, 한 번 얻으면 사라지지 않습니다.
//     · 현재 단계(current): 화면에 표시되는 단계. 높은 단계일수록 한 달에 더 자주 와야 유지됩니다.
//       매달 초에 지난달 방문 일수를 보고, 현재 단계의 조건에 못 미쳤으면 딱 한 단계만 내려갑니다
//       (6단계였다가 한 달을 쉬면 5단계, 두 달을 쉬면 4단계 — 한 번에 여러 단계가 떨어지지 않습니다).
//     · 다시 올라올 때는 기다릴 필요가 없습니다. 이번 달 방문 일수가 윗단계 조건을 채우는 순간 바로 올라갑니다
//       (달성 단계까지만).
//     · "방문"은 로그인한 상태로 사이트(앱)에 들어온 날을 하루에 한 번 셉니다(한국 시간, 달력의 한 달 기준).
//  6) 레벨은 기능을 잠그는 데 쓰지 않습니다 — 높을수록 "더 주는" 용도로만 씁니다.
// 점수와 문턱값은 이 파일만 고치면 바뀝니다(화면·서버는 여기 함수만 부릅니다).

/** 활동 종류 */
export type ActivityType =
  | "tip_approved"        // 장소 제보가 승인돼 지도에 등록됨
  | "info_update_approved"// 기존 장소의 빠진 정보를 채우는 제안이 승인됨
  | "report_accepted"     // 신고가 받아들여짐(관리자가 해당 글·장소를 조치함)
  | "review"              // 장소 후기 작성
  | "review_photo"        // 사진이 들어간 후기(후기 점수에 더해지는 가산)
  | "post"                // 커뮤니티 글
  | "comment"             // 댓글·답글(후기 답글 포함)
  | "like_received"       // 내 후기·글·댓글이 좋아요를 받음
  | "admin_deleted";      // 내 글·후기가 관리자에게 삭제됨(감점)

export type PointRule = {
  /** 한 번에 받는 점수(감점은 음수) */
  points: number;
  /** 하루에 점수로 인정하는 최대 횟수(한국 시간 기준). 없으면 제한 없음 */
  dailyLimit?: number;
  /** 화면에 보여 줄 이름 */
  label: string;
};

export const POINT_RULES: Record<ActivityType, PointRule> = {
  tip_approved:         { points: 50, label: "장소 제보 승인" },
  info_update_approved: { points: 20, label: "정보 추가 제안 승인" },
  report_accepted:      { points: 15, label: "신고가 받아들여짐" },
  review:               { points: 10, dailyLimit: 3, label: "후기 작성" },
  review_photo:         { points: 5,  dailyLimit: 3, label: "사진 후기 가산" },
  post:                 { points: 3,  dailyLimit: 2, label: "커뮤니티 글" },
  comment:              { points: 1,  dailyLimit: 3, label: "댓글·답글" },
  like_received:        { points: 2,  dailyLimit: 20, label: "받은 좋아요" },
  admin_deleted:        { points: -20, label: "관리자 삭제(감점)" },
};

/** 레벨 단계 — 꼬물이에서 명예 순찰대까지 6단계 */
export type MemberLevel = {
  level: number;
  name: string;
  /** 이 단계가 되는 최소 점수 */
  minPoints: number;
  /** 이 단계가 되려면 필요한 "지도 기여" 최소 횟수(제보·정보 추가 승인 + 받아들여진 신고 + 사진 후기 3건당 1회) */
  minMapContributions: number;
  /** 이 단계를 유지하려면 필요한 한 달 방문 일수(달력의 한 달, 한국 시간) */
  monthlyVisits: number;
  /** 한 줄 설명 */
  description: string;
  /** 배지 색(글자 / 바탕) */
  color: string;
  background: string;
};

export const MEMBER_LEVELS: MemberLevel[] = [
  { level: 1, name: "꼬물이",        minPoints: 0,    minMapContributions: 0,  monthlyVisits: 0, description: "이제 막 눈을 뜬 새 가족이에요.",           color: "#8a7a66", background: "#F3EEE4" },
  { level: 2, name: "냄새 수집가",   minPoints: 30,   minMapContributions: 0,  monthlyVisits: 2, description: "가는 곳마다 킁킁, 냄새를 모으는 중이에요.", color: "#7A6A3A", background: "#F6EFC9" },
  { level: 3, name: "거리 수색대",   minPoints: 100,  minMapContributions: 0,  monthlyVisits: 4, description: "거리 구석구석을 살피고 다녀요.",           color: "#48603A", background: "#E4EBDC" },
  { level: 4, name: "산책대장",      minPoints: 300,  minMapContributions: 0,  monthlyVisits: 8, description: "산책이라면 먼저 앞장서요.",                color: "#1F5F8B", background: "#DCEBF7" },
  { level: 5, name: "발도장 수집가", minPoints: 800,  minMapContributions: 3,  monthlyVisits: 12, description: "어디를 가든 발도장을 남겨요.",             color: "#6B3FA0", background: "#EBE1F7" },
  { level: 6, name: "명예 순찰대",   minPoints: 2000, minMapContributions: 10, monthlyVisits: 16, description: "지도를 지켜 주는 명예로운 순찰대예요.",    color: "#A8551F", background: "#FBE6CF" },
];

/** 사진 후기 몇 건을 지도 기여 1회로 칠지 — 사진 후기도 다른 사람의 방문 결정에 도움이 되므로 포함합니다. */
export const PHOTO_REVIEWS_PER_CONTRIBUTION = 3;

export type Activity = { type: ActivityType; at: string | number | Date };

/** 한국 시간 기준 날짜(YYYY-MM-DD) — 하루 상한을 세는 단위 */
function kstDay(at: string | number | Date): string {
  const time = new Date(at).getTime();
  return Number.isNaN(time) ? "unknown" : new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export type ScoreBreakdown = {
  /** 최종 점수(0 아래로 내려가지 않음) */
  total: number;
  /** 지도 기여 횟수(제보·정보 추가 승인 + 받아들여진 신고 + 사진 후기 3건당 1회) — 높은 단계의 조건 */
  mapContributions: number;
  /** 활동 종류별: 횟수 / 점수로 인정된 횟수 / 받은 점수 */
  byType: Record<ActivityType, { count: number; counted: number; points: number }>;
};

/** 활동 목록 → 점수. 하루 상한을 넘긴 활동은 횟수에는 들어가지만 점수는 받지 않습니다. */
export function scoreActivities(activities: Activity[]): ScoreBreakdown {
  const byType = Object.fromEntries(
    (Object.keys(POINT_RULES) as ActivityType[]).map((type) => [type, { count: 0, counted: 0, points: 0 }])
  ) as ScoreBreakdown["byType"];
  const perDay = new Map<string, number>();

  for (const activity of activities) {
    const rule = POINT_RULES[activity.type];
    if (!rule) continue;
    const entry = byType[activity.type];
    entry.count++;
    if (rule.dailyLimit != null) {
      const key = `${activity.type}|${kstDay(activity.at)}`;
      const used = perDay.get(key) ?? 0;
      if (used >= rule.dailyLimit) continue;
      perDay.set(key, used + 1);
    }
    entry.counted++;
    entry.points += rule.points;
  }

  const sum = Object.values(byType).reduce((acc, entry) => acc + entry.points, 0);
  // 지도 기여: 승인된 제보·정보 추가, 받아들여진 신고는 1건이 1회. 사진 후기는 PHOTO_REVIEWS_PER_CONTRIBUTION건이 1회
  // (하루 상한 안에서 점수로 인정된 사진 후기만 셉니다 — 하루에 몰아 써서 채우지 못하게).
  const mapContributions =
    byType.tip_approved.count + byType.info_update_approved.count + byType.report_accepted.count +
    Math.floor(byType.review_photo.counted / PHOTO_REVIEWS_PER_CONTRIBUTION);
  return { total: Math.max(0, sum), mapContributions, byType };
}

/** 한국 시간 기준 달(YYYY-MM) */
export function kstMonth(at: string | number | Date): string {
  return kstDay(at).slice(0, 7);
}

/** "2026-10" 다음 달 → "2026-11" */
function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** 방문한 시각 목록 → 달별 방문 일수(같은 날 여러 번은 하루로) */
export function visitsByMonth(visits: (string | number | Date)[]): Record<string, number> {
  const days = new Set(visits.map((v) => kstDay(v)).filter((d) => d !== "unknown"));
  const out: Record<string, number> = {};
  for (const day of days) out[day.slice(0, 7)] = (out[day.slice(0, 7)] ?? 0) + 1;
  return out;
}

/** 점수와 지도 기여로 달성한 단계 */
export function earnedLevel(points: number, mapContributions = 0): MemberLevel {
  const safePoints = Number.isFinite(points) ? Math.max(0, points) : 0;
  const safeContributions = Number.isFinite(mapContributions) ? Math.max(0, mapContributions) : 0;
  let index = 0;
  for (let i = 1; i < MEMBER_LEVELS.length; i++) {
    if (safePoints < MEMBER_LEVELS[i].minPoints || safeContributions < MEMBER_LEVELS[i].minMapContributions) break;
    index = i;
  }
  return MEMBER_LEVELS[index];
}

/** 회원마다 저장해 두는 레벨 상태(DB 한 줄) */
export type LevelState = {
  /** 지금 표시되는 단계 번호 */
  level: number;
  /** 지금까지 달성한 가장 높은 단계 번호 */
  earnedLevel: number;
  /** 여기까지 월말 심사를 마쳤습니다(YYYY-MM). 이 달이 끝나면 다음 심사를 합니다 */
  evaluatedMonth: string;
  /** 레벨을 처음 받은 달 — 이 달은 중간에 시작했으므로 방문 부족으로 내리지 않습니다 */
  startedMonth: string;
};

export type LevelInput = {
  points: number;
  /** 지도 기여 횟수(scoreActivities의 mapContributions) */
  mapContributions?: number;
  /** 달별 방문 일수(visitsByMonth 결과) */
  visits?: Record<string, number>;
  /** 지금 시각(시험용) */
  now?: string | number | Date;
};

export type LevelProgress = {
  /** 저장해 둘 새 상태 */
  state: LevelState;
  /** 지금 표시되는 단계 */
  current: MemberLevel;
  /** 점수·지도 기여로 달성한 단계(방문이 뜸해져도 사라지지 않음) */
  earned: MemberLevel;
  /** 방문이 모자라 달성 단계보다 내려가 있는지 */
  demoted: boolean;
  /** 이번 계산에서 내려간 단계 수(지난달들 심사 결과) / 올라간 단계 수 */
  droppedNow: number;
  raisedNow: number;
  /** 이번 달 방문 일수 */
  visitsThisMonth: number;
  /** 지금 단계를 다음 달에도 지키려면 이번 달에 더 필요한 방문 일수 */
  visitsToKeep: number;
  /** (내려가 있을 때) 한 단계 올라가려면 이번 달에 더 필요한 방문 일수 */
  visitsToRecover: number;
  /** 다음 달성 단계(최고 단계면 null) */
  next: MemberLevel | null;
  /** 다음 단계까지 남은 점수 / 모자란 지도 기여 횟수 */
  pointsToNext: number;
  mapContributionsToNext: number;
  /** 지금 달성 단계 안에서의 점수 진행률 0~1(최고 단계면 1) */
  progress: number;
};

const byNumber = (level: number) => MEMBER_LEVELS[Math.min(MEMBER_LEVELS.length, Math.max(1, Math.round(level))) - 1];

/**
 * 저장된 상태(없으면 null)와 지금의 점수·방문 기록으로 레벨을 갱신합니다.
 * 여러 번 불러도 결과가 같습니다(같은 달을 두 번 심사하지 않음).
 */
export function updateLevel(previous: LevelState | null, input: LevelInput): LevelProgress {
  const points = Number.isFinite(input.points) ? Math.max(0, input.points) : 0;
  const contributions = Number.isFinite(input.mapContributions ?? 0) ? Math.max(0, input.mapContributions ?? 0) : 0;
  const visits = input.visits ?? {};
  const thisMonth = kstMonth(input.now ?? Date.now());
  const earned = earnedLevel(points, contributions);

  let level: number;
  let state: LevelState;
  let droppedNow = 0;
  let raisedNow = 0;

  if (!previous) {
    // 처음: 달성 단계에서 시작합니다.
    level = earned.level;
    state = { level, earnedLevel: earned.level, evaluatedMonth: thisMonth, startedMonth: thisMonth };
  } else {
    level = byNumber(previous.level).level;
    // ① 끝난 달마다 한 번씩 심사 — 그 달 방문이 당시 단계의 조건에 못 미쳤으면 한 단계만 내립니다.
    let month = previous.evaluatedMonth;
    let guard = 0;
    while (month < thisMonth && guard++ < 240) {
      const started = month === previous.startedMonth; // 시작한 달은 중간부터라 심사하지 않음
      if (!started && level > 1 && (visits[month] ?? 0) < byNumber(level).monthlyVisits) { level--; droppedNow++; }
      month = nextMonth(month);
    }
    // ② 새 단계를 처음 달성했으면 바로 그 단계가 됩니다.
    if (earned.level > previous.earnedLevel && earned.level > level) { raisedNow += earned.level - level; level = earned.level; }
    state = { level, earnedLevel: Math.max(previous.earnedLevel, earned.level), evaluatedMonth: thisMonth, startedMonth: previous.startedMonth };
  }

  // ③ 내려가 있는 동안에는, 이번 달 방문이 윗단계 조건을 채우는 순간 바로 올라갑니다(달성 단계까지).
  const visitsThisMonth = visits[thisMonth] ?? 0;
  while (level < earned.level && visitsThisMonth >= byNumber(level + 1).monthlyVisits) { level++; raisedNow++; }
  state.level = level;

  const current = byNumber(level);
  const demoted = level < earned.level;
  const next = MEMBER_LEVELS[earned.level] ?? null; // 배열은 0부터라 earned.level 자리가 다음 단계
  const span = next ? next.minPoints - earned.minPoints : 1;
  return {
    state, current, earned, demoted, droppedNow, raisedNow, visitsThisMonth,
    visitsToKeep: Math.max(0, current.monthlyVisits - visitsThisMonth),
    visitsToRecover: demoted ? Math.max(0, byNumber(level + 1).monthlyVisits - visitsThisMonth) : 0,
    next,
    pointsToNext: next ? Math.max(0, next.minPoints - points) : 0,
    mapContributionsToNext: next ? Math.max(0, next.minMapContributions - contributions) : 0,
    progress: next ? Math.min(1, Math.max(0, (points - earned.minPoints) / span)) : 1,
  };
}
