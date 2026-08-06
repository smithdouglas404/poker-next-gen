// Can a stranger read and write a club's chat if it moves to Nakama's built-in
// channels?
//
// The bespoke club chat gates on membership: rpc/clubs_ext.go's ClubChatSend
// calls GetMembership and refuses "only club members can post to club chat".
// Nakama's ROOM channels have no such concept — the room name IS the address.
// Clubs are not Nakama groups (there is no GroupCreate anywhere in
// backend-core), so a group channel, which IS members-only, is not available
// without building that mapping first.
//
// This probe settles it by trying the attack rather than reasoning about it:
// an unrelated account joins a room named after a club it has no membership in,
// writes to it, and reads the history back.
//
//   node scripts/table-sim/nakama-chat-authz-probe.mjs

import { Client } from "@heroiclabs/nakama-js";
import { execSync } from "node:child_process";

const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const sql = (q) =>
  execSync(`psql -h 127.0.0.1 -p 5433 -U postgres -d nakama -tAc "${q.replace(/"/g, '\\"')}"`)
    .toString()
    .trim();
const rpc = async (s, n, p = {}) => {
  try {
    const r = await client.rpc(s, n, p);
    return typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
  } catch (e) {
    const body = e && typeof e.json === "function" ? await e.json().catch(() => null) : null;
    return { __error: `${e?.status ?? "?"} ${JSON.stringify(body)}` };
  }
};
const CHANNEL_ROOM = 1;

const owner = await client.authenticateEmail(`authz_own_${Date.now()}@t.local`, "Passw0rd!123", true);
sql(
  `INSERT INTO poker_subscription (user_id,tier,status) VALUES ('${owner.user_id}','platinum','active') ON CONFLICT (user_id) DO UPDATE SET tier='platinum', status='active'`,
);
const club = await rpc(owner, "club_create", { name: `Authz ${Date.now()}`, slug: `az${Date.now()}` });
const clubId = club?.club?.id ?? club?.id;

// A completely unrelated account. Never invited, never a member.
const stranger = await client.authenticateEmail(`authz_str_${Date.now()}@t.local`, "Passw0rd!123", true);
console.log(`club ${clubId}`);
console.log(`stranger ${stranger.user_id} (no membership of any kind)\n`);

// ---- 1. The bespoke path: what ships today ----
const viaRpc = await rpc(stranger, "club_chat_send", { club_id: clubId, text: "stranger was here" });
console.log(`club_chat_send as a non-member : ${viaRpc.__error ? "REFUSED — " + viaRpc.__error : "ACCEPTED " + JSON.stringify(viaRpc)}`);
const readRpc = await rpc(stranger, "club_chat_list", { club_id: clubId, limit: 10 });
console.log(`club_chat_list as a non-member : ${readRpc.__error ? "REFUSED — " + readRpc.__error : "ALLOWED, " + (readRpc.messages?.length ?? 0) + " messages"}`);

// ---- 2. The Nakama-native path: what moving to channels would give ----
const sock = client.createSocket(false, false);
await sock.connect(stranger, true);
let joined = null;
let joinError = null;
try {
  joined = await sock.joinChat(clubId, CHANNEL_ROOM, true, false);
} catch (e) {
  joinError = e?.message ?? JSON.stringify(e);
}
console.log(`\njoinChat(room "${clubId}") as a non-member : ${joined ? "JOINED, channel " + joined.id.slice(0, 40) : "REFUSED — " + joinError}`);

if (joined) {
  let wrote = null;
  try {
    wrote = await sock.writeChatMessage(joined.id, { text: "stranger posting in your club chat" });
  } catch (e) {
    wrote = { __error: e?.message ?? JSON.stringify(e) };
  }
  console.log(`writeChatMessage as a non-member         : ${wrote?.__error ? "REFUSED — " + wrote.__error : "ACCEPTED, message " + String(wrote.message_id).slice(0, 24)}`);

  const history = await client.listChannelMessages(stranger, joined.id, 10);
  console.log(`listChannelMessages as a non-member      : ${(history.messages ?? []).length} messages readable`);
}
await sock.disconnect(false);
console.log("");
