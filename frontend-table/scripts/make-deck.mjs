// Rasterise the HRC SVG deck to PNG so the 3D card faces can use it as a texture.
// SVG-as-WebGL-texture is inconsistent across browsers; PNG is not. Native art is
// 210x315 (2:3), rendered at 2x for crispness on the hero cards.
// Run from frontend-table/:  node scripts/make-deck.mjs
import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '/workspace/highrollersclub/client/public/cards';
const OUT = 'public/cards';
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter(f => f.endsWith('.svg'));
let n = 0;
for (const f of files) {
  const out = join(OUT, f.replace(/\.svg$/, '.png'));
  await sharp(join(SRC, f), { density: 288 }).resize(420, 630).png({ compressionLevel: 9 }).toFile(out);
  n++;
}
console.log(`rasterised ${n} cards -> ${OUT}/ at 420x630`);
