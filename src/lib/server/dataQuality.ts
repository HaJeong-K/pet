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
const CHECKED_LIST_MAX = 500;

export type QualityIssue = {
  kind: "coords" | "duplicate" | "broken_image" | "missing_info";
  placeId: number;
  placeName: string;
  detail: string;
  /** 왜 이렇게 분류했는지 — 관리자 화면에서 눌러 펼쳐 봅니다(점검에 쓴 실제 값과 기준). 예전 점검 기록에는 없습니다. */
  evidence?: { label: string; value: string }[];
};

/** 점검한 장소 한 곳(관리자 화면의 "점검한 장소" 목록용) */
export type CheckedPlace = { id: number; name: string; address: string; photos: number };

export type QualityReport = {
  checkedAt: string;
  placesChecked: number;
  imagesChecked: number;
  counts: Record<QualityIssue["kind"], number>;
  issues: QualityIssue[];
  /** 점검한 장소 목록(최대 CHECKED_LIST_MAX곳). 예전 점검 기록에는 없습니다. */
  checkedPlaces?: CheckedPlace[];
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

/** 사진이 열리는지 — 안 열리면 그 이유(응답 코드·시간 초과)를 함께 돌려줍니다 */
async function imageWorks(url: string): Promise<{ ok: boolean; why: string }> {
  try {
    let res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    // HEAD를 막아 둔 서버가 있어 그때는 첫 바이트만 받아 봅니다.
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    }
    return { ok: res.ok || res.status === 206, why: `서버 응답 ${res.status}${res.status === 404 ? " (파일 없음)" : res.status === 403 ? " (접근 막힘)" : ""}` };
  } catch (e) {
    return { ok: false, why: e instanceof Error && /timeout|abort/i.test(e.name + e.message) ? `${IMAGE_TIMEOUT_MS / 1000}초 안에 응답 없음` : "연결 실패(주소가 없거나 서버가 꺼짐)" };
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
      issues.push({ kind: "coords", placeId: p.id, placeName: p.name, detail: "좌표가 비어 있어요(지도에 안 보임)", evidence: [
        { label: "저장된 위도", value: String(p.lat ?? "(비어 있음)") }, { label: "저장된 경도", value: String(p.lng ?? "(비어 있음)") },
        { label: "판단 기준", value: "위도·경도가 숫자가 아니거나 비어 있거나 0,0이면 좌표 문제" },
      ] });
    } else if (!inKorea(lat, lng)) {
      issues.push({ kind: "coords", placeId: p.id, placeName: p.name, detail: `좌표가 한국 밖이에요 (${lat}, ${lng}) — 위도·경도가 바뀌었을 수 있어요`, evidence: [
        { label: "저장된 위도", value: String(lat) }, { label: "저장된 경도", value: String(lng) },
        { label: "판단 기준", value: "한국 범위(위도 33~39, 경도 124~132)를 벗어나면 좌표 문제" },
        ...(inKorea(lng, lat) ? [{ label: "참고", value: "위도와 경도를 바꾸면 한국 안이에요 — 두 값이 뒤바뀌어 저장된 것 같아요" }] : []),
      ] });
    } else {
      located.push({ id: p.id, name: p.name, key: normName(p.name), lat, lng });
    }
    const missing = [!String(p.address || "").trim() && "주소", !p.pet_zone && "동반 가능 범위"].filter(Boolean);
    if (missing.length > 0) {
      issues.push({ kind: "missing_info", placeId: p.id, placeName: p.name, detail: `${missing.join("·")} 정보가 없어요`, evidence: [
        { label: "주소", value: String(p.address || "").trim() || "(비어 있음)" },
        { label: "동반 가능 범위(pet_zone)", value: p.pet_zone || "(비어 있음)" },
        { label: "판단 기준", value: "주소나 동반 가능 범위(실내·실외 등) 중 하나라도 비어 있으면 정보 부족" },
      ] });
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
            evidence: [
              { label: "이 장소", value: `#${group[j].id} ${group[j].name} (${group[j].lat.toFixed(5)}, ${group[j].lng.toFixed(5)})` },
              { label: "비교한 장소", value: `#${group[i].id} ${group[i].name} (${group[i].lat.toFixed(5)}, ${group[i].lng.toFixed(5)})` },
              { label: "비교에 쓴 이름", value: `"${group[j].key}" — 괄호·띄어쓰기·기호를 빼고 소문자로 맞춘 이름이 같아요` },
              { label: "두 장소 거리", value: `${Math.round(d)}m` },
              { label: "판단 기준", value: `이름이 같고 ${DUPLICATE_DISTANCE_M}m 안에 있으면 중복 의심` },
            ],
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
    results.forEach((r, k) => {
      if (!r.ok) {
        const t = batch[k];
        issues.push({ kind: "broken_image", placeId: t.placeId, placeName: nameById.get(t.placeId) || `장소 ${t.placeId}`, detail: "사진이 열리지 않아요", evidence: [
          { label: "사진 주소", value: t.url },
          { label: "확인 결과", value: r.why },
          { label: "판단 기준", value: `사진 주소를 열어 ${IMAGE_TIMEOUT_MS / 1000}초 안에 정상 응답(200·206)이 오지 않으면 깨진 사진` },
        ] });
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
    checkedPlaces: places.slice(0, CHECKED_LIST_MAX).map((p) => ({
      id: p.id,
      name: p.name || `장소 ${p.id}`,
      address: String(p.address || ""),
      photos: targets.filter((t) => t.placeId === p.id).length,
    })),
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
