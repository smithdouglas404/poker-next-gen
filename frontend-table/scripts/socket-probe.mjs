globalThis.window = globalThis; // nakama-js socket adapter is browser-oriented (refs window)
import { Client } from "@heroiclabs/nakama-js";
const HOST = "127.0.0.1", PORT = "7350", KEY = "defaultkey";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = new TextDecoder();

const client = new Client(KEY, HOST, PORT, false);
const owner = await client.authenticateDevice("probe-owner-1", true, "ProbeOwner");
// seed owner so table_create passes
import { execFileSync } from "node:child_process";
const psql = (q) => execFileSync("psql", ["-h","127.0.0.1","-p","5432","-U","postgres","-d","nakama","-tA","-c",q], { encoding: "utf8" });
psql(`INSERT INTO poker_subscription(user_id,tier,status,updated_at) VALUES('${owner.user_id}','platinum','active',NOW()) ON CONFLICT(user_id) DO UPDATE SET tier='platinum',status='active'`);

const player = await client.authenticateDevice("probe-player-1", true, "ProbePlayer");
const t = await client.rpc(owner, "table_create", { name: "Probe", small_blind: 100, big_blind: 200, buy_in: 30000, max_seats: 8, num_bots: 7, duration_mins: 0 });
console.log("table_create raw response:", JSON.stringify(t).slice(0, 300));
const payload = typeof t.payload === "string" ? t.payload : JSON.stringify(t.payload);
const matchId = JSON.parse(payload).match_id;
console.log("matchId:", matchId);

const socket = client.createSocket(false, true); // verbose=true
socket.onmatchdata = (m) => {
  let txt = "";
  try { txt = dec.decode(m.data); } catch { txt = "<binary>"; }
  console.log(`FRAME op=${m.op_code} data=${txt.slice(0, 160)}`);
};
socket.ondisconnect = (e) => console.log("SOCKET DISCONNECT", e?.code || "");
socket.onerror = (e) => console.log("SOCKET ERROR", e?.message || e);

console.log("connecting socket...");
await socket.connect(player, false);
console.log("connected. joining match...");
const m = await socket.joinMatch(matchId);
console.log("joined. presences:", (m.presences || []).length, "self:", m.self?.user_id?.slice(0,8), "label:", m.label?.slice(0,60));

// proactively sit at seat 7 (7 bots take 0-6)
await sleep(500);
console.log("sending OpSitDown seat 7...");
socket.sendMatchState(matchId, 1, new TextEncoder().encode(JSON.stringify({ seat: 7, buy_in: 30000 })));

await sleep(12000);
console.log("done listening.");
socket.disconnect(true);
process.exit(0);
