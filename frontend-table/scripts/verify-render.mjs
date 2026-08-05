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

async function shoot(path, name, expectAvatars) {
  const p = await ctx.newPage();
  await p.goto(`http://localhost:3000${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });

  // Wait on a CONDITION, never a fixed sleep.
  //
  // This used to be waitForTimeout(13000). Run on its own that was plenty; run
  // straight after the e2e phase — which hammers Nakama and Postgres — the page
  // had not finished and the suite reported "demo table is populated -> 0
  // avatars" while the very same check passed standalone seconds later.
  //
  // A flaky check is worse than no check: it teaches you to ignore red, which
  // is precisely how a real failure gets waved through. Poll for the felt (and
  // the avatars, where they are expected) until they are actually there.
  await p
    .waitForFunction(
      (wantAvatars) => {
        const f = document.querySelector("[data-felt-surface]");
        if (!f || f.getBoundingClientRect().width < 100) return false;
        if (!wantAvatars) return true;
        return [...document.querySelectorAll("img")]
          .filter((i) => /avatars\//.test(i.getAttribute("src") || "")).length > 0;
      },
      expectAvatars,
      { timeout: 60000, polling: 500 },
    )
    .catch(() => { /* fall through — the assertions below report what is actually there */ });
  // Settle the deal springs so the shot is not mid-animation.
  await p.waitForTimeout(3000);
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
      // DID THE STYLESHEET ACTUALLY LOAD?
      //
      // Geometry assertions pass on a page with NO CSS: absolutely-positioned
      // percentages still resolve, so the felt still measured centre 800 while
      // the page rendered as white background and native grey buttons. Seven of
      // eight checks went green on a completely unstyled screen.
      //
      // The app is dark-only by design (CLAUDE.md palette: --background
      // #191d25), so a light body background means the stylesheet is missing —
      // which in dev is usually `next build` having clobbered the running dev
      // server's .next.
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
  await p.addStyleTag({ content: "nextjs-portal,[data-next-badge-root],[data-nextjs-toast]{display:none!important}" }).catch(() => {});
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await p.close();
  return m;
}

const live = await shoot("/table", "verify-table-live", false);
const demo = await shoot("/table?demo=1", "verify-table-demo", true);

// CSS FIRST. Every assertion below is about geometry or text, and all of them
// pass on an unstyled page — so check the stylesheet loaded before believing any
// of them.
function isDark(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(rgb || "");
  if (!m) return false;
  // TRANSPARENT IS NOT DARK. `rgba(0,0,0,0)` is the browser default — no
  // background painted at all — and a naive luminance test scores it 0 and
  // calls it dark. That is exactly the unstyled page this check exists to
  // catch, so the alpha test has to come first.
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (alpha < 0.9) return false;
  const [r, g, b] = [+m[1], +m[2], +m[3]];
  return (r * 0.299 + g * 0.587 + b * 0.114) < 90; // the app is dark-only
}
check(isDark(live.bodyBg), "/table stylesheet loaded (dark theme applied)", live.bodyBg);
check(isDark(demo.bodyBg), "/table?demo=1 stylesheet loaded (dark theme applied)", demo.bodyBg);

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

// ── the other screens ───────────────────────────────────────────────────────
//
// The table was the only page anything checked, which is how a landing page
// with a "play here" CTA and a lobby reachable without a login both survived.
// These are cheap: does the route render at all, and does it still obey the
// rules the owner has had to repeat.
async function page(path, name) {
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
  const res = await p.goto(`http://localhost:3000${path}`, { waitUntil: "domcontentloaded", timeout: 120000 })
    .catch(() => null);
  await p.waitForTimeout(6000);
  const m = await p.evaluate(() => {
    const t = document.body.innerText;
    return {
      text: t,
      chars: t.replace(/\s+/g, "").length,
      // A page that renders its error state is not a page that rendered.
      broken: /Application error|COULDN'T LOAD|Internal Server Error|This page could not be found/i.test(t),
    };
  });
  await p.addStyleTag({ content: "nextjs-portal,[data-next-badge-root],[data-nextjs-toast]{display:none!important}" }).catch(() => {});
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await p.close();
  return { status: res?.status() ?? 0, ...m, errors };
}

const landing = await page("/", "verify-landing");
check(landing.status === 200 && !landing.broken && landing.chars > 400, "landing page renders",
  `${landing.status}, ${landing.chars} chars`);
// CLAUDE.md > "Landing page — never a place to play". This shipped twice: an
// "Enter a table" CTA straight to /table, and a /hub operator link.
check(!/\/table/.test(landing.text) && !/Enter a table|Deal me in/i.test(landing.text),
  "landing page offers NO way to join or play");
check(!/Command Center/i.test(landing.text), "landing page does not link the operator hub");

const lobby = await page("/lobby", "verify-lobby");
// /lobby is behind auth — creating a game always requires a login. Either it
// renders the builder for a signed-in user or it bounces; a 500 is neither.
check(lobby.status !== 500 && !/Internal Server Error/i.test(lobby.text), "lobby does not 500",
  `${lobby.status}`);

const clubs = await page("/clubs", "verify-owner-hub");
check(clubs.status === 200, "owner hub route responds", `${clubs.status}`);

const tourneys = await page("/tournaments", "verify-tournaments");
check(tourneys.status === 200 && !tourneys.broken, "tournaments page renders",
  `${tourneys.status}, ${tourneys.chars} chars`);

console.log(`    shots -> ${OUT}`);
await b.close();
process.exit(fails.length ? 1 : 0);
