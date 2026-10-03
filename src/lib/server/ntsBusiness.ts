// src/lib/server/ntsBusiness.ts
//
// 국세청 사업자등록정보 진위확인 API(공공데이터포털 "국세청_사업자등록정보 진위확인 및 상태조회 서비스").
// 사업자번호·개업일자·대표자명이 국세청 등록 정보와 일치하는지, 지금 영업 중(계속사업자)인지 확인합니다.
// 사장님 자동 인증의 근거입니다(src/app/api/owner/auto-verify/route.ts).
//
// ⚠ 공공데이터포털에서 이 API를 "활용신청"해야 키가 동작합니다(보통 즉시 자동 승인).
//    신청 전에는 -401(유효하지 않은 인증키)이 오고, 그때는 자동 인증 대신 관리자 검토로 넘어갑니다.

import type { OwnerBizInfo } from "@/lib/ownerBizInfo";

const VALIDATE_URL = "https://api.odcloud.kr/api/nts-businessman/v1/validate";
const TIMEOUT_MS = 8000;

export type NtsResult =
  | { ok: true; valid: boolean; active: boolean; statusText: string }
  | { ok: false; reason: "no_key" | "key_not_approved" | "api_error" };

function serviceKey(): string | null {
  const key = process.env.NTS_API_KEY;
  if (!key) return null;
  // 공공데이터포털 키는 인코딩된 값/원문 두 가지로 발급돼서, 한 번만 인코딩되게 맞춥니다.
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

export async function validateBusiness(info: OwnerBizInfo): Promise<NtsResult> {
  const key = serviceKey();
  if (!key) return { ok: false, reason: "no_key" };
  try {
    const res = await fetch(`${VALIDATE_URL}?serviceKey=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        businesses: [{ b_no: info.bizNo, start_dt: info.openDate, p_nm: info.ownerName.trim() }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.code === -401) return { ok: false, reason: "key_not_approved" };
    const row = json?.data?.[0];
    if (!res.ok || !row) {
      console.error("[ntsBusiness] 국세청 응답 오류", res.status, json?.code ?? "", json?.msg ?? "");
      return { ok: false, reason: "api_error" };
    }
    const valid = row.valid === "01";
    const sttCd = row.status?.b_stt_cd ?? "";
    return { ok: true, valid, active: sttCd === "01", statusText: row.status?.b_stt || "" };
  } catch (e) {
    console.error("[ntsBusiness] 국세청 호출 실패", e);
    return { ok: false, reason: "api_error" };
  }
}

// ── 영업 상태 조회(사업자번호만으로) ──
// 인증된 사장님 업장이 폐업·휴업했는지 매주 확인할 때 씁니다(src/lib/server/closureCheck.ts).
const STATUS_URL = "https://api.odcloud.kr/api/nts-businessman/v1/status";
/** 국세청 상태조회는 한 번에 최대 100개 사업자번호를 받습니다. */
const STATUS_BATCH = 100;

export type BizStatus = { bizNo: string; code: "01" | "02" | "03" | ""; text: string };

export async function fetchBusinessStatuses(
  bizNos: string[]
): Promise<{ ok: true; statuses: BizStatus[] } | { ok: false; reason: "no_key" | "key_not_approved" | "api_error" }> {
  const key = serviceKey();
  if (!key) return { ok: false, reason: "no_key" };
  const statuses: BizStatus[] = [];
  for (let i = 0; i < bizNos.length; i += STATUS_BATCH) {
    const batch = bizNos.slice(i, i + STATUS_BATCH);
    try {
      const res = await fetch(`${STATUS_URL}?serviceKey=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ b_no: batch }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401 || json?.code === -401) return { ok: false, reason: "key_not_approved" };
      if (!res.ok || !Array.isArray(json?.data)) return { ok: false, reason: "api_error" };
      for (const row of json.data) {
        statuses.push({ bizNo: String(row.b_no || ""), code: (row.b_stt_cd || "") as BizStatus["code"], text: row.b_stt || "" });
      }
    } catch (e) {
      console.error("[ntsBusiness] 상태조회 실패", e);
      return { ok: false, reason: "api_error" };
    }
  }
  return { ok: true, statuses };
}
