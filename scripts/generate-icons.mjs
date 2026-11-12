// Génère les icônes PWA dans public/ à partir de assets/icon.svg (fond transparent).
// Usage : npm run icons
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const markSvg = await readFile(path.join(root, "assets", "icon.svg"));

const BG = "#0b0d12";
const S = 512;

const bgSvg = (rx) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${rx}" fill="${BG}"/></svg>`
  );

async function render(size, rx, out) {
  const bg = await sharp(bgSvg(rx)).resize(size, size).png().toBuffer();
  const mark = await sharp(markSvg)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp(bg)
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(path.join(root, "public", out));
  console.log(`public/${out} (${size}x${size})`);
}

await mkdir(path.join(root, "public"), { recursive: true });

// Icônes "any" : coins arrondis, transparence autour.
await render(192, 42, "icon-192.png");
await render(512, 112, "icon-512.png");
// Maskable : fond plein, logo dans la zone sûre (déjà le cas, ~72% de la taille).
await render(512, 0, "icon-maskable-512.png");
// iOS : carré plein opaque, iOS applique son propre masque arrondi.
await render(180, 0, "apple-touch-icon.png");

// Favicon bonus (réutilise l'icône 192).
const favicon = await readFile(path.join(root, "public", "icon-192.png"));
await writeFile(path.join(root, "public", "favicon.png"), favicon);
console.log("public/favicon.png");
