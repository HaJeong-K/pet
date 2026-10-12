"use client";

// 관리자 목록 공통 도구 — 한 쪽에 보여 줄 양 정하기(쪽 나누기)와 여러 건 한꺼번에 처리하기.
// 신고·제보·글 검토·회원·사장님 인증·프리미엄·에러 로그 화면이 같은 모양으로 씁니다.
//
//   const pager = usePaged(list, "reports");            // 지금 쪽에 보여 줄 항목 = pager.items
//   <AdminPager pager={pager} />                         // 쪽 이동 + 한 쪽에 몇 건
//   const sel = useSelection(pager.items.map((x) => x.id));
//   <BulkBar selection={sel} actions={[{ label: "처리 완료", run: async (id) => ... }]} />
//   <SelectBox selection={sel} id={item.id} />          // 각 항목 앞의 체크 칸
//
// 목록 자체는 지금처럼 한 번에 받아 옵니다(받는 양이 아니라 화면에 그리는 양을 나눔).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZES = [20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;
const SIZE_KEY = "ggk_admin_page_size";

function readSize(): number {
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY));
    return PAGE_SIZES.includes(saved) ? saved : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export type Pager<T> = {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
  size: number;
  setPage: (page: number) => void;
  setSize: (size: number) => void;
};

/** 목록을 쪽으로 나눕니다. resetKey(고른 탭·필터 등)가 바뀌면 첫 쪽으로 돌아갑니다. */
export function usePaged<T>(list: T[], resetKey: string = ""): Pager<T> {
  const [size, setSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  // 저장해 둔 "한 쪽에 몇 건"은 화면이 뜬 뒤에 읽습니다(서버가 만든 첫 화면과 달라지지 않게).
  useEffect(() => { setSizeState(readSize()); }, []);
  useEffect(() => { setPage(1); }, [resetKey]);

  const pageCount = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(page, pageCount); // 처리해서 건수가 줄면 마지막 쪽으로 당김
  const items = useMemo(() => list.slice((current - 1) * size, current * size), [list, current, size]);
  const setSize = useCallback((next: number) => {
    setSizeState(next);
    setPage(1);
    try { localStorage.setItem(SIZE_KEY, String(next)); } catch { /* 저장 실패는 무시 */ }
  }, []);
  return { items, total: list.length, page: current, pageCount, size, setPage, setSize };
}

const pagerButton = (disabled: boolean): React.CSSProperties => ({
  width: 32, height: 32, borderRadius: 9, border: "1px solid #e2ddcf", background: "white", cursor: disabled ? "default" : "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1,
});

/** 쪽 이동 줄 — 건수가 가장 작은 쪽 크기 이하이면 아무것도 그리지 않습니다. */
export function AdminPager<T>({ pager }: { pager: Pager<T> }) {
  if (pager.total <= PAGE_SIZES[0]) return null;
  const from = (pager.page - 1) * pager.size + 1;
  const to = Math.min(pager.total, pager.page * pager.size);
  return (
    <div data-admin-pager style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap", margin: "14px 0 4px", fontSize: 12.5, color: "#666" }}>
      <button onClick={() => pager.setPage(pager.page - 1)} disabled={pager.page <= 1} aria-label="이전 쪽" style={pagerButton(pager.page <= 1)}><ChevronLeft size={15} /></button>
      <span style={{ fontWeight: 700, color: "#333" }}>{pager.page} / {pager.pageCount}쪽</span>
      <button onClick={() => pager.setPage(pager.page + 1)} disabled={pager.page >= pager.pageCount} aria-label="다음 쪽" style={pagerButton(pager.page >= pager.pageCount)}><ChevronRight size={15} /></button>
      <span style={{ color: "#999" }}>{from}–{to} / 전체 {pager.total.toLocaleString()}건</span>
      <select value={pager.size} onChange={(e) => pager.setSize(Number(e.target.value))} aria-label="한 쪽에 보여 줄 건수" style={{ padding: "6px 8px", borderRadius: 9, border: "1px solid #e2ddcf", fontSize: 12, background: "white" }}>
        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}건씩</option>)}
      </select>
    </div>
  );
}

export type Selection<K extends string | number> = {
  ids: K[];
  selected: Set<K>;
  toggle: (id: K) => void;
  toggleAll: () => void;
  clear: () => void;
  allSelected: boolean;
};

