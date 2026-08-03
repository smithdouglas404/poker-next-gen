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
  const KNOWN = {
    "src/features/hrc/components/Seat.tsx":
      "per-seat bet chips: BET_PUSH_PX=85 was tuned against the un-centred box " +
      "(framer wiped the CSS translate, so the chip's TOP-LEFT sat on the anchor). " +
      "Measured: centring alone moves every chip by exactly (-35,-32) — half the " +
      "chip's own 70x64 — onto the seat card the push exists to clear. Needs the " +
      "push retuned in the same change.",
  };
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
}

// ─────────────────────────────────────────────────────────────────────────────
const byCheck = new Map();
for (const f of failures) {
  if (!byCheck.has(f.check)) byCheck.set(f.check, []);
  byCheck.get(f.check).push(f.msg);
}

if (failures.length === 0) {
  console.log(`table invariants OK — ${files.length} files checked, 5/5 checks pass`);
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
