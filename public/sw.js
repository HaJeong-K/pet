// 같이가개 서비스 워커 — 브라우저 알림(유기동물 공고 지역 알림) 전용
// 사이트를 닫아 둔 상태에서도 서버가 보낸 알림을 받아 화면에 띄우고, 누르면 해당 화면을 엽니다.
// (오프라인 캐시 같은 다른 기능은 넣지 않았습니다 — 화면 갱신이 꼬이지 않게 알림만 다룹니다.)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || "같이가개";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      image: data.image || undefined,
      tag: data.tag || "ggk",          // 같은 종류 알림은 쌓이지 않고 최신 것으로 바뀝니다
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // 이미 열려 있는 탭이 있으면 그 탭으로 이동, 없으면 새로 엽니다.
      for (const client of list) {
        if ("focus" in client) { client.navigate(url); return client.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
