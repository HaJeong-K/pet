// /api/auth/find-id — 아이디(이메일) 찾기
// 이름 + 휴대폰 번호가 둘 다 맞는 계정을 찾아, 이메일 일부를 가린 형태(be****@g****.com)와
// 가입 방법(이메일·카카오·구글)을 알려 줍니다. 간편 가입이면 어느 버튼으로 로그인하면 되는지 안내할 수 있게 합니다.
// 전체 이메일은 절대 돌려주지 않습니다. 같은 곳에서 여러 번 찾으면 잠시 막습니다(남의 계정 훑어보기 방지).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/ownerStore";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";
import { isValidName, isValidPhone, normalizeName, normalizePhone } from "@/lib/contact";

const allow = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });

/** "beankonic@gmail.com" → "be*******@g****.com" */
function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  const head = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  const dot = domain.lastIndexOf(".");
  const name = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${head}${"*".repeat(Math.max(3, local.length - head.length))}@${name.slice(0, 1)}${"*".repeat(Math.max(3, name.length - 1))}${tld}`;
}

export async function POST(req: NextRequest) {
  if (!allow(clientIp(req))) {
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? normalizeName(body.name) : "";
  const phone = typeof body?.phone === "string" ? normalizePhone(body.phone) : "";
  if (!isValidName(name)) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "휴대폰 번호를 다시 확인해 주세요." }, { status: 400 });

  const { data: rows, error } = await db.from("user_contacts").select("auth_user_id").eq("phone", phone).eq("name", name).limit(5);
  if (error) return NextResponse.json({ error: "지금은 찾을 수 없어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });

  const accounts = [];
  for (const row of rows ?? []) {
    const { data: auth } = await db.auth.admin.getUserById(row.auth_user_id).catch(() => ({ data: null }));
    const user = auth?.user;
    if (!user?.email) continue;
    const p = user.app_metadata?.provider;
    accounts.push({
      email: maskEmail(user.email),
      provider: p === "kakao" || p === "google" ? p : "email",
      joined: user.created_at ? String(user.created_at).slice(0, 7).replace("-", ".") : null,
    });
  }
  return NextResponse.json({ accounts });
}
