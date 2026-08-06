#!/usr/bin/env node
// Guard against the failure that cost 2026-08-02/03: CLAUDE.md's BINDING design
// section described a React Three Fiber table and told every agent to "match the
// proof" in src/app/proof/ — a directory that had been deleted — while /table
// actually rendered the flat 2.5D ImageTable. The doc and the code disagreed,
// nothing complained, and "the table" meant two different things for a day.
//
// A doc alone cannot prevent that; the doc is what failed. These are the checks
// that would have caught it, and they are cheap and static.
//
//   npm run check:table

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const REPO = resolve(FRONTEND, "..");
const SRC = join(FRONTEND, "src");

const failures = [];
const fail = (check, msg) => failures.push({ check, msg });

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const rel = (p) => p.slice(FRONTEND.length + 1);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Every path CLAUDE.md points at must exist.
//
// This is the one that matters most. CLAUDE.md said the design reference was
// `frontend-table/src/app/proof/`. It wasn't there. Nothing noticed for months.
// ─────────────────────────────────────────────────────────────────────────────
{
  // Fenced code blocks are where the doc records things it DELETED, so they are
  // deliberately allowed to name paths that no longer exist. Prose is not.
  const doc = readFileSync(join(REPO, "CLAUDE.md"), "utf8").replace(/```[\s\S]*?```/g, "");
  // Only inspect paths inside backticks that look like real files/dirs: they
  // contain a slash and either end in a known extension or in a slash.
  const candidates = new Set(
    [...doc.matchAll(/`([^`\s]+)`/g)]
      .map((m) => m[1])
      .filter((s) => s.includes("/"))
      .filter((s) => /\.(tsx?|jsx?|css|go|rs|toml|mod|md|json|ts)$/.test(s) || s.endsWith("/"))
      // Skip things that are clearly not repo paths.
      .filter((s) => !s.startsWith("http") && !s.startsWith("@") && !s.includes("*")),
  );
  // A path may be written relative to the repo root, to frontend-table/, or to src/.
  const BASES = [
    REPO, FRONTEND, SRC,
    join(SRC, "features"), join(SRC, "app"),
    join(REPO, "backend-core"), join(REPO, "engine-math"),
  ];
  for (const c of candidates) {
    const bare = c.replace(/\/$/, "");
    if (BASES.some((b) => existsSync(join(b, bare)))) continue;
    fail("doc-paths", `CLAUDE.md references \`${c}\` — no such file or directory`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Exactly ONE table renderer. No render_style branch, no graphics preset.
//
// The 3D scene was unreachable behind `override="2.5d"` for months while the doc
// still called it the contract. Reintroducing any switch recreates the ambiguity.
// ─────────────────────────────────────────────────────────────────────────────
{
  const BANNED = [
    ["render_style", /\brender_style\b/],
    ["HrcRenderStyle", /\bHrcRenderStyle\b/],
    ["CinematicScene", /\bCinematicScene\b/],
    ["LiveCinematicTable", /\bLiveCinematicTable\b/],
    ["PokerSceneCanvas", /\bPokerSceneCanvas\b/],
    ["tableGraphics", /\btableGraphics\b/],
    ["CSSPokerTable", /\bCSSPokerTable\b/],
  ];
  // protocol.ts may still carry the backend's field; it just must not drive a branch.
  const ALLOW = new Set(["src/features/game/protocol.ts"]);
  for (const f of files) {
    if (ALLOW.has(rel(f))) continue;
    const body = readFileSync(f, "utf8");
    // Ignore comments — the history is deliberately documented in them.
    const code = body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    for (const [name, re] of BANNED) {
      if (re.test(code)) fail("one-renderer", `${rel(f)} still references ${name} in code`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. R3F belongs to AVATARS only — never to the table.
// ─────────────────────────────────────────────────────────────────────────────
{
  const R3F = /@react-three|from ["']three["']/;
  const AVATAR_OK = /Character3D/;
  for (const f of files) {
    if (!R3F.test(readFileSync(f, "utf8"))) continue;
    if (AVATAR_OK.test(rel(f))) continue;
    fail("r3f-scope", `${rel(f)} imports three/R3F — that is for 3D avatars only, never the table`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. framer-motion owns `transform`. A CSS transform on a motion element is
//    silently replaced the moment it animates.
//
// This put the pot cluster at cx 932 against a felt centre of 800 (half its own
// width) and hung the dealer button and burn card 22px off their anchors. Use
// the standalone `translate` property instead.
// ─────────────────────────────────────────────────────────────────────────────
{
  // KNOWN, DELIBERATE EXCEPTIONS — reported as warnings, never silently allowed.
  // A file lands here only when the surrounding geometry was demonstrably
  // calibrated against the broken rendering, so correcting the transform alone
  // MOVES the design. Fixing one of these means retuning its constants too, and
  // that is a visible change the owner has to want.
  // Empty. Seat.tsx's per-seat bet chips used to live here: BET_PUSH_PX=85 was
  // tuned against a box framer had already un-centred, so correcting the
  // transform alone would have moved every chip by (-35,-32) — half its own
  // 70x64 — onto the seat card the push exists to clear. Resolved by measuring
  // instead of reasoning: `style.transform` read `none` in the live DOM, i.e.
  // the declaration had never applied. Deleting it was a zero-pixel change and
  // the exception went with it. Add an entry here only when correcting a
  // transform would demonstrably MOVE the design.
  const KNOWN = {};
  const warnings = [];
  for (const f of files) {
    const body = readFileSync(f, "utf8");
    if (!body.includes("<motion.")) continue;
    // Scan each motion element's opening tag for a transform inside style={{...}}.
    for (const m of body.matchAll(/<motion\.\w+([\s\S]*?)>/g)) {
      const tag = m[1];
      const style = tag.match(/style=\{\{([\s\S]*?)\}\}/);
      if (style && /(^|[\s,{])transform\s*:/.test(style[1])) {
        const line = body.slice(0, m.index).split("\n").length;
        if (KNOWN[rel(f)]) { warnings.push(`${rel(f)}:${line} — ${KNOWN[rel(f)]}`); continue; }
        fail(
          "motion-transform",
          `${rel(f)}:${line} sets \`transform\` in style on a <motion.*> element — ` +
            `framer-motion overwrites it. Use the standalone \`translate\` CSS property ` +
            `(see CENTRING_TRANSLATE in ImageTable.tsx).`,
        );
      }
    }
  }
  if (warnings.length) {
    console.warn("\nKNOWN motion-transform exceptions (deliberate, not failures):");
    for (const w of warnings) console.warn(`  ! ${w}`);
    console.warn("");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. There is exactly one source of the felt box.
//
// Four components each deciding for themselves whether the Room drawer was open
// is what put the felt and its seat ring 144px apart.
// ─────────────────────────────────────────────────────────────────────────────
{
  const offenders = files.filter((f) => {
    const r = rel(f);
    if (r.endsWith("feltLayout.ts") || r.endsWith("table-constants.ts")) return false;
    const body = readFileSync(f, "utf8");
    // Spreading FELT_BOUNDS directly instead of going through useFeltStyle().
    return /\.\.\.FELT_BOUNDS/.test(body) && !body.includes("useFeltStyle");
  });
  for (const f of offenders) {
    fail("one-felt-box", `${rel(f)} spreads FELT_BOUNDS without useFeltStyle() — the felt box has exactly one source`);
  }

  // No second, VIEWPORT-derived seat ring on the table path.
  //
  // SeatHud used to fall back to computeTableLayout(window.innerWidth, …) when
  // the felt rect wasn't measured yet: a ring with a different centre and a
  // different aspect ratio (1.833 vs 1.786) than the felt it was supposed to
  // sit on. They agreed at exactly one window size. Everything on the table is
  // a percentage of the ONE measured felt rect — map through
  // seatPointFromFelt(), or render nothing until the felt has been measured.
  const RING_PATH = /^src\/(features\/(hrc|hud)|app\/table)\//;
  for (const f of files) {
    const r = rel(f);
    if (!RING_PATH.test(r)) continue;
    const body = readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/\bcomputeTableLayout\s*\(/.test(body)) {
      fail(
        "one-felt-box",
        `${r} calls computeTableLayout() — that derives a seat ring from the ` +
          `VIEWPORT, a second coordinate system beside the measured felt. Use ` +
          `seatPointFromFelt() (features/hud/feltLayout.ts) instead.`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. A table of ANY size must spread its seats around the whole ring.
//
// Seat count is not a constant — the operator picks it per table in
// PrivateTableSetup (MIN_SEATS 2 … MAX_SEATS 10, default 6), so all nine counts
// are reachable in production.
//
// TABLE_SEATS is a TEN-position hand-tuned ring. Taking its first N entries for
// a smaller table walks 0,1,2,3,4,5 = hero-bottom, bottom-left, left-bottom,
// left-top, top-left, top-centre — the entire left and bottom of the felt with
// the whole right half bare. A 6-max table shipped exactly that way: six "SIT
// HERE" cards bunched down the left side. ?demo=1 is a 10-max fixture, so it
// cannot show this class of bug at all — which is precisely how it reached
// production.
//
// This evaluates the REAL seatRingIndex from table-constants.ts against the
// REAL TABLE_SEATS coordinates, so editing either one re-runs the proof.
// ─────────────────────────────────────────────────────────────────────────────
{
  const src = readFileSync(join(SRC, "features/hrc/lib/table-constants.ts"), "utf8");

  const seatsBlock = src.match(/export const TABLE_SEATS\s*=\s*\[([\s\S]*?)\n\];/);
  const fnBlock = src.match(/export function seatRingIndex\s*\(([\s\S]*?)\n\}/);
  if (!seatsBlock || !fnBlock) {
    fail("seat-ring-spread", "could not find TABLE_SEATS / seatRingIndex in table-constants.ts — this check must be updated with them");
  } else {
    const xs = [...seatsBlock[1].matchAll(/x:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
    // Strip TS annotations so the real function body runs as JS.
    const js = ("function seatRingIndex(" + fnBlock[1] + "\n}")
      .replace(/:\s*number/g, "")
      .replace(/TABLE_SEATS\.length/g, String(xs.length));
    let seatRingIndex;
    try {
      seatRingIndex = new Function(`${js}; return seatRingIndex;`)();
    } catch (e) {
      fail("seat-ring-spread", `seatRingIndex could not be evaluated: ${e.message}`);
    }
    if (seatRingIndex) {
      for (let n = 2; n <= xs.length; n++) {
        const ids = Array.from({ length: n }, (_, v) => seatRingIndex(v, n));
        if (new Set(ids).size !== ids.length) {
          fail("seat-ring-spread", `${n} seats map to duplicate ring positions [${ids}] — two players would share a chair`);
          continue;
        }
        if (ids[0] !== 0) {
          fail("seat-ring-spread", `${n} seats put the hero at ring position ${ids[0]}, not 0 (bottom centre)`);
        }
        // Once there are four or more seats, both halves of the felt must be used.
        if (n >= 4) {
          const left = ids.filter((i) => xs[i] < 35).length;
          const right = ids.filter((i) => xs[i] > 65).length;
          if (left === 0 || right === 0) {
            fail(
              "seat-ring-spread",
              `${n} seats occupy ring positions [${ids}] — ${left} on the left, ${right} on the right. ` +
                `They bunch on one side of the felt instead of walking the ring.`,
            );
          }
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. `?demo=1` may substitute DATA. It may never change LAYOUT or VISIBILITY.
//
// This is the check that would have caught eight days of damage on day one.
// Every bug that survived was one `!demo` hid, in three separate places, all the
// same shape:
//
//   TableHud.tsx    {!demo && (<the 13-panel left column>)}
//   feltLayout.ts   insetLeft = !demo && roomPanelOpen ? 288 : 0
//   TableHud.tsx    demo ? "items-center" : "items-end pr-2"
//
// Each made ?demo=1 render a DIFFERENT LAYOUT from /table, so every screenshot
// taken against ?demo=1 "confirmed" a table the owner was never looking at. The
// felt sat at centre 800 in demo and 944 on the real page and nothing complained.
//
// Data substitution is fine — that is what a preview IS. Swapping DEMO_SNAPSHOT
// for the live snapshot, faking actionRequired, stubbing sendAction: all fine.
// The moment `demo` reaches a className, a style object, or a `return null`
// guard, the two pages stop being the same screen and the preview stops being
// evidence.
// ─────────────────────────────────────────────────────────────────────────────
{
  // KNOWN, DELIBERATE EXCEPTIONS — reported as warnings, never silently allowed.
  // Both are visibility decisions FORCED by the data substitution, not layout
  // drift: in demo, HrcTable owns the whole table from DEMO_SNAPSHOT.
  const KNOWN_DEMO = {
    "src/features/hud/SeatHud.tsx":
      "`demo ? [] : …` — HrcTable draws every seat from DEMO_SNAPSHOT, which " +
      "SeatHud never sees, so it would treat all of them as empty and stamp a " +
      "'SIT HERE' card on top of each demo avatar. Rendering none is required " +
      "BY the data substitution, not a layout difference.",
    "src/features/hud/TableEmptyState.tsx":
      "`iAmSeated || demo` — the demo felt is already fully populated, so the " +
      "'take a seat' overlay has nothing to offer and no matchId to sit into.",
  };
  // Only the table path. /tournaments and /marketplace have their own unrelated
  // `demo` flags for offline fixtures; they are not this screen.
  const TABLE_PATH = /^src\/(features\/(hrc|hud|game)|app\/table)\//;
  const warnings = [];
  for (const f of files) {
    const r = rel(f);
    if (!TABLE_PATH.test(r)) continue;
    const body = readFileSync(f, "utf8");
    if (!/\bdemo\b/.test(body)) continue;

    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Comments explain these bugs at length — don't flag the explanations.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (!/\bdemo\b/.test(line)) continue;

      const inClassName = /className=\{[^}]*\bdemo\b/.test(line) || /className="[^"]*\$\{[^}]*\bdemo\b/.test(line);
      const inStyle = /style=\{\{[^}]*\bdemo\b/.test(line);
      const inNullGuard = /\bdemo\b[^\n]*\breturn null\b/.test(line);
      if (!inClassName && !inStyle && !inNullGuard) continue;

      const why = inClassName ? "a className" : inStyle ? "a style object" : "a `return null` guard";
      if (KNOWN_DEMO[r]) { warnings.push(`${r}:${i + 1} — ${KNOWN_DEMO[r]}`); continue; }
      fail(
        "demo-is-data-only",
        `${r}:${i + 1} branches on \`demo\` inside ${why} — ?demo=1 may substitute ` +
          `DATA, never LAYOUT or VISIBILITY. Otherwise the preview and /table are ` +
          `different screens and no screenshot of one proves anything about the other.`,
      );
    }
  }
  if (warnings.length) {
    console.warn("\nKNOWN demo-branch exceptions (forced by the data substitution, not layout):");
    for (const w of warnings) console.warn(`  ! ${w}`);
    console.warn("");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Legal / marketing links must never point at the operator console.
//
// /lobby's footer had About Us, Terms and Privacy all linking to `/hub` — the
// Command Center, a generated page of raw RPC forms. A player clicking
// "Privacy" landed on an operator tool, which is indefensible for a
// compliance-facing link. The copy lives in LegalDialog (there are no /terms or
// /privacy routes), which is what the landing footer already uses.
// ─────────────────────────────────────────────────────────────────────────────
{
  // /hub is OPS ONLY. Operator surfaces may link to it; player surfaces may not.
  //
  // It was reachable from ~24 player pages as "← Command Center", which made a
  // generated wall of RPC forms the app's de-facto home — and /lobby's footer
  // sent About Us, Terms and Privacy there, so a player clicking "Privacy"
  // landed on an operator tool. Player pages now go to /dashboard, and legal
  // copy opens LegalDialog (the component the landing footer already used).
  const OPS_SURFACE = /^src\/(app\/(hub|admin)|features\/(admin|clubs\/owner|commands)\/)/;
  for (const f of files) {
    const r = rel(f);
    if (OPS_SURFACE.test(r)) continue;
    const body = readFileSync(f, "utf8");
    for (const m of body.matchAll(/href=["']\/hub["']/g)) {
      const line = body.slice(0, m.index).split("\n").length;
      fail(
        "hub-is-ops-only",
        `${r}:${line} links a PLAYER surface to /hub (the operator console). ` +
          `Send players to /dashboard; legal copy opens LegalDialog; club creation is /clubs/new.`,
      );
    }
  }
}

// ─── 9. panel-tokens ─────────────────────────────────────────────────────────
// The app had ONE panel material for months — a single string imported 126
// times — so a KPI tile, a chart card, a data table and a modal all carried the
// same weight and nothing led the eye. That is the bulk of the gap against the
// reference comps, and no check could see it because every design contract this
// repo has had was a colour-and-font spec.
//
// A surface is M1/M2/M3/M4 (CLAUDE.md > COMPOSITION). This catches a hand-rolled
// panel: a rounded container painting --surface itself instead of composing
// PLATE / PANEL / RAISED / WELL.
{
  // KNOWN is for surfaces where composing the token would MOVE a design the
  // owner has ruled out of this restyle — not for silencing noise. The Command
  // Center (Category H, screens 82–121) is excluded by the owner's instruction
  // ("I already have a command center, and I like it"), so its two command
  // cards keep the flat white/[0.06] hairline instead of gaining the gold one.
  const KNOWN_PANEL = {
    "src/features/commands/CommandCenter.tsx":
      "Command Center is out of scope for the restyle by the owner's instruction; PANEL's gold hairline would visibly change it.",
  };
  const SURFACE_HEX = /bg-\[#(262d38|313a46)\]/;
  const warnings = [];
  for (const f of files) {
    if (!/\.tsx$/.test(f)) continue;
    const r = rel(f);
    if (/features\/ui\/tokens|features\/(hrc|table|hud)\//.test(r)) continue;
    const code = readFileSync(f, "utf8");
    code.split("\n").forEach((line, i) => {
      if (!SURFACE_HEX.test(line)) return;
      if (!/rounded/.test(line)) return;
      if (/GLASS_PANEL|PANEL|RAISED|WELL|PLATE/.test(line)) return;
      if (KNOWN_PANEL[r]) { warnings.push(`${r}:${i + 1} — ${KNOWN_PANEL[r]}`); return; }
      fail("panel-tokens", `${r}:${i + 1} paints a panel surface by hand — compose PANEL/RAISED/WELL from tokens.ts`);
    });
  }
  if (warnings.length) {
    console.warn("\nKNOWN panel-tokens exceptions (owner-excluded surfaces):");
    for (const w of warnings) console.warn(`  ! ${w}`);
    console.warn("");
  }
}

// ─── 10. type-scale ───────────────────────────────────────────────────────────
// Everything was ~35% smaller than the comps: KPI values 30px against 44, page
// titles 18 against 34. It drifted because each screen picked its own size.
{
  const RAW = /text-\[(\d+(?:\.\d+)?)px\]/g;
  const ALLOW = /features\/ui\/(tokens|console|icons)|features\/(hrc|table|hud)\//;
  for (const f of files) {
    if (!/\.tsx$/.test(f)) continue;
    const r = rel(f);
    if (ALLOW.test(r)) continue;
    const code = readFileSync(f, "utf8");
    code.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(RAW)) {
        // Small type is legitimately per-screen. The drift that mattered was
        // HEADINGS silently shrinking.
        if (parseFloat(m[1]) < 24) continue;
        fail("type-scale", `${r}:${i + 1} sets text-[${m[1]}px] directly — headings come from TEXT_KPI / PAGE_TITLE / PANEL_TITLE`);
      }
    });
  }
}

// ─── 11. no-emoji-chrome ─────────────────────────────────────────────────────
// The owner nav shipped `▦ ▤ ♛ ☰ ♦ 📣 📊 ▧ ⚙`. Emoji render in the vendor's own
// palette, so those two were the only saturated non-brand colour on screen and
// could not be tinted. Icons are monochrome SVG in features/ui/icons.tsx.
//
// SCOPE: NAVIGATION constants only, and that boundary is deliberate. A first cut
// flagged every `icon:`/`label:` line in src and produced three false positives
// on its first run — the taunt bar (`sound/library.ts`, where the emoji IS the
// message a player sends), the rewards category icons, and the Command Center's
// category map. Emoji as player content is not chrome. What is chrome is a nav
// item list, so the check tracks the enclosing `const NAME` and only inspects
// blocks whose name reads as navigation.
{
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const NAV_CONST = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)/;
  const IS_NAV = /NAV|MENU|TABS?$|SECTIONS?$|LINKS?$|ROUTES?$|SIDEBAR/i;
  for (const f of files) {
    if (!/\.(tsx|ts)$/.test(f)) continue;
    const r = rel(f);
    if (/features\/(hrc|table|hud)\//.test(r)) continue;
    const code = readFileSync(f, "utf8");
    let holder = "";
    code.split("\n").forEach((line, i) => {
      const decl = line.match(NAV_CONST);
      if (decl) holder = decl[1];
      const inNavBlock = IS_NAV.test(holder) || /features\/nav\//.test(r);
      if (!inNavBlock) return;
      if (!/\b(icon|label)\b\s*:/i.test(line)) return;
      if (!EMOJI.test(line)) return;
      fail("no-emoji-chrome", `${r}:${i + 1} puts an emoji in the nav constant \`${holder}\` — use a stroke icon from features/ui/icons.tsx`);
    });
  }
}

// ─── 12. role-red ────────────────────────────────────────────────────────────
// `Button`'s `primary` variant WAS BTN_RED, so every primary action in the app —
// join, register, verify, create — rendered in the danger colour, and `danger`
// itself had to settle for an outline to stay distinguishable. Red is
// destructive/danger/all-in ONLY (CLAUDE.md non-negotiable 5).
{
  const uiIndex = join(SRC, "features/ui/index.tsx");
  if (existsSync(uiIndex)) {
    const m = readFileSync(uiIndex, "utf8").match(/primary:\s*(BTN_\w+)/);
    if (!m) fail("role-red", "features/ui/index.tsx no longer declares a `primary:` variant — update this check with it");
    else if (m[1] === "BTN_RED") fail("role-red", "features/ui/index.tsx maps `primary: BTN_RED` — primary is not danger (non-negotiable 5)");
  }
  const DESTRUCTIVE = /KickBan|Delete|Remove|Danger|ui\/index\.tsx/;
  // The SECOND arm exists because the first would not have caught the worst
  // instance. `BTN_RED` was never the whole defect: AppShell's active nav pill
  // painted `#ff2d3f` text over an `#e01e2b`/10 fill — "you are here", the
  // plainest hierarchy signal in the app, in the danger colour, on all 60+
  // player screens. It carried a GOLD glow already, so the change had been
  // started and abandoned. A selected/active state is never red.
  const BRAND_RED = /(?:text|bg|border|from|via|to)-\[#(?:e01e2b|ff2d3f|b3151f)\]/;
  const SELECTED = /\b(active|selected|isActive|current)\b\s*(?:\?|&&)/;
  for (const f of files) {
    if (!/\.tsx$/.test(f)) continue;
    const r = rel(f);
    if (DESTRUCTIVE.test(r) || /features\/(hrc|table|hud)\//.test(r)) continue;
    const code = readFileSync(f, "utf8");
    const lines = code.split("\n");
    lines.forEach((line, i) => {
      if (/\bBTN_RED\b/.test(line) && !/import|from ["']/.test(line)) {
        fail("role-red", `${r}:${i + 1} uses BTN_RED — red is destructive only; use BTN_GOLD unless this destroys something`);
      }
      // A brand red on the selected branch of a conditional, or on the line
      // immediately after one (the `active && (<motion.div className=…>` shape).
      if (!BRAND_RED.test(line)) return;
      const context = `${lines[i - 2] ?? ""}\n${lines[i - 1] ?? ""}\n${line}`;
      if (!SELECTED.test(context)) return;
      fail("role-red", `${r}:${i + 1} paints an ACTIVE/SELECTED state in brand red — "you are here" is gold; red means danger`);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
const byCheck = new Map();
for (const f of failures) {
  if (!byCheck.has(f.check)) byCheck.set(f.check, []);
  byCheck.get(f.check).push(f.msg);
}

if (failures.length === 0) {
  console.log(`table invariants OK — ${files.length} files checked, 12/12 checks pass`);
  process.exit(0);
}
console.error(`\ntable invariants FAILED — ${failures.length} problem(s)\n`);
for (const [check, msgs] of byCheck) {
  console.error(`  [${check}]`);
  for (const m of msgs) console.error(`    - ${m}`);
  console.error("");
}
console.error("See CLAUDE.md > DESIGN-SYSTEM. If the CODE is right, fix the doc in the same change.\n");
process.exit(1);
