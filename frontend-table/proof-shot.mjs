import { chromium } from "playwright-core";

const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://localhost:3300/proof";
const OUT = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad";

const shots = [
  { url: `${BASE}?screen=table&mode=2d`, file: `${OUT}/proof-table-2d.png`, wait: 9000 },
  { url: `${BASE}?screen=table&mode=3d`, file: `${OUT}/proof-table-3d.png`, wait: 11000 },
  { url: `${BASE}?screen=club`, file: `${OUT}/proof-club.png`, wait: 4000 },
];

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--ignore-gpu-blocklist",
  ],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
page.on("console", (m) => { const t = m.text(); if (m.type() === "error") console.log("  [page-error]", t.slice(0, 200)); });
page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 300)));

const HIDE_DEV = `nextjs-portal,[data-next-badge-root],[data-nextjs-toast],#__next-build-watcher,#__next-prerender-indicator{display:none!important;visibility:hidden!important}`;

for (const s of shots) {
  console.log("→", s.url);
  await page.goto(s.url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.log("  goto:", String(e).slice(0, 120)));
  await page.addStyleTag({ content: HIDE_DEV }).catch(() => {});
  await page.waitForTimeout(s.wait);
  await page.screenshot({ path: s.file });
  console.log("  saved", s.file);
}

await browser.close();
console.log("DONE");
