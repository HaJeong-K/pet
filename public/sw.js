// 같이가개 서비스 워커 — 브라우저 알림(유기동물 공고 지역 알림) 전용
// 사이트를 닫아 둔 상태에서도 서버가 보낸 알림을 받아 화면에 띄우고, 누르면 해당 화면을 엽니다.
// (오프라인 캐시 같은 다른 기능은 넣지 않았습니다 — 화면 갱신이 꼬이지 않게 알림만 다룹니다.)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || "같이가개";
  const options = {
    body: data.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: data.tag || "ggk",          // 같은 종류 알림은 쌓이지 않고 최신 것으로 바뀝니다
    data: { url: data.url || "/" },
  };
  if (data.image) options.image = data.image;
  // 알림을 띄운 결과를 열려 있는 화면에 알려 줍니다 — 관리자 "폰 알림" 카드가 "기기까지 도착했는지,
  // 화면에 띄우는 데 성공했는지"를 보여 주는 데 씁니다(알림이 안 보일 때 어디서 막혔는지 확인용).
  const report = (ok, error) =>
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) client.postMessage({ type: "ggk-push", ok: ok, error: error || null, title: title, permission: (self.Notification && self.Notification.permission) || null });
    }).catch(() => {});
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => report(true))
      .catch((e) => report(false, String((e && e.message) || e)))
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
