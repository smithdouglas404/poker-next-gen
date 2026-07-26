// Plate from the HRC top-down table (client/public/images/poker-table-felt.webp).
// This one is already a clean full-bleed table on a dark surround, so there is nothing
// to crop — it just needs fitting into 1920x1080 with margin for the seat tiles.
// Run from frontend-table/:  node scripts/make-hrc-plate.mjs
import sharp from 'sharp';

const SRC = 'public/table/hrc-table-felt.webp';
const OUT = 'public/table/hrc-table-16x9.png';
const FILL = 0.88;   // of frame WIDTH — this table is landscape (1.83:1)

const meta = await sharp(SRC).metadata();
const targetW = Math.round(1920 * FILL);
const targetH = Math.round(meta.height * (targetW / meta.width));
if (targetH > 1080) throw new Error(`scaled height ${targetH} exceeds 1080 — reduce FILL`);

const table = await sharp(SRC).resize(targetW, targetH).png().toBuffer();

await sharp({ create: { width: 1920, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: table, left: Math.round((1920 - targetW) / 2), top: Math.round((1080 - targetH) / 2) }])
  .png({ compressionLevel: 9 })
  .toFile(OUT);

const left = Math.round((1920 - targetW) / 2), top = Math.round((1080 - targetH) / 2);
console.log(`source ${meta.width}x${meta.height} (${(meta.width / meta.height).toFixed(2)}:1 landscape)`);
console.log(`placed ${targetW}x${targetH} at (${left},${top}) -> ${OUT}`);

// HRC's own seat map is % of the table div, so convert it to plate pixels and report
// the ring's real extent — that is what the 3D ellipse has to reproduce.
const SEATS = [
  [50, 93], [14, 82], [0, 50], [10, 16], [30, 2],
  [50, -2], [70, 2], [90, 16], [100, 50], [86, 82],
];
const px = SEATS.map(([x, y]) => [left + (x / 100) * targetW, top + (y / 100) * targetH]);
const xs = px.map(p => p[0]), ys = px.map(p => p[1]);
const hw = (Math.max(...xs) - Math.min(...xs)) / 2, hh = (Math.max(...ys) - Math.min(...ys)) / 2;
console.log(`HRC seat ring  half ${hw.toFixed(0)} x ${hh.toFixed(0)} px  ratio ${(hw / hh).toFixed(2)}:1  (spec 2.13:1)`);
console.log(`  ring centre  (${((Math.max(...xs) + Math.min(...xs)) / 2).toFixed(0)}, ${((Math.max(...ys) + Math.min(...ys)) / 2).toFixed(0)})  frame centre (960, 540)`);
