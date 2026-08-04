// The render half of `npm run verify`.
//
// A screenshot nobody looks at is not verification, so this ASSERTS numbers off
// the live DOM and only saves the image as evidence. Every assertion here is a
// bug that actually shipped:
//
//   felt centre 800   — /table sat at 944 for days because feltLayout reserved
//                       288px for a drawer that no longer mounted, and the
//                       condition carried `!demo` so the preview was exempt.
//   demo == live      — three separate `!demo` branches made ?demo=1 render a
//                       DIFFERENT LAYOUT, so every screenshot taken against it
//                       "confirmed" a table the owner was never looking at.
//   no phantom seats  — /table with no match drew six "SIT HERE" cards at a
//                       table that did not exist, each a dead button.
//   no left column    — thirteen panels used to cover the left of the felt.
//
// Needs the dev server on :3000. Exits non-zero on any mismatch.

const pw = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
const OUT = process.env.VERIFY_SHOT_DIR ?? "/tmp";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const fails = [];
const check = (ok, label, detail = "") => {
  console.log(`    ${ok ? "ok" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) fails.push(label);
};

const b = await pw.chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
});
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
// The age gate mounts late and blocks everything behind a dim overlay — seeding
// it is what turns "a screenshot with a black background" into a real render.
await ctx.addInitScript(() => {
  try { localStorage.setItem("hrc.age.ok", "1"); } catch { /* ignore */ }
});

async function shoot(path, name) {
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3000${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(13000);
  const m = await p.evaluate(() => {
    const t = document.body.innerText;
    const f = document.querySelector("[data-felt-surface]");
    const r = f && f.getBoundingClientRect();
    return {
      feltCentreX: r ? Math.round(r.x + r.width / 2) : null,
      feltWidth: r ? Math.round(r.width) : null,
      sitHere: (t.match(/SIT HERE/gi) || []).length,
      avatars: [...document.querySelectorAll("img")].filter((i) => /avatars\//.test(i.getAttribute("src") || "")).length,
      leftColumn: /ROOM CONTROL|SIDEBET|Four-color deck/i.test(t),
      addBots: /ADD BOTS|deal me in/i.test(t),
    };
  });
  await p.addStyleTag({ content: "nextjs-portal,[data-next-badge-root],[data-nextjs-toast]{display:none!important}" }).catch(() => {});
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await p.close();
  return m;
}

const live = await shoot("/table", "verify-table-live");
const demo = await shoot("/table?demo=1", "verify-table-demo");

// 800 is dead centre of a 1600px viewport. Hard-coded on purpose: this is the
// number that was wrong, and a computed expectation would have been wrong too.
check(live.feltCentreX === 800, "/table felt is centred", `${live.feltCentreX}`);
check(demo.feltCentreX === 800, "/table?demo=1 felt is centred", `${demo.feltCentreX}`);
check(live.feltCentreX === demo.feltCentreX, "demo and live agree on the felt box", `${live.feltCentreX} vs ${demo.feltCentreX}`);
check(live.feltWidth === demo.feltWidth, "demo and live agree on the felt width", `${live.feltWidth} vs ${demo.feltWidth}`);
check(!live.leftColumn && !demo.leftColumn, "no panel column over the felt");
check(!live.addBots, "no create-a-game control on the felt");
// No snapshot means no seats — DEFAULT_MAX_SEATS is the lobby form's starting
// value, not a property of any table, and six dead buy-in buttons is worse than
// an empty felt.
check(live.sitHere === 0, "no phantom seats at a table that does not exist", `${live.sitHere}`);
check(demo.avatars > 0, "demo table is populated", `${demo.avatars} avatars`);

console.log(`    shots -> ${OUT}`);
await b.close();
process.exit(fails.length ? 1 : 0);
