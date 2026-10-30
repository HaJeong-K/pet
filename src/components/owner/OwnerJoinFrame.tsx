"use client";

// 사장님 가입·전환 화면의 바깥 틀(/signup-owner) — 가입 화면 공통 틀(components/brand/JoinLayout.tsx)에
// 숙소/가게에 맞는 왼쪽 문구만 넣어 씁니다.

import type { ReactNode } from "react";
import { BadgeCheck, BarChart3, BedDouble, CalendarCheck, MessageCircleHeart, Megaphone, ShieldCheck, Store } from "lucide-react";
import type { OwnerKind } from "@/lib/ownerKind";
import JoinLayout, { type JoinPoint } from "@/components/brand/JoinLayout";

const COPY: Record<OwnerKind, { eyebrow: string; title: [string, string]; points: JoinPoint[] }> = {
  lodging: {
    eyebrow: "사장님",
    title: ["반려동물과 여행하는 손님을", "우리 숙소로 맞이하세요"],
    points: [
      { Icon: CalendarCheck, title: "바로 예약", text: "객실·요금·동반 조건을 올리면 손님이 바로 예약해요." },
      { Icon: ShieldCheck, title: "동반 조건을 미리 정확하게", text: "크기·마릿수·추가 요금을 예약 전에 보여 줘 현장 다툼을 줄여요." },
      { Icon: BarChart3, title: "성과 보고서", text: "노출·조회·예약 흐름을 한눈에 보고, 보고서로 저장해요." },
    ],
  },
  store: {
    eyebrow: "사장님",
    title: ["반려동물 보호자에게", "우리 가게를 알리세요"],
    points: [
      { Icon: BadgeCheck, title: "사장님 인증 표시", text: "가게 정보에 '사장님 인증'이 붙어 손님이 믿고 찾아와요." },
      { Icon: MessageCircleHeart, title: "후기 답글·공지", text: "손님 후기에 답하고, 휴무·이벤트를 공지로 알려요." },
      { Icon: Megaphone, title: "상품 예약·배너 광고", text: "상품을 미리 예약받고, 동네 보호자에게 배너로 알려요." },
    ],
  },
};

export default function OwnerJoinFrame({ kind, mode, children }: { kind: OwnerKind; mode: "signup" | "upgrade"; children: ReactNode }) {
  const copy = COPY[kind];
  return (
    <JoinLayout
      theme="cream"
      eyebrow={copy.eyebrow}
      EyebrowIcon={kind === "lodging" ? BedDouble : Store}
      heading={copy.title}
      points={copy.points}
      highlights={["가입비·광고비 없이 무료로 시작", "사업자 정보는 국세청 확인에만 쓰고 공개하지 않아요"]}
      label="같이가개 사장님 센터"
      title={mode === "signup" ? "사장님으로 가입하기" : "사장님으로 전환하기"}
      sub={mode === "signup" ? "사업자 인증을 마치면 바로 사장님 센터를 쓸 수 있어요." : "지금 계정 그대로, 사업장 정보만 더하면 돼요."}
    >
      {children}
    </JoinLayout>
  );
}
