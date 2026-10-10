// 앱·사이트 아이콘 만들기 — `node mobile/icon-drafts/make-app-icons.cjs` (프로젝트 루트에서)
//
// 글자 없는 핀 로고(시안 0번: 크림 바탕, 갈색 핀 속 슈나우저, 발자국)를 필요한 모든 크기로 만듭니다.
//   사이트: src/app/icon.png(512) · apple-icon.png(180) · favicon.ico(16·32·48) · public/icon-maskable.png(512)
//   앱:     mipmap-*/ic_launcher.png(둥근 사각) · mipmap-*/ic_maskable.png(가장자리까지 채운 것) ·
//           drawable-*/splash.png(앱을 열 때 잠깐 보이는 그림) · store_icon.png(512)
// "maskable"은 폰이 동그라미·둥근 사각 등 제 모양대로 잘라 쓰는 아이콘이라, 그림을 가운데에 작게 두고 바탕을 끝까지 채웁니다.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const BG = "#F7F3E8";
const PIN = "M100 18 C60 18 30 48 30 86 C30 128 74 156 100 186 C126 156 170 128 170 86 C170 48 140 18 100 18Z";
const paw = (x, y, s, rot) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="#C9A27C"><ellipse cx="0" cy="8" rx="9" ry="7.5"/><ellipse cx="-11" cy="-2" rx="3.8" ry="5"/><ellipse cx="-4" cy="-9" rx="3.8" ry="5"/><ellipse cx="4" cy="-9" rx="3.8" ry="5"/><ellipse cx="11" cy="-2" rx="3.8" ry="5"/></g>`;
/** 핀 + 얼굴 + 발자국(200×200 기준 좌표) */
const ART = `<path d="${PIN}" fill="#8B5E3C"/>
  <g transform="translate(18 4) scale(.82)"><g fill="#FBFAF6">
    <path d="M52 72 C56 56 78 54 94 66 C88 71 80 73 74 77 C68 82 54 82 52 72Z"/><path d="M148 72 C144 56 122 54 106 66 C112 71 120 73 126 77 C132 82 146 82 148 72Z"/>
    <path d="M54 106 C52 90 80 88 100 97 C120 88 148 90 146 106 C152 126 140 146 100 148 C60 146 48 126 54 106Z"/></g>
    <g fill="#2a2620"><circle cx="80" cy="88" r="5.5"/><circle cx="120" cy="88" r="5.5"/><path d="M87 104 C87 98 113 98 113 104 C113 111 106 115 100 115 C94 115 87 111 87 104Z"/></g></g>
  ${paw(28, 170, 0.8, -25)}${paw(52, 188, 0.62, -15)}${paw(172, 170, 0.8, 25)}`;

/** 둥근 사각 타일(모서리 밖은 투명) — 사이트 아이콘, 예전 방식의 앱 아이콘 */
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><clipPath id="c"><rect width="200" height="200" rx="44"/></clipPath></defs><g clip-path="url(#c)"><rect width="200" height="200" fill="${BG}"/>${ART}</g></svg>`;
/** 가장자리까지 채운 것 — 그림은 가운데 66%에(폰이 어떤 모양으로 잘라도 잘리지 않는 안전 영역) */
const MASKABLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${BG}"/><g transform="translate(34 30) scale(.66)">${ART}</g></svg>`;
/** 앱을 열 때 보이는 그림 — 바탕색은 앱 설정(backgroundColor)이 칠하므로 그림만 */
const SPLASH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g transform="translate(40 36) scale(.6)">${ART}</g></svg>`;

const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();

/** PNG 여러 장을 .ico 한 파일로 묶습니다(브라우저 탭 아이콘). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const root = path.join(__dirname, "..", "..");
const res = path.join(root, "mobile", "android", "app", "src", "main", "res");
(async () => {
  // ── 사이트 ──
  fs.writeFileSync(path.join(root, "src", "app", "icon.png"), await png(TILE, 512));
  fs.writeFileSync(path.join(root, "src", "app", "apple-icon.png"), await sharp(Buffer.from(MASKABLE), { density: 384 }).resize(180, 180).flatten({ background: BG }).png().toBuffer());
  fs.writeFileSync(path.join(root, "src", "app", "favicon.ico"), ico([{ size: 16, data: await png(TILE, 16) }, { size: 32, data: await png(TILE, 32) }, { size: 48, data: await png(TILE, 48) }]));
  fs.writeFileSync(path.join(root, "public", "icon-maskable.png"), await png(MASKABLE, 512));
  // ── 앱 ──
  for (const [dir, launcher, maskable, splash] of [["mdpi", 48, 82, 300], ["hdpi", 72, 123, 450], ["xhdpi", 96, 164, 600], ["xxhdpi", 144, 246, 900], ["xxxhdpi", 192, 328, 1200]]) {
    fs.writeFileSync(path.join(res, `mipmap-${dir}`, "ic_launcher.png"), await png(TILE, launcher));
    fs.writeFileSync(path.join(res, `mipmap-${dir}`, "ic_maskable.png"), await png(MASKABLE, maskable));
    fs.writeFileSync(path.join(res, `drawable-${dir}`, "splash.png"), await png(SPLASH, splash));
  }
  fs.writeFileSync(path.join(root, "mobile", "android", "store_icon.png"), await png(TILE, 512));
  // ── 확인용 미리보기: 둥근 사각 / 동그라미로 잘렸을 때 / 작은 크기 ──
  const b64 = async (svg, size) => (await png(svg, size)).toString("base64");
  const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="220" viewBox="0 0 640 220"><rect width="640" height="220" fill="#8a8f86"/>
    <image href="data:image/png;base64,${await b64(TILE, 160)}" x="30" y="30" width="160" height="160"/>
    <defs><clipPath id="r"><circle cx="310" cy="110" r="80"/></clipPath><clipPath id="q"><rect x="430" y="30" width="160" height="160" rx="58"/></clipPath></defs>
    <image href="data:image/png;base64,${await b64(MASKABLE, 222)}" x="199" y="-1" width="222" height="222" clip-path="url(#r)"/>
    <image href="data:image/png;base64,${await b64(MASKABLE, 222)}" x="399" y="-1" width="222" height="222" clip-path="url(#q)"/>
    <image href="data:image/png;base64,${await b64(TILE, 32)}" x="596" y="176" width="32" height="32"/></svg>`;
  await sharp(Buffer.from(preview)).png().toFile(path.join(__dirname, "app-icons-preview.png"));
  console.log("완료: 사이트 아이콘 4종, 앱 아이콘 15종 + 스토어 아이콘, 미리보기");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
