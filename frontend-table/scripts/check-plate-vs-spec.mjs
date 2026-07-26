// Measure each candidate table asset and check it against the WRITTEN spec instead of
// eyeballing orientation from the art. Run from frontend-table/.
import sharp from 'sharp';

// From the design team's spec (TABLE-SPEC-REVIEW §2 and §3), design canvas 1920x1080:
const SPEC = {
  outer: [1450, 660],          // outer table frame, px
  felt: [1300, 550],           // inner felt area, px
  // Seat positions, px from table centre, +y = up.
  seats: [
    [680, 0], [520, -220], [180, -320], [-180, -320], [-520, -220],
    [-680, 0], [-520, 220], [-180, 290], [180, 290], [520, 220],
  ],
};

const seatX = Math.max(...SPEC.seats.map(s => Math.abs(s[0])));
const seatY = Math.max(...SPEC.seats.map(s => Math.abs(s[1])));

console.log('SPEC');
console.log(`  outer frame  ${SPEC.outer[0]} x ${SPEC.outer[1]}  ratio ${(SPEC.outer[0] / SPEC.outer[1]).toFixed(2)}:1`);
console.log(`  felt         ${SPEC.felt[0]} x ${SPEC.felt[1]}  ratio ${(SPEC.felt[1] ? SPEC.felt[0] / SPEC.felt[1] : 0).toFixed(2)}:1`);
console.log(`  seat ring    +/-${seatX} x +/-${seatY}  ratio ${(seatX / seatY).toFixed(2)}:1`);
console.log(`  => orientation LANDSCAPE (long axis horizontal)\n`);

const CANDIDATES = [
  ['hero-table (ChatGPT render)', '../ChatGPT Image Jul 25, 2026, 10_44_56 PM.png'],
  ['HRC poker-table-felt', 'public/table/hrc-table-felt.webp'],
  ['arena-2d (cyan arena)', 'public/table/arena-2d.jpg'],
];

for (const [name, file] of CANDIDATES) {
  try {
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    let minx = W, maxx = 0, miny = H, maxy = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * C;
        if (data[i] + data[i + 1] + data[i + 2] < 42) continue;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
    const w = maxx - minx + 1, h = maxy - miny + 1;
    const r = w / h;
    const spec = SPEC.outer[0] / SPEC.outer[1];
    console.log(`${name}`);
    console.log(`  image ${W}x${H}   table bounds ${w}x${h}   ratio ${r.toFixed(2)}:1`);
    console.log(`  orientation ${r >= 1 ? 'LANDSCAPE' : 'PORTRAIT'}   vs spec ${spec.toFixed(2)}:1  ` +
      `=> ${r >= 1 ? `${(100 * (r - spec) / spec).toFixed(0)}% off` : 'WRONG ORIENTATION'}\n`);
  } catch (e) {
    console.log(`${name}\n  SKIP (${e.message})\n`);
  }
}
