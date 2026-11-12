// Génère les sons .wav (res/raw) et les icônes mipmap Android à partir de icon-512.png.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RES = "android/app/src/main/res";
const SR = 22050;

// Patterns calqués sur src/lib/audio.ts
const sounds = {
  sunrise: { notes: [523, 659, 784, 1046], wave: "sine", step: 0.16, dur: 0.3, period: 1.5 },
  pulse: { notes: [440, 440], wave: "triangle", step: 0.18, dur: 0.14, period: 0.9 },
  digital: { notes: [1200, 0, 1200, 0, 1200], wave: "square", step: 0.1, dur: 0.07, period: 1.0 },
  siren: { notes: [700, 950, 700, 950], wave: "sawtooth", step: 0.28, dur: 0.26, period: 1.4 },
  beacon: { notes: [880, 660], wave: "sine", step: 0.35, dur: 0.3, period: 1.2 },
};

function osc(type, phase) {
  const p = phase % (2 * Math.PI);
  if (type === "sine") return Math.sin(p);
  if (type === "square") return p < Math.PI ? 1 : -1;
  if (type === "triangle") return 2 / Math.PI * Math.asin(Math.sin(p));
  return 2 * (p / (2 * Math.PI)) - 1; // sawtooth
}

function render(name) {
  const { notes, wave, step, dur, period } = sounds[name];
  const total = Math.ceil(period * SR);
  const buf = new Float32Array(total);
  notes.forEach((f, i) => {
    if (f <= 0) return;
    const start = Math.floor(i * step * SR);
    const n = Math.floor(dur * SR);
    for (let j = 0; j < n && start + j < total; j++) {
      const t = j / SR;
      const env = Math.min(1, t / 0.02) * Math.exp(-t * 3);
      buf[start + j] += osc(wave, 2 * Math.PI * f * t) * env * 0.5;
    }
  });
  // WAV 16-bit mono
  const dataSize = total * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, dataSize, true);
  for (let i = 0; i < total; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(buf[i] * 32767))), true);
  mkdirSync(join(RES, "raw"), { recursive: true });
  writeFileSync(join(RES, "raw", `${name}.wav`), Buffer.from(ab));
  console.log(`raw/${name}.wav`);
}

Object.keys(sounds).forEach(render);

// Icônes : ic_launcher (legacy) + foreground adaptive (432px avec marge)
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dpi, px] of Object.entries(sizes)) {
  await sharp("public/icon-512.png").resize(px, px).png().toFile(`${RES}/mipmap-${dpi}/ic_launcher.png`);
  await sharp("public/icon-512.png").resize(px, px).png().toFile(`${RES}/mipmap-${dpi}/ic_launcher_round.png`);
}
// Foreground adaptive : 432px, logo réduit à ~60% centré
const fg = await sharp("public/icon-512.png").resize(280, 280).png().toBuffer();
for (const dpi of Object.keys(sizes)) {
  const d = `${RES}/mipmap-${dpi}`;
  mkdirSync(d, { recursive: true });
  await sharp({ create: { width: 432, height: 432, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fg, gravity: "center" }]).png().toFile(`${d}/ic_launcher_foreground.png`);
}
// Fond adaptatif : couleur accent #FF6B2C
writeFileSync(`${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#FF6B2C</color></resources>\n`);
console.log("icons ok");
