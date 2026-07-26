// Build a 16:9 table plate from the isolated hero-table render.
// The source is a square PNG of ONE table on a black surround (no room, no painted
// seats). We find the table's true bounds, then centre it on a 1920x1080 canvas in
// the app's own background colour so the black surround blends away.
//
// Run from frontend-table/:  node scripts/make-hero-plate.mjs
import sharp from 'sharp';

const SRC = '../ChatGPT Image Jul 25, 2026, 10_44_56 PM.png';
// PNG with a real alpha channel, NOT a JPEG on a flat fill: a flat fill only matches
// the page background by luck, and JPEG ringing around the table shows up as a visible
// rectangle. Keying the black surround to transparent lets the page background (incl.
// the casino backdrop) show through cleanly at any size.
const OUT = 'public/table/hero-table-16x9.png';
// The table is a PORTRAIT oval (long axis vertical, ~0.91:1), so it fits by HEIGHT.
// That leaves even side margins for the HUD panels — the mock's exact layout.
const FILL = 0.85;                      // leaves ~81px top and bottom for the seat tiles

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

// Table bounds = anything meaningfully brighter than the black surround.
let minx = W, maxx = 0, miny = H, maxy = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    if (data[i] + data[i + 1] + data[i + 2] < 42) continue; // near-black surround
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
}
const tw = maxx - minx + 1, th = maxy - miny + 1;
console.log(`table bounds  x[${minx}..${maxx}] y[${miny}..${maxy}]  ${tw}x${th}  ratio ${(tw / th).toFixed(2)}:1`);

const targetH = Math.round(1080 * FILL);
const scale = targetH / th;
const targetW = Math.round(tw * scale);
if (targetW > 1920) throw new Error(`scaled width ${targetW} exceeds 1920 — reduce FILL`);

// Build an alpha channel by keying the black surround. The surround is true black
// (lum ~0-5) while the darkest real pixel — the gunmetal rail — is ~30, so a low
// threshold with a short ramp separates them and keeps the neon's soft glow feathered
// instead of cutting it into a hard-edged sticker.
const cropped = await sharp(SRC).extract({ left: minx, top: miny, width: tw, height: th }).raw()
  .toBuffer({ resolveWithObject: true });
const px = cropped.data, n = tw * th;
const alpha = Buffer.alloc(n);
for (let i = 0; i < n; i++) {
  const o = i * cropped.info.channels;
  const lum = 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2];
  alpha[i] = Math.max(0, Math.min(255, Math.round(((lum - 5) / 12) * 255)));
}

const table = await sharp(await sharp(SRC)
  .extract({ left: minx, top: miny, width: tw, height: th })
  .ensureAlpha()
  .joinChannel(alpha, { raw: { width: tw, height: th, channels: 1 } })
  .png().toBuffer())
  .resize(targetW, targetH)
  .toBuffer();

await sharp({ create: { width: 1920, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: table, left: Math.round((1920 - targetW) / 2), top: Math.round((1080 - targetH) / 2) }])
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log(`placed ${targetW}x${targetH} (${(100 * targetW / 1920).toFixed(0)}% of width) -> ${OUT}`);
