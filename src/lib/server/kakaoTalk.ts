// src/lib/server/kakaoTalk.ts
//
// 카카오톡 "나에게 보내기"로 관리자 알림 받기(서버 전용).
//   1) 관리자가 관리자 대시보드에서 "카카오톡 알림 연결"을 누르면 카카오 동의 화면(talk_message)으로 가고,
//   2) 돌아오면(/api/admin/kakao-talk/callback) 받은 토큰을 암호화해 비공개 저장소에 보관합니다.
//   3) 알림을 보낼 때 토큰이 곧 만료되면 자동으로 연장(refresh)하고, 관리자 카톡 '나와의 채팅'으로 보냅니다.
//
// 보관: Supabase Storage 비공개 버킷(app-private)에 AES-256-GCM으로 암호화한 파일 하나.
//   키는 서버 환경변수 APP_ENCRYPTION_KEY — DB 테이블을 새로 만들 필요가 없습니다.
// 카카오 리프레시 토큰은 약 2개월 유효하고, 만료 1개월 전부터는 연장할 때 새로 발급됩니다.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/siteUrl";

const BUCKET = "app-private";
const TOKEN_FILE = "kakao-talk-token.enc";
const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const MEMO_URL = "https://kapi.kakao.com/v2/api/talk/memo/default/send";
const TIMEOUT_MS = 5000;
/** 카카오 텍스트 메시지 본문 최대 길이 */
const MAX_TEXT = 200;
/** 연결 요청(state)의 유효 시간 */
const STATE_TTL_MS = 10 * 60_000;

export const KAKAO_TALK_CALLBACK_PATH = "/api/admin/kakao-talk/callback";

type StoredToken = {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
  connectedAt: number;
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function encKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY;
  return raw ? createHash("sha256").update(raw).digest() : null;
}

function encrypt(obj: unknown): Buffer {
  const key = encKey();
  if (!key) throw new Error("APP_ENCRYPTION_KEY가 없습니다.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

function decrypt<T>(buf: Buffer): T | null {
  const key = encKey();
  if (!key || buf.length < 29) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function loadToken(): Promise<StoredToken | null> {
  const { data, error } = await admin().storage.from(BUCKET).download(TOKEN_FILE);
  if (error || !data) return null;
  return decrypt<StoredToken>(Buffer.from(await data.arrayBuffer()));
}

async function saveToken(token: StoredToken): Promise<void> {
  const client = admin();
  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const { error } = await client.storage
    .from(BUCKET)
    .upload(TOKEN_FILE, encrypt(token), { upsert: true, contentType: "application/octet-stream" });
  if (error) throw new Error(`토큰 저장 실패: ${error.message}`);
}

export async function disconnectKakaoTalk(): Promise<void> {
  await admin().storage.from(BUCKET).remove([TOKEN_FILE]);
}

export async function kakaoTalkStatus(): Promise<{ connected: boolean; refreshExpiresAt?: number; connectedAt?: number }> {
  const token = await loadToken();
  if (!token || token.refreshExpiresAt < Date.now()) return { connected: false };
  return { connected: true, refreshExpiresAt: token.refreshExpiresAt, connectedAt: token.connectedAt };
}

// ── 연결 요청 위조 방지(state): 관리자 ID + 시각에 서명 ──
export function signState(adminId: string): string {
  const payload = `${adminId}.${Date.now()}`;
  const sig = createHmac("sha256", encKey() ?? Buffer.alloc(32)).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const [adminId, ts, sig] = Buffer.from(state, "base64url").toString("utf8").split(".");
    const expected = createHmac("sha256", encKey() ?? Buffer.alloc(32)).update(`${adminId}.${ts}`).digest("base64url");
    const ok = sig && sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return ok && Date.now() - Number(ts) < STATE_TTL_MS ? adminId : null;
  } catch {
    return null;
  }
}

export function kakaoTalkAuthorizeUrl(origin: string, state: string): string | null {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key || !encKey()) return null;
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", key);
  url.searchParams.set("redirect_uri", `${origin}${KAKAO_TALK_CALLBACK_PATH}`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "talk_message");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const body = new URLSearchParams({ client_id: process.env.KAKAO_REST_API_KEY || "", ...params });
  if (process.env.KAKAO_CLIENT_SECRET) body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = json?.error_code === "KOE010" ? " (카카오 앱의 Client Secret이 켜져 있어요 — KAKAO_CLIENT_SECRET이 필요해요)" : "";
    throw new Error(`카카오 토큰 요청 실패: ${json?.error_code || res.status} ${json?.error_description || ""}${hint}`);
  }
  return json;
}

/** 동의 화면에서 돌아온 code로 토큰을 받아 보관합니다. */
export async function connectKakaoTalk(code: string, origin: string): Promise<void> {
  const json = await tokenRequest({
    grant_type: "authorization_code",
    redirect_uri: `${origin}${KAKAO_TALK_CALLBACK_PATH}`,
    code,
  });
  const scopes = String(json.scope || "");
  if (scopes && !scopes.includes("talk_message")) {
    throw new Error("카카오톡 메시지 전송 동의가 빠져 있어요. 동의 화면에서 항목을 체크해 주세요.");
  }
  const now = Date.now();
  await saveToken({
    accessToken: json.access_token,
    accessExpiresAt: now + Number(json.expires_in || 0) * 1000,
    refreshToken: json.refresh_token,
    refreshExpiresAt: now + Number(json.refresh_token_expires_in || 0) * 1000,
    connectedAt: now,
  });
}

async function validAccessToken(): Promise<string | null> {
  const token = await loadToken();
  if (!token) return null;
  if (token.accessExpiresAt - Date.now() > 5 * 60_000) return token.accessToken;
  if (token.refreshExpiresAt < Date.now()) return null;
  const json = await tokenRequest({ grant_type: "refresh_token", refresh_token: token.refreshToken });
  const now = Date.now();
  const next: StoredToken = {
    ...token,
    accessToken: json.access_token,
    accessExpiresAt: now + Number(json.expires_in || 0) * 1000,
    // 리프레시 토큰은 만료가 가까울 때만 새로 옵니다.
    ...(json.refresh_token
      ? { refreshToken: json.refresh_token, refreshExpiresAt: now + Number(json.refresh_token_expires_in || 0) * 1000 }
      : {}),
  };
  await saveToken(next);
  return next.accessToken;
}

/** 관리자 카톡 '나와의 채팅'으로 보냅니다. 연결 안 됐으면 null, 실패하면 false(예외 없음). */
export async function sendKakaoTalkMemo(text: string, path = "/admin"): Promise<boolean | null> {
  try {
    const accessToken = await validAccessToken();
    if (!accessToken) return null;
    const link = `${siteUrl}${path}`;
    const template = {
      object_type: "text",
      text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + "…" : text,
      link: { web_url: link, mobile_web_url: link },
      button_title: "관리자 화면 열기",
    };
    const res = await fetch(MEMO_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({ template_object: JSON.stringify(template) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.warn("[kakaoTalk] 전송 실패", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.warn("[kakaoTalk] 전송 실패", e instanceof Error ? e.message : e);
    return false;
  }
}

/** 리프레시 토큰이 곧 만료되는지(다시 연결해야 하는지) — 아침 요약 때 확인 */
export async function kakaoTalkNeedsReconnect(): Promise<boolean> {
  const token = await loadToken();
  return Boolean(token && token.refreshExpiresAt - Date.now() < 7 * 24 * 60 * 60_000);
}
