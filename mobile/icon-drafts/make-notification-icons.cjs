// 알림 아이콘 만들기 — `node mobile/icon-drafts/make-notification-icons.cjs` (프로젝트 루트에서)
//
// 폰 상단바(상태 표시줄)의 알림 아이콘은 안드로이드 규칙상 "한 가지 색 실루엣"만 됩니다 — 그림의 투명하지 않은
// 부분이 전부 흰색으로 칠해지기 때문에, 색이 꽉 찬 그림을 넣으면 그냥 흰 동그라미로 보입니다.
// 그래서 두 가지를 만듭니다.
//   · 실루엣(badge): 투명 바탕에 흰색 핀, 눈·눈썹·수염은 구멍 → 상단바와 알림 왼쪽의 작은 아이콘
//   · 컬러(icon): 0번 시안 그대로 → 알림창을 내렸을 때 알림 오른쪽에 보이는 큰 그림
// 만든 파일: public/notification-badge.png, public/notification-icon.png,
//            mobile/android/app/src/main/res/drawable-*/ic_notification_icon.png (앱이 알림을 대신 띄울 때 쓰는 아이콘)
const sharp = require("sharp");
const path = require("path");

const PIN = "M100 18 C60 18 30 48 30 86 C30 128 74 156 100 186 C126 156 170 128 170 86 C170 48 140 18 100 18Z";
const BROW_L = "M52 72 C56 56 78 54 94 66 C88 71 80 73 74 77 C68 82 54 82 52 72Z";
const BROW_R = "M148 72 C144 56 122 54 106 66 C112 71 120 73 126 77 C132 82 146 82 148 72Z";
const BEARD = "M54 106 C52 90 80 88 100 97 C120 88 148 90 146 106 C152 126 140 146 100 148 C60 146 48 126 54 106Z";
const NOSE = "M87 104 C87 98 113 98 113 104 C113 111 106 115 100 115 C94 115 87 111 87 104Z";
const FACE_T = 'transform="translate(18 4) scale(.82)"';
const paw = (x, y, s, rot, fill) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="${fill}"><ellipse cx="0" cy="8" rx="9" ry="7.5"/><ellipse cx="-11" cy="-2" rx="3.8" ry="5"/><ellipse cx="-4" cy="-9" rx="3.8" ry="5"/><ellipse cx="4" cy="-9" rx="3.8" ry="5"/><ellipse cx="11" cy="-2" rx="3.8" ry="5"/></g>`;

// 컬러: 0번 시안(크림 바탕, 갈색 핀, 발자국)
const COLOR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="44" fill="#F7F3E8"/>
  <path d="${PIN}" fill="#8B5E3C"/>
  <g ${FACE_T}><g fill="#FBFAF6"><path d="${BROW_L}"/><path d="${BROW_R}"/><path d="${BEARD}"/></g>
    <g fill="#2a2620"><circle cx="80" cy="88" r="5.5"/><circle cx="120" cy="88" r="5.5"/><path d="${NOSE}"/></g></g>
  ${paw(28, 170, 0.8, -25, "#C9A27C")}${paw(52, 188, 0.62, -15, "#C9A27C")}${paw(172, 170, 0.8, 25, "#C9A27C")}
</svg>`;

// 실루엣: 흰 핀에서 눈썹·수염·눈을 뚫고, 수염 구멍 안에 코만 다시 흰색으로. 작게 보여도 알아보도록 눈·코를 조금 키웠습니다.
const SILHOUETTE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 6 172 192">
  <defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
    <rect width="200" height="200" fill="#fff"/>
    <g ${FACE_T} fill="#000"><path d="${BROW_L}"/><path d="${BROW_R}"/><path d="${BEARD}"/><circle cx="80" cy="89" r="7"/><circle cx="120" cy="89" r="7"/></g>
  </mask></defs>
  <path d="${PIN}" fill="#fff" mask="url(#m)"/>
  <g ${FACE_T} fill="#fff"><path d="M84 105 C84 97 116 97 116 105 C116 114 107 119 100 119 C93 119 84 114 84 105Z"/></g>
</svg>`;

const root = path.join(__dirname, "..", "..");
(async () => {
  await sharp(Buffer.from(COLOR)).resize(192, 192).png().toFile(path.join(root, "public", "notification-icon.png"));
  await sharp(Buffer.from(SILHOUETTE)).resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(root, "public", "notification-badge.png"));
  for (const [dir, size] of [["mdpi", 24], ["hdpi", 36], ["xhdpi", 48], ["xxhdpi", 72], ["xxxhdpi", 96]]) {
    await sharp(Buffer.from(SILHOUETTE)).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png()
      .toFile(path.join(root, "mobile", "android", "app", "src", "main", "res", `drawable-${dir}`, "ic_notification_icon.png"));
  }
  // 확인용 미리보기: 어두운 상단바 위에 실루엣이 어떻게 보이는지 + 컬러 아이콘
  const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="200" viewBox="0 0 560 200">
    <rect width="560" height="200" fill="#3d4636"/>
    <image href="data:image/png;base64,${(await sharp(Buffer.from(SILHOUETTE)).resize(144, 144, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()).toString("base64")}" x="28" y="28" width="144" height="144"/>
    <image href="data:image/png;base64,${(await sharp(Buffer.from(SILHOUETTE)).resize(48, 48, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()).toString("base64")}" x="210" y="76" width="48" height="48"/>
    <image href="data:image/png;base64,${(await sharp(Buffer.from(SILHOUETTE)).resize(24, 24, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()).toString("base64")}" x="296" y="88" width="24" height="24"/>
    <image href="data:image/png;base64,${(await sharp(Buffer.from(COLOR)).resize(144, 144).png().toBuffer()).toString("base64")}" x="388" y="28" width="144" height="144"/>
  </svg>`;
  await sharp(Buffer.from(preview)).png().toFile(path.join(__dirname, "notification-icons-preview.png"));
  console.log("완료: public/notification-badge.png, public/notification-icon.png, 앱 알림 아이콘 5종, 미리보기");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
