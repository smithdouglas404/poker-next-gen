import { chromium } from "playwright-core";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://127.0.0.1:3300";
const OUT = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/shots";

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", () => {});
const wait = (ms) => page.waitForTimeout(ms);
async function shot(name) { try { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("OK  " + name); } catch (e) { console.log("ERR " + name + ": " + e.message); } }
async function go(path, ms = 2600) { await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {}); await wait(ms); }
async function click(text, ms = 1500) { try { const el = page.getByText(new RegExp(text, "i")).first(); if (await el.count()) { await el.click({ timeout: 4000 }); await wait(ms); return true; } } catch {} return false; }

// ---- guest auth ----
await go("/login", 1200);
await click("Play now as guest", 2500);

// ---- A. ROUTES (33) ----
const ROUTES = [
  ["/", "01-landing"], ["/login", "02-login"], ["/hub", "03-command-center"], ["/lobby", "04-lobby-game-modes"],
  ["/clubs", "05-clubs-owner-hub"], ["/clubs/new", "06-clubs-create"], ["/clubs/revenue", "07-clubs-revenue"],
  ["/clubs/sponsorship", "08-clubs-sponsorship"], ["/clubs/invite", "09-clubs-invite"], ["/clubs/invite/system", "10-clubs-invite-system"],
  ["/tournaments", "11-tournaments"], ["/studio", "12-studio-avatar"], ["/marketplace", "13-marketplace"],
  ["/marketplace/checkout", "14-marketplace-checkout"], ["/wallet", "15-wallet"], ["/membership", "16-membership"],
  ["/membership/upgrade", "17-membership-upgrade"], ["/profile", "18-profile"], ["/profile/security", "19-profile-security"],
  ["/dashboard", "20-dashboard"], ["/provably-fair", "21-proof-of-play"], ["/loyalty", "22-loyalty"], ["/kyc", "23-kyc"],
  ["/alliances", "24-alliances"], ["/leagues", "25-leagues"], ["/clubwars", "26-clubwars"], ["/admin", "27-admin"],
  ["/capabilities", "28-capabilities"], ["/stack", "29-stack"], ["/table", "30-live-table"],
  ["/proof", "31-cinematic-table"], ["/proof?screen=club", "32-club-dashboard"],
];
for (const [p, n] of ROUTES) { await go(p, p.startsWith("/proof") || p === "/table" ? 7000 : 2600); await shot(n); }

// ---- B. TABLE OVERLAYS (8) via /table?demo=1 ----
const OVERLAYS = [
  ["Approve New Player", "34-ovl-approve"], ["Table Settings", "35-ovl-table-settings"],
  ["Global Dashboard", "36-ovl-global-dashboard"], ["Hand History", "37-ovl-hand-history-fin"],
  ["Game Paused", "38-ovl-game-paused"], ["Player Game Report", "39-ovl-player-report"],
  ["Player Kick", "40-ovl-kick-ban"], ["Breaking News", "41-ovl-breaking-news"],
];
for (const [label, name] of OVERLAYS) {
  await go("/table?demo=1", 6000);
  await click("Demo Overlays", 800);
  if (await click(label, 1600)) await shot(name); else console.log("skip " + name);
}

// ---- C. LOBBY VIEW-STATES (5) ----
const LOBBY = [
  ["Create Private Table", "42-lobby-private"], ["Create Public Game", "43-lobby-public"],
  ["Join Tournament", "44-lobby-tournament"], ["Classic Browser", "45-lobby-browser"],
  ["Enter code with table preview", "46-lobby-join-code"],
];
for (const [label, name] of LOBBY) { await go("/lobby", 2500); if (await click(label, 1800)) await shot(name); else console.log("skip " + name); }

// ---- D. PROOF-OF-PLAY TABS (3 more) ----
for (const [label, name] of [["Hand History", "48-proof-hand-history"], ["Seed Reveal", "49-proof-seed-reveal"], ["Hand Audit", "50-proof-hand-audit"]]) {
  await go("/provably-fair", 2500); if (await click(label, 1600)) await shot(name); else console.log("skip " + name);
}

// ---- E/F. CLUB-OWNER SECTIONS + STUDIO STATES (best-effort by label) ----
for (const [label, name] of [["Members", "52-clubs-members"], ["Announcements", "53-clubs-announcements"], ["Settings", "54-clubs-settings"], ["Analytics", "55-clubs-analytics"]]) {
  await go("/clubs", 2500); if (await click(label, 1600)) await shot(name); else console.log("skip " + name);
}
for (const [label, name] of [["Wardrobe", "59-studio-wardrobe"], ["Dye", "60-studio-dye"]]) {
  await go("/studio", 2500); if (await click(label, 1600)) await shot(name); else console.log("skip " + name);
}

// ---- G. MODALS (best-effort) ----
await go("/", 2000); if (await click("Contact support", 1200)) await shot("64-modal-support");
await go("/", 2000); if (await click("Recover account", 1200)) await shot("65-modal-recovery");
await go("/", 2000); if (await click("^About$", 1200)) await shot("66-modal-legal");

await browser.close();
console.log("done");
