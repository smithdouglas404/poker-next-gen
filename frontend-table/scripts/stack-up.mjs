#!/usr/bin/env node
// Bring the local stack up. Idempotent — safe to run when it is already up.
//
// WHY THIS EXISTS
//
// `npm run verify` was sold as "one command". It was not: it required Postgres,
// Nakama-with-the-plugin and engine-math to already be running, and standing
// those up was ~10 minutes of hand-typed initdb / migrate / schema / plugin
// build / process launching that lived only in CLAUDE.md prose. A verification
// tool nobody can start is a verification tool nobody runs, which is how an
// unverified table and a server-killing panic both reached main.
//
//   node scripts/stack-up.mjs          start whatever is missing
//   node scripts/stack-up.mjs --status report only, change nothing
//
// It starts exactly three things and checks each one afterwards:
//   postgres      127.0.0.1:5433   (the port every harness expects)
//   engine-math   127.0.0.1:8080
//   nakama        127.0.0.1:7350   with backend-core.so loaded
//
// Anything it cannot do — a missing Nakama binary, a missing Postgres — is
// reported with the exact command to fix it, never silently skipped.
//
// Deliberately NOT docker compose. Docker would be the better answer on a
// developer machine, but the sandbox this was written in has the docker CLI and
// no daemon, so a compose path could not be run even once here. Shipping an
// unrunnable script is the failure this file exists to stop. See CLAUDE.md >
// Railway vs Docker for the drift picture if you wire compose up later.

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const REPO = resolve(FRONTEND, "..");
const BACKEND = join(REPO, "backend-core");
const STATUS_ONLY = process.argv.includes("--status");

const PGBIN = process.env.PGBIN ?? "/usr/lib/postgresql/16/bin";
const PGDATA = process.env.PGDATA ?? "/var/lib/pgdata";
const NAKAMA = process.env.NAKAMA_BIN ?? "/opt/nakama/nakama";
const MODULES = process.env.NAKAMA_MODULES ?? "/tmp/modules";
const DB = "postgres:postgres@127.0.0.1:5433/nakama";
const LOGS = "/tmp";

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
const say = (s) => console.log(s);

async function httpUp(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(3000) }); return true; } catch { return false; }
}

// Nakama answers HTTP on :7350 BEFORE its runtime plugin has finished
// registering, so "the socket is open" is not "the server is ready". A cold
// `npm run verify` proved it: stack-up reported nakama up, and the lifecycle
// test then died on its first RPC while passing standalone seconds later.
//
// This asks whether a plugin-registered RPC exists. Unregistered => 404.
// Registered => 401 (it needs auth), which is exactly the answer we want: the
// runtime is loaded. No credentials required to ask.
async function nakamaRuntimeReady() {
  try {
    const r = await fetch("http://127.0.0.1:7350/v2/rpc/guest_approvals_pending?http_key=defaulthttpkey",
      { signal: AbortSignal.timeout(3000) });
    return r.status !== 404;
  } catch { return false; }
}
function pgUp() {
  try { sh(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "select 1"`); return true; } catch { return false; }
}
// Wait for a condition instead of sleeping a guessed duration — the same
// mistake that made the render check flaky.
async function waitFor(fn, seconds, label) {
  for (let i = 0; i < seconds; i++) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  say(`  ! ${label} did not come up within ${seconds}s`);
  return false;
}
function detach(cmd, args, logfile) {
  const out = openSync(logfile, "a");
  const c = spawn(cmd, args, { detached: true, stdio: ["ignore", out, out] });
  c.unref();
}

const missing = [];

// ── postgres ────────────────────────────────────────────────────────────────
if (pgUp()) {
  say("ok   postgres        already up on 5433");
} else if (STATUS_ONLY) {
  say("DOWN postgres        5433");
} else if (!existsSync(join(PGBIN, "postgres"))) {
  say(`FAIL postgres        no server binary at ${PGBIN}`);
  missing.push("install postgresql-16, or set PGBIN");
} else {
  if (!existsSync(join(PGDATA, "PG_VERSION"))) {
    say("     postgres        initdb (first run)");
    try {
      sh(`id postgres >/dev/null 2>&1 || useradd -m postgres`, { shell: "/bin/bash" });
      sh(`mkdir -p ${PGDATA} /var/run/postgresql && chown -R postgres:postgres ${PGDATA} /var/run/postgresql`);
      sh(`su postgres -c "${PGBIN}/initdb -D ${PGDATA} -U postgres --auth=trust"`);
    } catch (e) { say(`FAIL postgres        initdb: ${String(e.message).slice(0, 160)}`); missing.push("initdb failed"); }
  }
  try {
    sh(`su postgres -c "${PGBIN}/pg_ctl -D ${PGDATA} -l ${LOGS}/pg.log -o '-c listen_addresses=127.0.0.1 -p 5433' start"`);
  } catch { /* may already be running on another port; the check below decides */ }
  await waitFor(async () => { try { sh(`psql -h 127.0.0.1 -p 5433 -U postgres -tAc "select 1"`); return true; } catch { return false; } }, 20, "postgres");
  // Database + Nakama's own migrations + the app schema. All idempotent.
  try { sh(`psql -h 127.0.0.1 -p 5433 -U postgres -tAc "CREATE DATABASE nakama"`); } catch { /* exists */ }
  if (existsSync(NAKAMA)) { try { sh(`${NAKAMA} migrate up --database.address ${DB}`); } catch (e) { say(`  ! nakama migrate: ${String(e.message).slice(0, 120)}`); } }
  try { sh(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -f ${join(BACKEND, "store/schema.sql")}`); } catch (e) { say(`  ! schema.sql: ${String(e.message).slice(0, 120)}`); }
  say(pgUp() ? "ok   postgres        started on 5433" : "FAIL postgres        did not start");
}

