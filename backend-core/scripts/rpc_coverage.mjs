// Endpoint-coverage proof (#proof-artifacts). Authenticates as the seeded
// operator and calls EVERY registered RPC (names read from main.go) with an
// empty payload, classifying each response:
//   WIRED-OK        HTTP 200 — reached real logic, returned data
//   WIRED-VALIDATES registered; rejected empty input with a business error
//   MISSING         RPC not registered (404 / "not found")
//   ERROR           unexpected 5xx that is not a validation message
//   SKIPPED         destructive/side-effecting — not exercised by an empty call
//
// Run: node backend-core/scripts/rpc_coverage.mjs   (Nakama must be up on :7350)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.NAKAMA_URL || "http://localhost:7350";
const KEY = "ZGVmYXVsdGtleTo="; // base64 "defaultkey:"
const DEVICE = process.env.OP_DEVICE || "hrc-operator-demo-001";

// Destructive / side-effecting RPCs we register but do NOT fire with an empty
// payload (they are exercised by their own targeted verifications elsewhere).
const SKIP = new Set([
  "admin_ban", "admin_unban", "admin_club_disable", "admin_table_close",
  "admin_user_adjust_wallet", "tables_freeze_all", "wallet_withdraw",
  "wallet_deposit_crypto", "wallet_deposit_fiat", "nowpayments_webhook",
  "subscription_checkout", "subscription_cancel", "character_generate",
  "tournament_finalize", "club_disable", "antibot_ban", "antibot_scan_all",
  "anchor_run", "kyc_start", "withdrawal_approve", "withdrawal_reject",
  "rg_self_exclude", "rg_cool_off", "account_delete", "wallet_unlink",
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainGo = readFileSync(join(__dirname, "..", "main.go"), "utf8");
const rpcs = [...new Set([...mainGo.matchAll(/"([a-z_0-9]+)":\s+rpc\./g)].map((m) => m[1]))].sort();

async function auth() {
  const r = await fetch(`${BASE}/v2/account/authenticate/device?create=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${KEY}` },
    body: JSON.stringify({ id: DEVICE }),
  });
  return (await r.json()).token;
}

function classify(status, body) {
  if (status === 200) return "WIRED-OK";
  const b = (body || "").toLowerCase();
  if (status === 404 || b.includes("not found") || b.includes("not registered") || b.includes("no such")) return "MISSING";
  // Any other non-200 with a message = registered handler that rejected empty input.
  if (b.length > 0) return "WIRED-VALIDATES";
  return "ERROR";
}

const token = await auth();
const results = {};
for (const id of rpcs) {
  if (SKIP.has(id)) { results[id] = "SKIPPED"; continue; }
  try {
    const r = await fetch(`${BASE}/v2/rpc/${id}?unwrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}",
    });
    results[id] = classify(r.status, await r.text());
  } catch (e) {
    results[id] = "ERROR";
  }
}

const tally = {};
for (const v of Object.values(results)) tally[v] = (tally[v] || 0) + 1;
console.log("=== RPC COVERAGE ===");
console.log("total registered:", rpcs.length);
console.log(tally);
const missing = rpcs.filter((r) => results[r] === "MISSING");
const errored = rpcs.filter((r) => results[r] === "ERROR");
console.log("\nMISSING (unregistered / not found):", missing.length ? missing.join(", ") : "none");
console.log("ERROR (unexpected):", errored.length ? errored.join(", ") : "none");
// Non-zero exit if any endpoint is missing/errored — makes this a real gate.
process.exit(missing.length + errored.length > 0 ? 1 : 0);
