"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    kakao: any;
  }
}

export default function KakaoMap() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) return;

    window.kakao.maps.load(() => {
      const container =
        document.getElementById("map");

      if (!container) return;

      const options = {
        center: new window.kakao.maps.LatLng(
          37.5665,
          126.9780
        ),
        level: 3,
      };

      const map = new window.kakao.maps.Map(
        container,
        options
      );

      new window.kakao.maps.Marker({
        map,
        position: new window.kakao.maps.LatLng(
          37.5665,
          126.9780
        ),
      });
    });
  }, [loaded]);

  return (
    <>
      <Script
        src={`https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}`}
        strategy="afterInteractive"
        onLoad={() => {
          setLoaded(true);
        }}
      />

      <div
        id="map"
        style={{
          width: "100vw",
          height: "100vh",
        }}
      />
    </>
  );
}