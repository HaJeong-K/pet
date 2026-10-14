// scripts/make-bark-sound.cjs
//
// 새 예약 알림음("멍멍!")을 직접 만들어 내는 스크립트 — `node scripts/make-bark-sound.cjs`
// 녹음한 소리나 남의 음원을 쓰지 않고 수식으로 합성하므로 저작권 걱정이 없습니다(상업적으로 써도 됩니다).
// 만드는 파일(같은 소리):
//   · public/sounds/bark.wav                              — 사이트를 열어 둔 화면에서 재생
//   · mobile/android/app/src/main/res/raw/ggk_bark.wav    — 안드로이드 앱의 "새 예약 알림" 알림음
//
// 소리 만드는 법: 짖는 소리 한 번 = 음높이가 빠르게 올랐다 떨어지는 거친 소리(톱니파)를
// 입 모양에 해당하는 울림(공명) 두 개로 거르고, 처음에 숨소리(잡음)를 조금 섞은 것. 이것을 두 번 이어 붙입니다.

const fs = require("fs");
const path = require("path");

const RATE = 22050;
const out = [];

/** 간단한 울림 필터(특정 높이의 소리만 강조) */
function resonator(freq, q) {
  const w = (2 * Math.PI * freq) / RATE, alpha = Math.sin(w) / (2 * q);
  const b0 = alpha, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * Math.cos(w), a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

// 매번 같은 소리가 나오도록 고정된 순서의 잡음을 씁니다.
let seed = 20261014;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

function bark(seconds, basePitch, loudness) {
  const total = Math.floor(seconds * RATE);
  const f1 = resonator(620, 4), f2 = resonator(1150, 5), f3 = resonator(2300, 6);
  let phase = 0;
  for (let i = 0; i < total; i++) {
    const t = i / total;
    // 음높이: 처음에 살짝 오르고(멍-의 "ㅁ") 곧 떨어집니다.
    const pitch = basePitch * (1 + 0.35 * Math.sin(Math.min(1, t * 4) * Math.PI * 0.5) - 0.75 * t);
    phase += pitch / RATE;
    const saw = 2 * (phase % 1) - 1;
    const breath = noise() * (t < 0.12 ? 0.9 : 0.18);
    const source = saw * 0.8 + breath;
    const voiced = f1(source) * 1.0 + f2(source) * 0.7 + f3(source) * 0.25;
    // 세기: 아주 빨리 커졌다가 서서히 줄어듭니다.
    const envelope = Math.min(1, t / 0.04) * Math.pow(1 - t, 1.6);
    out.push(voiced * envelope * loudness);
  }
}
const silence = (seconds) => { for (let i = 0; i < Math.floor(seconds * RATE); i++) out.push(0); };

silence(0.02);
bark(0.17, 430, 1.0);   // 멍
silence(0.09);
bark(0.21, 400, 0.95);  // 멍!
silence(0.05);

// 가장 큰 소리가 넘치지 않게 맞춘 뒤 16비트 WAV로 저장
const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
const pcm = Buffer.alloc(out.length * 2);
out.forEach((v, i) => pcm.writeInt16LE(Math.round((v / peak) * 0.89 * 32767), i * 2));
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
const wav = Buffer.concat([header, pcm]);

const root = path.join(__dirname, "..");
for (const target of ["public/sounds/bark.wav", "mobile/android/app/src/main/res/raw/ggk_bark.wav"]) {
  const file = path.join(root, target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, wav);
  console.log(`${target} — ${(wav.length / 1024).toFixed(1)}KB, ${(out.length / RATE).toFixed(2)}초`);
}
