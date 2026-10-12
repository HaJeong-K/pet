// src/lib/server/supportOrgs.ts
//
// "후원할 수 있는 단체" 목록(서버 전용) — 관리자가 직접 고른 단체만 올립니다(/admin/support).
// 같이가개는 후원금을 받거나 전달하지 않고, 각 단체의 공식 후원 페이지로 연결만 합니다. 그래서 계좌번호는 담지 않고
// 공식 페이지 주소(https)만 담습니다.
// 목록은 비공개 저장소의 파일 하나에 보관합니다(표를 새로 만들 필요가 없도록).

import { createClient } from "@supabase/supabase-js";

const BUCKET = "app-private";
const FILE = "support-orgs.json";
const MAX_ORGS = 60;

export type SupportOrg = {
  id: string;
  name: string;
  /** 어떤 활동을 하는 곳인지 한두 줄 */
  description: string;
  /** 단체의 공식 후원 페이지 주소(https) */
  url: string;
  /** 숨김(목록에는 남기되 방문자에게는 보이지 않음) */
  hidden: boolean;
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** https 주소만 받습니다(그 밖의 주소·스크립트 주소는 버림) */
export function cleanOrgUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** 관리자 화면에서 보낸 목록을 저장할 수 있는 모양으로 다듬습니다. 문제가 있으면 이유를 돌려줍니다. */
export function sanitizeOrgs(input: unknown): { orgs: SupportOrg[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "목록 형식이 올바르지 않아요." };
  if (input.length > MAX_ORGS) return { error: `단체는 ${MAX_ORGS}곳까지 올릴 수 있어요.` };
  const orgs: SupportOrg[] = [];
  for (const item of input) {
    const name = typeof item?.name === "string" ? item.name.trim().slice(0, 60) : "";
    const url = cleanOrgUrl(item?.url);
    if (!name) return { error: "이름이 비어 있는 단체가 있어요." };
    if (!url) return { error: `"${name}"의 후원 페이지 주소가 올바르지 않아요(https://로 시작해야 해요).` };
    orgs.push({
      id: typeof item?.id === "string" && item.id ? item.id.slice(0, 40) : `org-${Date.now()}-${orgs.length}`,
      name,
      description: typeof item?.description === "string" ? item.description.trim().slice(0, 200) : "",
      url,
      hidden: !!item?.hidden,
    });
  }
  return { orgs };
}

export async function loadSupportOrgs(): Promise<SupportOrg[]> {
  const { data, error } = await admin().storage.from(BUCKET).download(FILE);
  if (error || !data) return [];
  try {
    const parsed = JSON.parse(await data.text());
    const result = sanitizeOrgs(parsed);
    return "orgs" in result ? result.orgs : [];
  } catch {
    return [];
  }
}

export async function saveSupportOrgs(orgs: SupportOrg[]): Promise<void> {
  const client = admin();
  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const { error } = await client.storage.from(BUCKET).upload(FILE, Buffer.from(JSON.stringify(orgs)), {
    upsert: true,
    contentType: "application/json",
  });
  if (error) throw new Error(error.message);
}
