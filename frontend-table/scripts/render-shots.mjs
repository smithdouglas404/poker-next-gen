import { chromium } from "playwright-core";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://127.0.0.1:3300";
const OUT = "/tmp/claude-0/-home-user-poker-next-gen/392cc787-6489-50fa-8651-c53dd904e186/scratchpad/shots";

// Every top-level route + URL-addressable sub-states. name = numbered index.
const ROUTES = [
  ["/", "01-landing"],
  ["/login", "02-login"],
  ["/hub", "03-command-center"],
  ["/lobby", "04-lobby-game-modes"],
  ["/clubs", "05-clubs-owner-hub"],
  ["/clubs/new", "06-clubs-create"],
  ["/clubs/revenue", "07-clubs-revenue"],
  ["/clubs/sponsorship", "08-clubs-sponsorship"],
  ["/clubs/invite", "09-clubs-invite"],
  ["/clubs/invite/system", "10-clubs-invite-system"],
  ["/tournaments", "11-tournaments"],
  ["/studio", "12-studio-avatar"],
  ["/marketplace", "13-marketplace"],
  ["/marketplace/checkout", "14-marketplace-checkout"],
  ["/wallet", "15-wallet"],
  ["/membership", "16-membership"],
  ["/membership/upgrade", "17-membership-upgrade"],
  ["/profile", "18-profile"],
  ["/profile/security", "19-profile-security"],
  ["/dashboard", "20-dashboard"],
  ["/provably-fair", "21-proof-of-play"],
  ["/loyalty", "22-loyalty"],
  ["/kyc", "23-kyc"],
  ["/alliances", "24-alliances"],
  ["/leagues", "25-leagues"],
  ["/clubwars", "26-clubwars"],
  ["/admin", "27-admin-console"],
  ["/capabilities", "28-capabilities"],
  ["/stack", "29-stack"],
  ["/table", "30-live-table"],
  ["/proof", "31-cinematic-table-2.5d"],
  ["/proof?screen=club", "32-club-dashboard"],
];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", () => {}); // don't let a client error abort a shot

// Authenticate as guest first so member screens aren't empty.
try {
  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  const guest = page.getByText(/Play now as guest/i);
  if (await guest.count()) {
    await guest.first().click();
    await page.waitForTimeout(2500);
    console.log("guest session established");
  }
} catch (e) {
  console.log("guest auth skipped:", e.message);
}

for (const [path, name] of ROUTES) {
  const is3d = path.startsWith("/proof") || path === "/table";
  try {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(is3d ? 7000 : 2600);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    console.log(`OK  ${name}  ${path}`);
  } catch (e) {
    console.log(`ERR ${name} ${path}: ${e.message}`);
  }
}

await browser.close();
console.log("done");