// ── engine-math ─────────────────────────────────────────────────────────────
const enginePath = join(REPO, "engine-math/target/release/engine-math-server");
if (await httpUp("http://127.0.0.1:8080/health")) {
  say("ok   engine-math     already up on 8080");
} else if (STATUS_ONLY) {
  say("DOWN engine-math     8080");
} else if (!existsSync(enginePath)) {
  say("FAIL engine-math     not built");
  missing.push("cd engine-math && cargo build --release");
} else {
  detach(enginePath, [], `${LOGS}/engine.log`);
  const ok = await waitFor(() => httpUp("http://127.0.0.1:8080/health"), 30, "engine-math");
  say(ok ? "ok   engine-math     started on 8080" : "FAIL engine-math     did not start");
}

// ── nakama + the plugin ─────────────────────────────────────────────────────
if (await nakamaRuntimeReady()) {
  say("ok   nakama          already up on 7350 (runtime loaded)");
} else if (STATUS_ONLY) {
  say("DOWN nakama          7350");
} else if (!existsSync(NAKAMA)) {
  say(`FAIL nakama          no binary at ${NAKAMA}`);
  // 3.31.0 is not a preference: the plugin only loads into a server built from
  // the same nakama-common (CLAUDE.md golden rule 1).
  missing.push("curl -sSL https://github.com/heroiclabs/nakama/releases/download/v3.31.0/nakama-3.31.0-linux-amd64.tar.gz | tar -xz -C /opt/nakama");
} else {
  mkdirSync(MODULES, { recursive: true });
  say("     nakama          building plugin");
  try {
    sh(`go build -buildmode=plugin -trimpath -o ${join(MODULES, "backend-core.so")} .`, { cwd: BACKEND });
  } catch (e) {
    say(`FAIL nakama          plugin build: ${String(e.message).slice(0, 200)}`);
    missing.push("fix the plugin build");
  }
  detach(NAKAMA, ["--database.address", DB, "--runtime.path", MODULES, "--logger.level", "WARN",
    "--console.port", "7351", "--socket.port", "7350"], `${LOGS}/nakama.log`);
  // Wait for the RUNTIME, not the socket — see nakamaRuntimeReady().
  const ok = await waitFor(nakamaRuntimeReady, 60, "nakama runtime");
  say(ok ? "ok   nakama          started on 7350, backend-core.so registered" : "FAIL nakama          runtime never registered — see /tmp/nakama.log");
}

if (missing.length) {
  say("\nCould not start everything. Run these, then re-run:");
  for (const m of missing) say(`  ${m}`);
  process.exit(1);
}
