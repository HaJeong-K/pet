// src/lib/server/dataQuality.ts
//
// 장소 데이터 품질 점검(주 1회 자동 + 관리자 화면에서 바로 실행). 직접 등록·제보로 들어온 장소(places)를 훑어
//   - 좌표 문제: 비어 있거나 숫자가 아니거나 한국 범위 밖
//   - 중복 의심: 이름이 같고(정규화 기준) 50m 안에 있는 장소
//   - 깨진 사진: 대표 사진·추가 사진 주소가 열리지 않음(한 번에 최대 400장 확인)
//   - 정보 부족: 주소나 동반 가능 범위(pet_zone)가 비어 있음
// 을 찾아 결과를 비공개 저장소에 보관합니다(관리자 화면 /admin/quality에서 확인).
// 공공데이터 장소는 원본 기관 데이터라 여기서 고치지 않으므로 점검 대상에서 뺍니다.

import { createClient } from "@supabase/supabase-js";

const BUCKET = "app-private";
const REPORT_FILE = "data-quality-report.json";
const DUPLICATE_DISTANCE_M = 50;
const MAX_IMAGE_CHECKS = 400;
const IMAGE_TIMEOUT_MS = 5000;
const IMAGE_CONCURRENCY = 8;
const DEFAULT_IMAGE = "/images/default-place.png";

export type QualityIssue = {
  kind: "coords" | "duplicate" | "broken_image" | "missing_info";
  placeId: number;
  placeName: string;
  detail: string;
};

export type QualityReport = {
  checkedAt: string;
  placesChecked: number;
  imagesChecked: number;
  counts: Record<QualityIssue["kind"], number>;
  issues: QualityIssue[];
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

const normName = (s: string) => (s || "").replace(/\(.*?\)/g, "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const inKorea = (lat: number, lng: number) => lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;

async function imageWorks(url: string): Promise<boolean> {
  try {
    let res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    // HEAD를 막아 둔 서버가 있어 그때는 첫 바이트만 받아 봅니다.
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    }
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

export async function runDataQualityCheck(): Promise<QualityReport> {
  const client = admin();
  const places: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("places")
      .select("id, name, address, lat, lng, pet_zone, image_url")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    places.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const issues: QualityIssue[] = [];
  const located: { id: number; name: string; key: string; lat: number; lng: number }[] = [];

  for (const p of places) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      issues.push({ kind: "coords", placeId: p.id, placeName: p.name, detail: "좌표가 비어 있어요(지도에 안 보임)" });
    } else if (!inKorea(lat, lng)) {
      issues.push({ kind: "coords", placeId: p.id, placeName: p.name, detail: `좌표가 한국 밖이에요 (${lat}, ${lng}) — 위도·경도가 바뀌었을 수 있어요` });
    } else {
      located.push({ id: p.id, name: p.name, key: normName(p.name), lat, lng });
    }
    const missing = [!String(p.address || "").trim() && "주소", !p.pet_zone && "동반 가능 범위"].filter(Boolean);
    if (missing.length > 0) {
      issues.push({ kind: "missing_info", placeId: p.id, placeName: p.name, detail: `${missing.join("·")} 정보가 없어요` });
    }
  }

  // 중복 의심: 같은 이름끼리만 거리 비교(이름별로 묶어 계산량을 줄임)
  const byName = new Map<string, typeof located>();
  for (const p of located) {
    if (!p.key) continue;
    byName.set(p.key, [...(byName.get(p.key) || []), p]);
  }
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const d = distanceM(group[i].lat, group[i].lng, group[j].lat, group[j].lng);
        if (d <= DUPLICATE_DISTANCE_M) {
          issues.push({
            kind: "duplicate",
            placeId: group[j].id,
            placeName: group[j].name,
            detail: `같은 이름의 장소(번호 ${group[i].id})와 ${Math.round(d)}m 거리 — 중복 등록 의심`,
          });
        }
      }
    }
  }

  // 깨진 사진: 대표 사진 + 추가 사진(최근 것부터), 최대 MAX_IMAGE_CHECKS장
  const { data: extraImages } = await client
    .from("place_images")
    .select("place_id, image_url")
    .order("created_at", { ascending: false })
    .limit(MAX_IMAGE_CHECKS);
  const nameById = new Map(places.map((p) => [p.id, p.name]));
  const targets: { placeId: number; url: string }[] = [
    ...places.filter((p) => p.image_url && p.image_url !== DEFAULT_IMAGE && /^https?:/.test(p.image_url)).map((p) => ({ placeId: p.id, url: p.image_url })),
    ...(extraImages || []).filter((i) => /^https?:/.test(i.image_url || "")).map((i) => ({ placeId: i.place_id, url: i.image_url })),
  ].slice(0, MAX_IMAGE_CHECKS);

  for (let i = 0; i < targets.length; i += IMAGE_CONCURRENCY) {
    const batch = targets.slice(i, i + IMAGE_CONCURRENCY);
    const results = await Promise.all(batch.map((t) => imageWorks(t.url)));
    results.forEach((ok, k) => {
      if (!ok) {
        const t = batch[k];
        issues.push({ kind: "broken_image", placeId: t.placeId, placeName: nameById.get(t.placeId) || `장소 ${t.placeId}`, detail: "사진이 열리지 않아요" });
      }
    });
  }

  const counts = { coords: 0, duplicate: 0, broken_image: 0, missing_info: 0 } as QualityReport["counts"];
  for (const issue of issues) counts[issue.kind]++;
  const report: QualityReport = {
    checkedAt: new Date().toISOString(),
    placesChecked: places.length,
    imagesChecked: targets.length,
    counts,
    issues,
  };

  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  await client.storage.from(BUCKET).upload(REPORT_FILE, Buffer.from(JSON.stringify(report)), {
    upsert: true,
    contentType: "application/json",
  });
  return report;
}

export async function loadDataQualityReport(): Promise<QualityReport | null> {
  const { data, error } = await admin().storage.from(BUCKET).download(REPORT_FILE);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as QualityReport;
  } catch {
    return null;
  }
}
