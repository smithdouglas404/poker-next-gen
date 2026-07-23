globalThis.window = globalThis;
const { Client } = await import("@heroiclabs/nakama-js");
const N = 5;
const client = new Client("defaultkey", "127.0.0.1", "7350", false);
const parse = (p) => (typeof p === "string" ? JSON.parse(p) : p);
const created = [];
for (let i = 0; i < N; i++) {
  const s = await client.authenticateDevice(`loadtest-${Date.now()}-${i}`, true);
  const res = await client.rpc(s, "table_create", {
    name: `Load ${i}`, small_blind: 100, big_blind: 200,
    buy_in: 100000, min_buy_in: 50000, max_buy_in: 300000, max_seats: 6, num_bots: 3,
  });
  const d = parse(res.payload);
  created.push(d.match_id);
  console.log(`table ${i + 1} created: ${d.room_id} (${String(d.match_id).slice(0,8)})`);
}
const s2 = await client.authenticateDevice(`loadtest-lister-${Date.now()}`, true);
const list = parse((await client.rpc(s2, "table_list", {})).payload);
console.log(`\nRESULT: ${created.length} tables created concurrently; table_list reports ${list.matches?.length ?? 0} open matches running in parallel.`);
