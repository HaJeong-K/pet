"use client";

import { useEffect, useState } from "react";
import { normalizeSidoName } from "@/lib/shelterNotices";

const REGION_CACHE_KEY = "user_region_sido";
const REGION_CACHE_AT_KEY = "user_region_sido_at";
// ⚠ 예전엔 캐시에 만료 시각이 없어서, 한 번 잘못 저장된 지역(예: 위치 정확도가 나쁠 때
// 엉뚱하게 판정된 "세종")이 geolocation이 다시 성공하기 전까지 영원히 남아있었습니다.
// 사용자가 실제로는 경북에 있는데 유기동물 공고가 세종 기준으로 뜨던 문제가 바로 이
// 오래된 캐시 때문이었습니다. 캐시에 저장 시각을 같이 남겨서, 일정 시간이 지나면
// (설정 없이도) 무조건 새로 조회하도록 만료시킵니다.
const REGION_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

// ── 사용자 위치 기반 시/도 감지 ──
// 카카오 좌표→행정구역 변환 API로 현재 위치의 시/도(짧은 이름, 예: "경남")를 구합니다.
// SideAdRail(미리보기 2건)과 /shelter-notices(전체보기 페이지)에서 공통으로 씁니다.
// 위치 조회에 실패하거나 사용자가 거부하면 null을 반환하고, 호출부는 전국 공고로 대체합니다.
export function useUserRegion() {
  const [region, setRegion] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // 정규화 이전 버전에서 저장된 캐시("부산광역시" 등 전체 명칭)가 남아있을 수 있어
      // 읽을 때도 정규화합니다 — 새 위치 조회가 끝나길 기다리지 않고 바로 필터가 맞게 동작합니다.
      const cached = localStorage.getItem(REGION_CACHE_KEY);
      const cachedAt = Number(localStorage.getItem(REGION_CACHE_AT_KEY) || 0);
      const isFresh = cached && Date.now() - cachedAt < REGION_CACHE_TTL_MS;
      if (isFresh) setRegion(normalizeSidoName(cached));
      else if (cached) {
        // 만료된 캐시는 화면에 잠깐이라도 잘못된 지역을 보여주지 않도록 지웁니다 —
        // 새 위치 조회가 끝날 때까지는 null(전국) 상태로 둡니다.
        localStorage.removeItem(REGION_CACHE_KEY);
        localStorage.removeItem(REGION_CACHE_AT_KEY);
      }
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${longitude}&y=${latitude}`,
            { headers: { Authorization: `KakaoAK ${process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY}` } }
          );
          const data = await res.json();
          const rawName: string | undefined = data.documents?.[0]?.region_1depth_name;
          // 카카오는 "부산광역시" 등 정식 전체 명칭을 내려주므로, SIDO_CODE_MAP이 쓰는
          // 짧은 이름("부산")으로 정규화해서 저장합니다 — 안 하면 지역 필터가 항상 미스매치됩니다.
          const name = rawName ? normalizeSidoName(rawName) : undefined;
          if (name) {
            // ⚠ 좌표/원본 지역명을 같이 남겨서, 나중에 "감지된 지역이 실제 위치와 다르다"는
            // 문의가 오면 우리 정규화 로직 문제인지(예: 새 지역명 매핑 누락) 아니면
            // 브라우저가 애초에 부정확한 좌표를 준 것인지(기기/네트워크 위치 정확도
            // 한계) 콘솔 로그만으로 바로 구분할 수 있습니다.
            console.info(`[useUserRegion] 감지된 위치: (${latitude}, ${longitude}) → "${rawName}" → "${name}"`);
            setRegion(name);
            localStorage.setItem(REGION_CACHE_KEY, name);
            localStorage.setItem(REGION_CACHE_AT_KEY, String(Date.now()));
          } else {
            // ⚠ 실패 원인을 조용히 삼키면 "왜 안 되는지" 콘솔로도 확인할 방법이
            // 없었습니다 — 카카오 응답에 documents가 비어있는 경우(좌표가 국내가
            // 아니거나, API 키 문제 등)를 바로 알 수 있도록 남깁니다.
            console.warn("[useUserRegion] 카카오 좌표→행정구역 응답에 지역 정보가 없습니다:", data);
          }
        } catch (e) {
          // 위치 조회 실패 시 전국 공고로 대체되지만, 원인은 콘솔에서 확인할 수 있게 남깁니다
          // (예: fetch 자체 실패, API 키 오류, 네트워크 차단 등).
          console.warn("[useUserRegion] 좌표→행정구역 변환 실패:", e);
        }
      },
      (err) => {
        // ⚠ 예전엔 위치 조회 실패/거부 시 아무 로그도 안 남겨서, "왜 위치기반이
        // 안 되는지"를 사용자도 개발자도 콘솔에서 확인할 방법이 없었습니다.
        // code 1=권한 거부, 2=위치 확인 불가, 3=시간 초과 (GeolocationPositionError 스펙).
        console.warn(`[useUserRegion] geolocation 실패 (code ${err.code}): ${err.message}`);
      },
      // ⚠ KakaoMap.tsx의 "내 위치" 갱신과 동일한 기준(enableHighAccuracy:true)으로
      // 맞췄습니다 — 기본값(low accuracy)은 데스크톱·실내 등에서 Wi-Fi/IP 기반의 부정확한
      // 위치를 반환할 때가 있는데, 그 부정확한 좌표로 시/도가 잘못 판정되면(예: 실제로는
      // 경북인데 세종/경남으로 판정) 유기동물 공고 지역 필터가 엉뚱한 지역 기준으로 동작합니다.
      // maximumAge도 0으로 둬서 OS/브라우저가 들고 있던 예전 캐시 좌표를 재사용하지 않고
      // 매번 새로 측위하도록 합니다 — 그래도 부정확하다면 그건 기기·네트워크 자체의
      // 위치 정확도 한계이지 이 코드에서 더 손볼 수 있는 부분이 아닙니다(위 콘솔 로그로
      // 실제 좌표를 확인해서 판단할 수 있습니다).
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
    );
  }, []);

  return region;
}
