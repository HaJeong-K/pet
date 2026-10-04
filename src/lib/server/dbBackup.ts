// src/lib/server/dbBackup.ts
//
// DB 자동 백업(서버 전용). 매일 새벽 작업이 사용자 데이터 표 전체를 압축 파일 하나로 묶어
// Supabase Storage의 비공개 버킷(db-backups)에 저장하고, 오래된 백업은 지웁니다.
//   · 실수로 지운 글·후기, 잘못 실행한 SQL처럼 "데이터가 망가지는" 사고에서 되돌릴 수 있습니다.
//   · ⚠ 같은 Supabase 프로젝트 안에 저장하므로 프로젝트 자체가 사라지는 사고는 막지 못합니다.
//     관리자 대시보드에서 주기적으로 내려받아 따로 보관하세요(/api/admin/backup).
// 표 목록은 고정해 두지 않고 그때그때 DB에서 읽어서, 새 표가 생겨도 자동으로 포함됩니다.

import { gzipSync } from "node:zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "db-backups";
/** 최근 이만큼의 백업을 남깁니다(매일 1개 → 약 2주치). */
const KEEP_BACKUPS = 14;
const PAGE = 1000;
/** 표 하나에서 받을 최대 행 수 — 기록이 한없이 쌓이는 표(통계 이벤트) 때문에 작업이 길어지지 않게 */
const MAX_ROWS_PER_TABLE = 300_000;
/**
 * 백업에서 빼는 표: 공공데이터 원본을 그대로 옮겨 둔 표(원본에서 다시 받을 수 있고 용량이 큼)와
 * 브라우저 오류 기록(90일 지나면 지우는 임시 기록).
 */
const SKIP_TABLES = new Set(["parks", "culture_facilities", "foodsafety_restaurants", "client_errors"]);

let client: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 서버 키가 없습니다");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** DB에 있는 표 이름 목록(PostgREST가 알려 주는 공개 스키마) */
async function listTables(): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`표 목록 조회 실패(${res.status})`);
  const spec = await res.json();
  return Object.keys(spec?.definitions ?? {}).sort();
}

async function dumpTable(name: string): Promise<{ rows: unknown[]; truncated: boolean }> {
  const rows: unknown[] = [];
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE) {
    const { data, error } = await admin().from(name).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${name}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** 로그인 계정 목록(비밀번호는 포함되지 않습니다) — 복구할 때 누가 어떤 계정이었는지 맞추는 용도 */
async function dumpAuthUsers(): Promise<unknown[]> {
  const users: unknown[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth.users: ${error.message}`);
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, providers: u.app_metadata?.providers ?? [], provider_id: u.user_metadata?.provider_id ?? null })));
    if (data.users.length < 1000) break;
  }
  return users;
}

export type BackupFile = { name: string; createdAt: string | null; sizeKb: number };
export type BackupResult = { file: string; tables: number; rows: number; sizeKb: number; truncated: string[]; failed: string[]; removed: number };

/** 한국 시간 기준 오늘 날짜 */
const todayKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

export async function listBackups(): Promise<BackupFile[]> {
  const { data, error } = await admin().storage.from(BUCKET).list("", { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error) return [];
  return (data ?? [])
    .filter((f) => f.name.endsWith(".json.gz"))
    .map((f) => ({ name: f.name, createdAt: f.created_at ?? null, sizeKb: Math.round(((f.metadata as { size?: number } | null)?.size ?? 0) / 1024) }));
}

export async function runDbBackup(): Promise<BackupResult> {
  const tables = (await listTables()).filter((t) => !SKIP_TABLES.has(t));
  const dump: Record<string, unknown[]> = {};
  const truncated: string[] = [], failed: string[] = [];
  let rows = 0;
  for (const name of tables) {
    try {
      const result = await dumpTable(name);
      dump[name] = result.rows;
      rows += result.rows.length;
      if (result.truncated) truncated.push(name);
    } catch (e) {
      failed.push(e instanceof Error ? e.message : name);
    }
  }
  try {
    dump["auth.users"] = await dumpAuthUsers();
    rows += dump["auth.users"].length;
  } catch (e) {
    failed.push(e instanceof Error ? e.message : "auth.users");
  }
  if (Object.keys(dump).length === 0) throw new Error("백업할 표를 하나도 읽지 못했습니다");

  const body = gzipSync(Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), skipped: [...SKIP_TABLES], tables: dump }), "utf8"));
  await admin().storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const file = `backup-${todayKst()}.json.gz`;
  const { error } = await admin().storage.from(BUCKET).upload(file, body, { upsert: true, contentType: "application/gzip" });
  if (error) throw new Error(`백업 저장 실패: ${error.message}`);

  // 오래된 백업 정리(이름이 날짜순이라 이름으로 정렬)
  const old = (await listBackups()).slice(KEEP_BACKUPS).map((f) => f.name);
  if (old.length > 0) await admin().storage.from(BUCKET).remove(old);

  // 일부 표를 못 읽었으면 작업 실패로 알립니다(백업 파일은 읽은 만큼 저장된 상태).
  if (failed.length > 0) throw new Error(`일부 표 백업 실패: ${failed.join(" / ")}`);
  return { file, tables: Object.keys(dump).length, rows, sizeKb: Math.round(body.length / 1024), truncated, failed, removed: old.length };
}

/** 관리자 내려받기용 임시 주소(10분) */
export async function backupDownloadUrl(name: string): Promise<string | null> {
  if (!/^backup-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(name)) return null;
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(name, 600, { download: name });
  return error ? null : data.signedUrl;
}
