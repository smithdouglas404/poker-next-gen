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
const byCheck = new Map();
for (const f of failures) {
  if (!byCheck.has(f.check)) byCheck.set(f.check, []);
  byCheck.get(f.check).push(f.msg);
}

if (failures.length === 0) {
  console.log(`table invariants OK — ${files.length} files checked, 6/6 checks pass`);
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
