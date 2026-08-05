#!/usr/bin/env node
// Fail when `.railway/railway.ts` declares an env var that `docker-compose.yml`
// lacks AND the code actually reads.
//
// WHY THIS EXISTS
//
// Railway is the primary deploy target, so railway.ts is what gets updated when
// someone adds a variable. docker-compose.yml is a convenience path that fewer
// people run, so it rots silently — and you find out only when local behaves
// differently from production, which is the worst possible way to find out.
//
// Two had already drifted when this was written, both money paths and both
// silent:
//
//   APP_BASE_URL                  rpc/subscription_stripe.go — unset, Stripe
//                                 redirects go to the placeholder
//                                 https://app.example.com
//   NOWPAYMENTS_IPN_CALLBACK_URL  rpc/deposit.go — unset, it is empty, so
//                                 crypto deposit confirmations are never
//                                 delivered and the wallet is never credited
//
// Neither crashes. Both just quietly do the wrong thing.
//
// ONLY vars the code reads are enforced. Railway sets plenty of plumbing no
// source file ever looks at (the PG* family, its own domain interpolations),
// and demanding compose mirror those would be noise that trains people to
// ignore this check — the same reason a flaky test is worse than no test.
//
//   node scripts/check-env-drift.mjs

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const RAILWAY = join(REPO, ".railway/railway.ts");
const COMPOSE = join(REPO, "docker-compose.yml");

if (!existsSync(RAILWAY) || !existsSync(COMPOSE)) {
  console.log("env-drift: skipped — railway.ts or docker-compose.yml not found");
  process.exit(0);
}

// Services compose does not run at all. ai-host is deployed separately to
// Pipecat Cloud (see CLAUDE.md), so its vars are not drift.
const NOT_IN_COMPOSE = [/^PIPECAT_/];

const railwayKeys = new Set(
  [...readFileSync(RAILWAY, "utf8").matchAll(/^\s{4,}([A-Z][A-Z0-9_]{2,}):/gm)].map((m) => m[1]),
);
const composeKeys = new Set(
  [...readFileSync(COMPOSE, "utf8").matchAll(/^\s{4,}([A-Z][A-Z0-9_]{2,}):/gm)].map((m) => m[1]),
);

/** Does any source file actually read this variable? Returns the first file. */
function isRead(key) {
  // TWO greps, deliberately. A single
  //   grep -rwl KEY backend-core --include=*.go frontend-table/src
  // applies --include=*.go to EVERY path, so it silently excludes all
  // TypeScript — the first version of this check reported
  // NEXT_PUBLIC_NAKAMA_SERVER_KEY as "no source reads it" while
  // lib/nakama/client.ts reads it on line 16. A drift check that under-reports
  // drift is worse than none: it certifies the thing it failed to look at.
  //
  // -w so PGUSER does not also match PGUSERNAME.
  const searches = [
    `grep -rwl "${key}" backend-core --include=*.go 2>/dev/null || true`,
    `grep -rwl "${key}" frontend-table/src 2>/dev/null || true`,
  ];
  for (const cmd of searches) {
    const out = execSync(cmd, { cwd: REPO, encoding: "utf8" }).trim();
    if (out) return out.split("\n")[0];
  }
  return null;
}

const drift = [];
const ignored = [];
for (const key of [...railwayKeys].sort()) {
  if (composeKeys.has(key)) continue;
  if (NOT_IN_COMPOSE.some((re) => re.test(key))) { ignored.push(`${key} (service not in compose)`); continue; }
  const readBy = isRead(key);
  if (readBy) drift.push({ key, readBy });
  else ignored.push(`${key} (no source reads it)`);
}

if (ignored.length) {
  console.log("env-drift: in railway.ts but not compose, and deliberately not enforced:");
  for (const i of ignored) console.log(`  - ${i}`);
}

if (drift.length === 0) {
  console.log(`env-drift OK — ${railwayKeys.size} railway vars checked, no code-read var missing from compose`);
  process.exit(0);
}

console.error(`\nenv-drift FAILED — ${drift.length} var(s) the code reads are set on Railway but not in docker-compose.yml:\n`);
for (const d of drift) console.error(`  - ${d.key}\n      read by ${d.readBy}`);
console.error(`\nAdd them to docker-compose.yml with a local-appropriate value, or — if the`);
console.error(`variable genuinely has no meaning under compose — say so in a comment there`);
console.error(`rather than leaving the two files silently disagreeing.\n`);
process.exit(1);
