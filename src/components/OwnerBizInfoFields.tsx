"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  formatBizNo, isValidBizNo, isValidOpenDate, onlyDigits, parseBizInfoFromOcr, type OwnerBizInfo,
} from "@/lib/ownerBizInfo";

// ── 사장님 인증용 사업자 정보 입력칸(사장님 가입·전환 폼 공용) ──
// 사업자등록증 사진을 고르면 OCR로 사업자번호·대표자명·개업일자를 읽어 빈 칸을 자동으로 채웁니다.
// 사용자는 확인만 하고, 실제 인증은 서버가 국세청 진위확인으로 판정합니다(/api/owner/auto-verify).

export type OcrStatus = "idle" | "reading" | "done" | "failed";

// Tesseract.js는 수 MB라 사진을 고른 순간에만 받습니다.
function loadTesseract(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).Tesseract) { resolve((window as any).Tesseract); return; }
    const existing = document.getElementById("tesseract-script");
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).Tesseract));
      existing.addEventListener("error", () => reject(new Error("OCR 스크립트 로드 실패")));
      return;
    }
    const script = document.createElement("script");
    script.id = "tesseract-script";
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    script.onload = () => resolve((window as any).Tesseract);
    script.onerror = () => reject(new Error("OCR 스크립트 로드 실패"));
    document.head.appendChild(script);
  });
}

export async function runOcr(file: File): Promise<string> {
  const Tesseract = await loadTesseract();
  const { data } = await Tesseract.recognize(file, "kor+eng");
  return data?.text || "";
}

/** 사업자등록증 사진 선택 → OCR → 사업자 정보 자동 채움까지 묶은 상태 훅 */
export function useOwnerBizInfo() {
  const [info, setInfo] = useState<OwnerBizInfo>({ bizNo: "", ownerName: "", openDate: "" });
  const [ocrText, setOcrText] = useState("");
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");

  const readCertificate = async (file: File | null) => {
    if (!file) return;
    setOcrStatus("reading");
    try {
      const text = await runOcr(file);
      setOcrText(text);
      const parsed = parseBizInfoFromOcr(text);
      // 사용자가 이미 입력한 칸은 덮어쓰지 않고 빈 칸만 채웁니다.
      setInfo((cur) => ({
        bizNo: cur.bizNo || parsed.bizNo,
        ownerName: cur.ownerName || parsed.ownerName,
        openDate: cur.openDate || parsed.openDate,
      }));
      setOcrStatus(parsed.bizNo || parsed.ownerName || parsed.openDate ? "done" : "failed");
    } catch (e) {
      console.error("사업자등록증 OCR 실패:", e);
      setOcrStatus("failed");
    }
  };

  return { info, setInfo, ocrText, ocrStatus, readCertificate };
}

/** 서버에 자동 인증을 요청합니다. 실패해도 가입은 "승인 대기"로 정상 접수돼 있습니다. */
export async function requestOwnerAutoVerify(info: OwnerBizInfo): Promise<{ outcome: "verified" | "pending"; message: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { outcome: "pending", message: "관리자 확인 후 승인돼요." };
    const res = await fetch("/api/owner/auto-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(info),
    });
    const json = await res.json().catch(() => null);
    if (json?.outcome) return json;
  } catch (e) {
    console.error("사장님 자동 인증 요청 실패:", e);
  }
  return { outcome: "pending", message: "관리자 확인 후 승인돼요." };
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #e2e4e8",
  fontSize: 14, boxSizing: "border-box", marginBottom: 4, fontFamily: "'Noto Sans KR', sans-serif",
};
const hintStyle = (ok: boolean): React.CSSProperties => ({ fontSize: 11, color: ok ? "#5C7A4A" : "#d9534f", marginBottom: 8, minHeight: 14 });

export default function OwnerBizInfoFields({
  info, onChange, ocrStatus,
}: { info: OwnerBizInfo; onChange: (next: OwnerBizInfo) => void; ocrStatus: OcrStatus }) {
  const bizNoDigits = onlyDigits(info.bizNo);
  const dateDigits = onlyDigits(info.openDate);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333", marginBottom: 4 }}>사업자 정보 (국세청 자동 확인)</div>
      <p style={{ fontSize: 11.5, color: "#666", marginBottom: 8, lineHeight: 1.5 }}>
        {ocrStatus === "reading"
          ? "사업자등록증을 읽고 있어요… 잠시만 기다려 주세요."
          : ocrStatus === "done"
          ? "사업자등록증에서 읽은 값을 채웠어요. 틀린 곳이 없는지 확인해 주세요."
          : ocrStatus === "failed"
          ? "사진에서 글자를 읽지 못했어요. 사업자등록증을 보고 직접 입력해 주세요."
          : "사업자등록증 사진을 올리면 자동으로 채워져요. 국세청 정보와 일치하면 바로 인증돼요."}
      </p>
      <input
        placeholder="사업자등록번호 (예: 123-45-67890)"
        inputMode="numeric"
        value={formatBizNo(info.bizNo)}
        onChange={(e) => onChange({ ...info, bizNo: onlyDigits(e.target.value).slice(0, 10) })}
        style={inputStyle}
      />
      <div style={hintStyle(isValidBizNo(bizNoDigits))}>
        {bizNoDigits.length === 10 ? (isValidBizNo(bizNoDigits) ? "올바른 형식이에요" : "번호를 다시 확인해 주세요") : ""}
      </div>
      <input
        placeholder="대표자 성명"
        value={info.ownerName}
        onChange={(e) => onChange({ ...info, ownerName: e.target.value.slice(0, 30) })}
        style={inputStyle}
      />
      <div style={hintStyle(true)} />
      <input
        placeholder="개업일자 (예: 20200315)"
        inputMode="numeric"
        value={info.openDate}
        onChange={(e) => onChange({ ...info, openDate: onlyDigits(e.target.value).slice(0, 8) })}
        style={inputStyle}
      />
      <div style={hintStyle(isValidOpenDate(dateDigits))}>
        {dateDigits.length === 8 ? (isValidOpenDate(dateDigits) ? "" : "날짜를 다시 확인해 주세요") : ""}
      </div>
    </div>
  );
}
