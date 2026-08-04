#!/usr/bin/env node
// npm run verify — one command that actually exercises the app.
//
// WHY THIS EXISTS
//
// A nil-pointer dereference shipped to main and SIGSEGV'd the whole Nakama
// process whenever a player left a club table. It passed `go vet`, the plugin
// build, `tsc`, `npm run build`, and a 17/17 sit-down suite. Every gate was
// green, because every gate answered "does it compile / does the code I was
// thinking about work" and none answered "does the app survive being used".
//
// The three gaps that let it through, and what this fixes:
//
//   1. No full-lifecycle test. Sitting down was tested exhaustively; standing
//      up was never exercised once. -> lifecycle-e2e.mjs
//   2. No render step. Pages were screenshotted by hand and skipped under
//      pressure — which is how an unverified table reached main. -> RENDER below
//   3. No single command. Stack setup was ~10 manual minutes, so it did not
//      get run. -> this file
//
// USAGE
//
//   npm run verify              full run (needs the local stack up)
//   npm run verify -- --static  static checks only, no stack, no browser
//
// The stack is postgres:5433 + nakama:7350 (with backend-core.so) +
// engine-math:8080. When it is down, the runtime phases are reported SKIPPED
// with the reason — never silently passed. A skip is not a pass and the summary
// says so.

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const REPO = resolve(FRONTEND, "..");
const BACKEND = join(REPO, "backend-core");
const SHOTS = process.env.VERIFY_SHOT_DIR ?? join(FRONTEND, ".verify-shots");
const STATIC_ONLY = process.argv.includes("--static");

const results = [];
const record = (phase, name, status, detail = "") => {
  results.push({ phase, name, status, detail });
  const mark = { pass: "PASS", fail: "FAIL", skip: "SKIP" }[status];
  console.log(`  ${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
};

function run(cmd, cwd, name, phase, { timeout = 900_000 } = {}) {
  try {
    execSync(cmd, { cwd, timeout, stdio: "pipe" });
    record(phase, name, "pass");
    return true;
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.toString().trim().split("\n").slice(-4).join(" | ");
    record(phase, name, "fail", out.slice(0, 300));
    return false;
  }
}

async function up(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(4000) });
    return true;
  } catch { return false; }
}

function pgUp() {
  const r = spawnSync("psql", ["-h", "127.0.0.1", "-p", "5433", "-U", "postgres", "-d", "nakama", "-tAc", "select 1"], { encoding: "utf8" });
  return r.status === 0;
}

console.log("\n━━ 1. STATIC ━━");
run("npx tsc --noEmit", FRONTEND, "frontend typecheck", "static");
run("node scripts/check-table-invariants.mjs", FRONTEND, "table invariants (7 checks)", "static");
run("go vet ./...", BACKEND, "go vet", "static");
run("go build -buildmode=plugin -trimpath -o /tmp/verify-plugin.so .", BACKEND, "nakama plugin builds", "static");

// ── runtime ─────────────────────────────────────────────────────────────────
const nakama = STATIC_ONLY ? false : await up("http://127.0.0.1:7350/");
const engine = STATIC_ONLY ? false : await up("http://127.0.0.1:8080/health");
const pg = STATIC_ONLY ? false : pgUp();
const stackUp = nakama && engine && pg;

console.log("\n━━ 2. END-TO-END (real stack) ━━");
if (!stackUp) {
  const missing = [!pg && "postgres:5433", !nakama && "nakama:7350", !engine && "engine-math:8080"].filter(Boolean).join(", ");
  const why = STATIC_ONLY ? "--static" : `stack down: ${missing}`;
  for (const n of ["seat lifecycle (join→sit→stand→settle)", "three-tier sit-down gate", "club loan settlement"]) {
    record("e2e", n, "skip", why);
  }
} else {
  // THE ONE THAT MATTERS MOST: it fails on the exact nil-deref that reached
  // production, and it asserts the SERVER IS STILL ALIVE afterwards — a panic
  // in a runtime plugin kills the process, so "assertions passed" and "the
  // server survived" are different questions.
  run("node scripts/table-sim/lifecycle-e2e.mjs", FRONTEND, "seat lifecycle (join→sit→stand→settle)", "e2e");
  run("node scripts/table-sim/guest-tiers-e2e.mjs", FRONTEND, "three-tier sit-down gate", "e2e");
  run("node scripts/table-sim/club-settlement-e2e.mjs", FRONTEND, "club loan settlement", "e2e");
}

// RENDER BEFORE BUILD, DELIBERATELY.
//
// `next build` writes the same .next directory `next dev` is serving from, so
// building first replaces the chunks under the running dev server and it starts
// throwing `Cannot find module './<id>.js'`. The symptom looks exactly like a UI
// regression — hero cards vanish, blank rectangles appear where cards should be
// — and it is not one.
//
// The first version of this very file ran build in phase 2 and the render phase
// then reported "dev server not on :3000". It killed the thing it was about to
// measure. Same trap, same day, in the tool written to prevent it.
console.log("\n━━ 3. RENDER (a screenshot nobody looks at is not verification — these ASSERT) ━━");
const dev = STATIC_ONLY ? false : await up("http://localhost:3000/table");
if (!dev) {
  record("render", "table renders and is centred", "skip", STATIC_ONLY ? "--static" : "dev server not on :3000 (npm run dev)");
} else {
  if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
  run(`VERIFY_SHOT_DIR='${SHOTS}' node scripts/verify-render.mjs`, FRONTEND, "table renders and is centred", "render");
}

console.log("\n━━ 4. BUILD (last — it clobbers the dev server's .next) ━━");
if (dev) {
  record("build", "next production build", "skip",
    "dev server is running on :3000; building would break it. Stop dev and re-run, or use `npm run build` directly.");
} else {
  run("npm run build", FRONTEND, "next production build", "build");
}

// ── summary ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => r.status === "fail");
const skipped = results.filter((r) => r.status === "skip");
const passed = results.filter((r) => r.status === "pass");

console.log(`\n━━ SUMMARY ━━`);
console.log(`  ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
if (skipped.length) {
  // A skip is NOT a pass. Saying so out loud is the point — the whole failure
  // this file addresses was treating "the checks I ran were green" as "the app
  // works".
  console.log(`\n  SKIPPED (these were NOT verified):`);
  for (const s of skipped) console.log(`    - ${s.name} — ${s.detail}`);
}
if (failed.length) {
  console.log(`\n  FAILED:`);
  for (const f of failed) console.log(`    - ${f.name} — ${f.detail}`);
  process.exit(1);
}
console.log(skipped.length ? "\n  green, but INCOMPLETE — bring the stack up for a full run\n" : "\n  all green\n");
