import sharp from 'sharp';
const SRC = 'public/table/arena-2d.jpg'; // run from frontend-table/;
const OUT = 'public/table/arena-cyan-16x9.jpg';

// The square art wastes space top/bottom. The TABLE band (incl. painted seat
// frames + neon halo) is roughly x 40..1000, y 100..920 of the 1024 square.
const CROP = { left: 40, top: 100, width: 960, height: 820 };

const band = await sharp(SRC).extract(CROP).resize({ height: 1080 }).toBuffer();
const bw = Math.round(CROP.width * (1080 / CROP.height)); // scaled band width
const pad = Math.max(0, Math.round((1920 - bw) / 2));

await sharp({
  create: { width: 1920, height: 1080, channels: 3, background: { r: 6, g: 10, b: 16 } },
})
  .composite([{ input: band, left: pad, top: 0 }])
  .jpeg({ quality: 92 })
  .toFile(OUT);

console.log(`band ${bw}x1080  side pad ${pad}px  -> table fills ${(100 * bw / 1920).toFixed(0)}% of frame width`);
console.log('wrote', OUT);