/** 지금 쪽에 보이는 항목들 중에서 고르기. 쪽을 넘기거나 목록이 바뀌어 사라진 항목은 선택에서 빠집니다. */
export function useSelection<K extends string | number>(visibleIds: K[]): Selection<K> {
  const [picked, setPicked] = useState<Set<K>>(new Set());
  const key = visibleIds.join(",");
  const selected = useMemo(() => new Set(visibleIds.filter((id) => picked.has(id))), [key, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = useCallback((id: K) => setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);
  const allSelected = visibleIds.length > 0 && selected.size === visibleIds.length;
  const toggleAll = useCallback(() => setPicked(allSelected ? new Set() : new Set(visibleIds)), [allSelected, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = useCallback(() => setPicked(new Set()), []);
  return { ids: visibleIds, selected, toggle, toggleAll, clear, allSelected };
}

/** 각 항목 앞의 체크 칸 */
export function SelectBox<K extends string | number>({ selection, id, label }: { selection: Selection<K>; id: K; label?: string }) {
  return (
    <input
      type="checkbox"
      checked={selection.selected.has(id)}
      onChange={() => selection.toggle(id)}
      onClick={(e) => e.stopPropagation()}
      aria-label={label ?? "이 항목 선택"}
      style={{ width: 17, height: 17, flexShrink: 0, cursor: "pointer", accentColor: "#5C7A4A" }}
    />
  );
}

export type BulkAction<K extends string | number> = {
  label: string;
  /** 한 건을 처리합니다. 실패하면 오류를 던지세요(나머지는 계속 처리합니다). */
  run: (id: K) => Promise<unknown>;
  /** 되돌리기 어려운 처리면 true — 빨간 버튼으로 보이고 한 번 더 묻습니다 */
  danger?: boolean;
  /** 실행 전에 물어볼 말(없으면 기본 문구) */
  confirmText?: (count: number) => string;
};

/**
 * 여러 건 한꺼번에 처리 줄 — "이 쪽 전체 선택"과 처리 버튼들.
 * 고른 것을 한 건씩 차례로 처리하고(서버에 한꺼번에 몰리지 않게), 끝나면 성공·실패 건수를 알려 줍니다.
 */
export function BulkBar<K extends string | number>({ selection, actions, onDone }: { selection: Selection<K>; actions: BulkAction<K>[]; /** 모두 처리한 뒤 한 번 부릅니다(목록 다시 받기 등) */ onDone?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  if (selection.ids.length === 0 || actions.length === 0) return null;
  const count = selection.selected.size;

  const run = async (action: BulkAction<K>) => {
    if (busy || count === 0) return;
    const question = action.confirmText ? action.confirmText(count) : `고른 ${count}건을 "${action.label}" 처리할까요?`;
    if (!window.confirm(question)) return;
    setBusy(action.label);
    setResult(null);
    let ok = 0, failed = 0;
    for (const id of [...selection.selected]) {
      try { await action.run(id); ok++; } catch { failed++; }
    }
    setBusy(null);
    selection.clear();
    onDone?.();
    setResult(failed > 0 ? `${ok}건 처리, ${failed}건은 처리하지 못했어요.` : `${ok}건 처리했어요.`);
  };

  return (
    <div data-admin-bulk style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "9px 12px", borderRadius: 12, background: count > 0 ? "#EEF3E8" : "white", border: "1px solid #e6e1d3", marginBottom: 10, fontSize: 12.5 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontWeight: 700, color: "#444" }}>
        <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} style={{ width: 17, height: 17, accentColor: "#5C7A4A" }} />
        이 쪽 전체 선택
      </label>
      <span style={{ color: count > 0 ? "#3F5230" : "#999", fontWeight: 700 }}>{count > 0 ? `${count}건 고름` : "고른 항목 없음"}</span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => run(action)}
            disabled={count === 0 || !!busy}
            style={{
              padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: count === 0 || busy ? "default" : "pointer",
              border: action.danger ? "1px solid #f3c7c5" : "none",
              background: count === 0 || busy ? "#e3e0d6" : action.danger ? "white" : "#5C7A4A",
              color: count === 0 || busy ? "#999" : action.danger ? "#b42318" : "white",
            }}
          >
            {busy === action.label ? "처리 중…" : `고른 것 ${action.label}`}
          </button>
        ))}
      </div>
      {result && <div role="status" style={{ flexBasis: "100%", fontSize: 12, fontWeight: 700, color: "#3F5230" }}>{result}</div>}
    </div>
  );
}
