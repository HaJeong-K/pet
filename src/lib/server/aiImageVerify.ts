// src/lib/server/aiImageVerify.ts
//
// 제보 필수 사진 2장(① 가게 내부 전경 ② 반려동물과 함께 방문한 사진)이 실제로 그 내용을 담고 있는지
// AI 비전(Claude)으로 판별합니다. /api/jebo/verify-images가 제보 한 건을 자동 승인할지 정할 때 씁니다.
//   - 두 사진 모두 "그렇다" + 확신도 high → 자동 승인 대상
//   - 애매하거나 판별 실패(키 없음·오류) → 항상 "수동 검토 필요"
// ⚠ 서버 환경변수 ANTHROPIC_API_KEY가 있어야 동작합니다. 없으면 오류 없이 수동 검토로 넘깁니다.

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

export function manualReviewFallback(reasoning: string): VerifyImagesVerdict {
  return { interiorOk: false, petOk: false, confidence: "low", reasoning, autoApprove: false, skipped: true };
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    // 너무 큰 파일은 받지 않습니다(AI 이미지 입력 한도·메모리 보호).
    if (Number(res.headers.get("content-length") || 0) > 10 * 1024 * 1024) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString("base64"), mediaType: contentType.split(";")[0] };
  } catch {
    return null;
  }
}

export async function verifyTipImages(interiorImageUrl: string, petImageUrl: string): Promise<VerifyImagesVerdict> {
  if (!ANTHROPIC_API_KEY) {
    return manualReviewFallback("ANTHROPIC_API_KEY가 설정되지 않아 AI 자동 검증을 건너뜁니다. 관리자가 직접 확인합니다.");
  }
  try {
      const [interior, pet] = await Promise.all([
        fetchImageAsBase64(interiorImageUrl),
        fetchImageAsBase64(petImageUrl),
      ]);

      if (!interior || !pet) {
        return manualReviewFallback("이미지를 불러오지 못해 검증을 건너뜁니다.");
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
        return manualReviewFallback("AI 검증 API 호출에 실패해 수동 검토로 넘깁니다.");
      }

      const data = await res.json();
      const rawText: string = data?.content?.[0]?.text ?? "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return manualReviewFallback("AI 응답을 해석하지 못해 수동 검토로 넘깁니다.");
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return manualReviewFallback("AI 응답 JSON 파싱에 실패해 수동 검토로 넘깁니다.");
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


    return { interiorOk, petOk, confidence, reasoning, autoApprove, skipped: false };
  } catch (err) {
    console.error("[aiImageVerify] 처리 중 예외:", err);
    return manualReviewFallback("검증 중 예외가 발생해 수동 검토로 넘깁니다.");
  }
}
