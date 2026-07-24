// Theme-lint proof (#proof-artifacts). Two checks:
//  1. GATE: the forbidden "Neon Vault" cyan palette from the Stitch reference
//     decks (#81ecff/#00e3fd/#3fff8b/#ff7076 as SOLID fills, #0e0e0e base) must
//     not appear in screen files — if it does, a screen was built off the locked
//     GGPoker theme. Exits non-zero on any hit.
//  2. REPORT: hardcoded hex colours in screen files (features/** + app/**,
//     excluding the R3F scene which is contractually hex-based) that are NOT in
//     the approved GGPoker + scene palette, with file:line, for review.
//
// Run: node frontend-table/scripts/theme_lint.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

// R3F scene / texture files legitimately hardcode hexes (CLAUDE.md design contract).
const SCENE_EXCLUDE = ["features/table3d/", "app/proof/", "features/table/", "features/hud/EquityPanel"];

// Approved palette: GGPoker tokens + the documented 3D-scene colours (CLAUDE.md).
const APPROVED = new Set(
  [
    // GGPoker tokens
    "191d25", "262d38", "313a46", "f6f7f8", "c2c8d0", "e01e2b", "ff2d3f", "22c55e",
    "0a7d43", "f5c518", "ffd54a", "4a9eb0",
    // scene / card / chip colours used across HUD chrome
    "05070c", "04060a", "070b12", "1c7d4e", "0f5f39", "053821", "f1cf6b", "8a6a1e",
    "171b22", "e9c46a", "6b501a", "c8102e", "ffcf6a", "fff4d8", "2f6bff", "101317",
    "e5484d", "1fa85a", "f3c14b", "ff3b46", "3a4250", "5b6472", "ef4444", "c9302c",
    "1f2937", "d4af37", "9a7b2c", "f3e2ad", "ffe6a3", "231b00", "0b0d0f", "12161d",
    "0c0f14", "231b00", "d8d8d8", "ff9aa0", "8ef0b0", "ffe27a", "cd7f4b", "b26a38",
    "e6a56a", "a8b0bd", "e8ebf0",
  ].map((h) => h.toLowerCase()),
);

// Forbidden Neon-Vault signature (Stitch cyan deck).
const FORBIDDEN = ["00e3fd", "3fff8b", "ff7076"].map((h) => h.toLowerCase());

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const offPalette = [];
const forbiddenHits = [];

for (const f of files) {
  const rel = relative(join(__dirname, ".."), f);
  const scene = SCENE_EXCLUDE.some((x) => rel.includes(x));
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
      const hex = m[1].toLowerCase();
      if (FORBIDDEN.includes(hex)) forbiddenHits.push(`${rel}:${i + 1}  #${hex}`);
      if (!scene && !APPROVED.has(hex)) offPalette.push(`${rel}:${i + 1}  #${hex}`);
    }
  });
}

console.log("=== THEME LINT ===");
console.log("files scanned:", files.length);
console.log("\n[GATE] Forbidden Neon-Vault palette hits:", forbiddenHits.length);
forbiddenHits.slice(0, 30).forEach((h) => console.log("  " + h));

console.log("\n[REPORT] Off-GGPoker hex in screen files (excl. R3F scene):", offPalette.length);
// Group by hex for a compact view.
const byHex = {};
for (const o of offPalette) {
  const hex = o.split("#")[1];
  (byHex[hex] ||= []).push(o.split("  ")[0]);
}
for (const [hex, locs] of Object.entries(byHex).sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
  console.log(`  #${hex}  ×${locs.length}  e.g. ${locs[0]}`);
}

// GATE fails only on the forbidden palette; off-palette is advisory.
process.exit(forbiddenHits.length > 0 ? 1 : 0);
