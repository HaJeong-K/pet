"use client";

// 입양 카드 손글씨(Gaegu)를 "한꺼번에" 보여 주기 — 2026-11-07 대표 요청
//   한글 웹글꼴은 글자 묶음(조각)별로 따로 받아서, 받은 글자부터 하나씩 바뀌어 보였습니다(일부 글자만 손글씨).
//   이 문구에 들어가는 글자를 모두 받은 뒤에 한 번에 보여 주고, 2초 안에 못 받으면 기본 글꼴로 바로 보여 줍니다.
//   손글씨 글꼴은 화면이 한가해질 때를 기다리지 않고 이 카드가 보이는 즉시 받기 시작합니다.

import { useEffect, useState } from "react";

const GAEGU_CSS = "https://fonts.googleapis.com/css2?family=Gaegu:wght@700&display=swap";
const WAIT_MS = 2000;

function ensureStylesheet() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[data-ggk-gaegu]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = GAEGU_CSS;
  l.setAttribute("data-ggk-gaegu", "1");
  document.head.appendChild(l);
}

export function useHandwritingFont(text: string): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; setReady(true); } };
    if (typeof document === "undefined" || !document.fonts?.load) { finish(); return; }
    ensureStylesheet();
    const timer = window.setTimeout(finish, WAIT_MS);
    // 스타일시트가 붙은 뒤 글꼴 정보가 등록되기까지 잠깐 걸려, 한 번 더 시도합니다
    const tryLoad = () => document.fonts.load(`700 19px "Gaegu"`, text).then((faces) => faces.length > 0);
    tryLoad()
      .then((ok) => (ok ? true : new Promise<boolean>((r) => window.setTimeout(() => tryLoad().then(r).catch(() => r(false)), 300))))
      .then(finish, finish);
    return () => { done = true; window.clearTimeout(timer); };
  }, [text]);
  return ready;
}
