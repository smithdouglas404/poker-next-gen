import { chromium } from "playwright-core";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://127.0.0.1:3300";
const OUT = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/shots";
// The e2e owner device: verified, platinum, owns clubs — so the owner hub renders.
const OWNER_DEVICE = "e2e-owner-aaaaaaaa1111";

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Seed the device id BEFORE any script runs so device-auth logs in as the owner.
await ctx.addInitScript((id) => { try { window.localStorage.setItem("png-device-id", id); } catch {} }, OWNER_DEVICE);
const page = await ctx.newPage();
page.on("pageerror", () => {});
const wait = (ms) => page.waitForTimeout(ms);
async function shot(n) { try { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("OK  " + n); } catch (e) { console.log("ERR " + n + ": " + e.message); } }
async function go(p, ms = 2800) { await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {}); await wait(ms); }
async function click(t, ms = 1800) { try { const el = page.getByText(new RegExp(t, "i")).first(); if (await el.count()) { await el.click({ timeout: 4000 }); await wait(ms); return true; } } catch {} return false; }

// log in as owner (device auth)
await go("/login", 1200);
await click("Play now as guest", 3000);
console.log("owner session:", page.url());

// Owner hub + each section (labels from OwnerShell NAV)
const SECTIONS = [
  ["Club Overview", "51-clubs-overview"],
  ["Live Tables", "51b-clubs-live-tables"],
  ["Tournament Center", "51c-clubs-tourn-center"],
  ["Member Registry", "52-clubs-members"],
  ["Announcements", "53-clubs-announcements"],
  ["Member Analytics", "55-clubs-analytics"],
  ["Revenue Reports", "07b-clubs-revenue"],
  ["Global Settings", "54-clubs-settings"],
];
await go("/clubs", 3000);
await shot("05b-clubs-owner-hub-authed");
for (const [label, name] of SECTIONS) {
  await go("/clubs", 2600);
  if (await click(label, 2000)) await shot(name); else console.log("skip " + name);
}

// public game (owner can sponsor)
await go("/lobby", 2600);
if (await click("Create Public Game", 2000)) await shot("43-lobby-public");

await browser.close();
console.log("done");
