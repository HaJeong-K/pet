// src/app/api/jebo/verify-images/route.ts
//
// 제보하기(jebo) 필수 사진 2장(① 가게 내부 전경, ② 반려동물과 함께 방문한 사진)이
// 실제로 그 내용을 담고 있는지 AI 비전으로 1차 판별합니다.
//   - 두 사진 모두 "그렇다"로 판별되고 확신도가 높으면 → 자동 등록(관리자 검토 없이 승인)
//   - 애매하거나 판별에 실패하면 → 항상 안전하게 "수동 검토 필요"로 처리해서 관리자
//     승인 큐(proposals status="pending")로 넘깁니다. 오탐으로 잘못된 자동 승인이 나는
//     것보다, 애매한 건 사람이 한 번 더 보는 쪽이 훨씬 안전하기 때문입니다.
//
// ⚠️ 이 라우트가 동작하려면 서버 환경변수 ANTHROPIC_API_KEY가 필요합니다
// (.env.local 및 배포 환경(Vercel 등)에 추가해야 함). 키가 없으면 이 라우트는 에러 없이
// "수동 검토 필요"를 반환해서, AI 검증 없이도 기존처럼 제보가 정상적으로 접수되도록 합니다.

import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-haiku-4-5-20251001"; // 단순 이미지 분류라 비용/속도가 가장 좋은 모델 사용

export interface VerifyImagesVerdict {
  interiorOk: boolean;
  petOk: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  autoApprove: boolean;
  /** true면 AI 검증 자체가 실행되지 않은 것(키 없음/오류 등) — 항상 수동 검토로 보냅니다. */
  skipped: boolean;
}

function manualReviewFallback(reasoning: string): VerifyImagesVerdict {
  return { interiorOk: false, petOk: false, confidence: "low", reasoning, autoApprove: false, skipped: true };
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString("base64"), mediaType: contentType.split(";")[0] };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { interiorImageUrl, petImageUrl } = await req.json();
    if (!interiorImageUrl || !petImageUrl) {
      return NextResponse.json(manualReviewFallback("이미지 URL이 누락되어 검증을 건너뜁니다."));
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        manualReviewFallback("ANTHROPIC_API_KEY가 설정되지 않아 AI 자동 검증을 건너뜁니다. 관리자가 직접 확인합니다.")
      );
    }

    const [interior, pet] = await Promise.all([
      fetchImageAsBase64(interiorImageUrl),
      fetchImageAsBase64(petImageUrl),
    ]);

    if (!interior || !pet) {
      return NextResponse.json(manualReviewFallback("이미지를 불러오지 못해 검증을 건너뜁니다."));
    }

    const prompt = `두 장의 사진이 첨부되어 있습니다.
1번째 사진: 반려동물 동반 가능 장소의 "가게 내부 전경" 사진이라고 제보되었습니다.
2번째 사진: "반려동물과 함께 방문한 모습"을 담은 사진이라고 제보되었습니다.

각 사진이 실제로 그 설명과 맞는지 판단해주세요.
- 1번 사진이 실내 매장/가게 내부(카페, 식당, 병원, 약국, 숙소 등 실내 공간)로 보이면 interior_ok: true
- 2번 사진에 개, 고양이 등 반려동물이 실제로 보이면 pet_ok: true (사람과 함께 있지 않아도 반려동물만 보이면 true로 판단해도 됩니다)
- 확신이 서지 않거나 사진이 불명확하면 confidence를 낮게(low) 주세요.

아래 JSON 형식으로만 답변하세요. 다른 설명 문장은 절대 넣지 마세요.
{"interior_ok": boolean, "pet_ok": boolean, "confidence": "high"|"medium"|"low", "reasoning": "한 문장으로 간단히"}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "text", text: "1번 사진:" },
              { type: "image", source: { type: "base64", media_type: interior.mediaType, data: interior.data } },
              { type: "text", text: "2번 사진:" },
              { type: "image", source: { type: "base64", media_type: pet.mediaType, data: pet.data } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[jebo/verify-images] Anthropic API 오류:", res.status, errText);
      return NextResponse.json(manualReviewFallback("AI 검증 API 호출에 실패해 수동 검토로 넘깁니다."));
    }

    const data = await res.json();
    const rawText: string = data?.content?.[0]?.text ?? "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(manualReviewFallback("AI 응답을 해석하지 못해 수동 검토로 넘깁니다."));
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(manualReviewFallback("AI 응답 JSON 파싱에 실패해 수동 검토로 넘깁니다."));
    }

    const interiorOk = parsed.interior_ok === true;
    const petOk = parsed.pet_ok === true;
    const confidence: "high" | "medium" | "low" =
      parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : "low";
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";

    // 자동 승인은 두 조건 모두 통과 + 확신도가 high일 때만. 조금이라도 애매하면 사람이 봅니다.
    const autoApprove = interiorOk && petOk && confidence === "high";

    const verdict: VerifyImagesVerdict = { interiorOk, petOk, confidence, reasoning, autoApprove, skipped: false };
    return NextResponse.json(verdict);
  } catch (err) {
    console.error("[jebo/verify-images] 처리 중 예외:", err);
    return NextResponse.json(manualReviewFallback("검증 중 예외가 발생해 수동 검토로 넘깁니다."));
  }
}
