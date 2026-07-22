#!/usr/bin/env bash
# SEC-3: live authorization matrix across the authz-critical RPCs x roles
# (unauth / stranger / member / owner-configurer). Run against a live stack.
set -u
H=http://127.0.0.1:7350
enc(){ printf '%s' "$1" | jq -Rs .; }
auth(){ curl -s -u "defaultkey:" -H "content-type: application/json" -X POST "$H/v2/account/authenticate/device?create=true" -d "{\"id\":\"$1\"}" | grep -oE '"token":"[^"]+"' | head -1 | sed -E 's/.*:"//;s/"//'; }
rpc(){ curl -s -H "Authorization: Bearer $1" "$H/v2/rpc/$2" -d "$(enc "$3")"; }
rpck(){ curl -s -H "content-type: application/json" "$H/v2/rpc/$1?http_key=defaulthttpkey" -d "$(enc "$2")"; }
uid_of(){ rpc "$1" profile_get '' | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1; }
pq(){ PGHOST=127.0.0.1 psql -U postgres -p 5432 -d nakama -tAc "$1"; }
is_deny(){ echo "$1" | grep -qE '"code":(7|16)|forbidden|unauthorized|private to this club|not the tournament owner'; }
P=0; F=0
chk(){ local g; if is_deny "$2"; then g=deny; else g=allow; fi; if [ "$g" = "$3" ]; then echo "PASS  $1 [$g]"; P=$((P+1)); else echo "FAIL  $1 (got $g want $3) :: $(echo "$2"|head -c 110)"; F=$((F+1)); fi; }

OWN=$(auth sec3-owner); MEM=$(auth sec3-member); STR=$(auth sec3-stranger)
OUID=$(uid_of "$OWN"); MUID=$(uid_of "$MEM")
pq "INSERT INTO poker_verification(user_id,kind,status,updated_at) VALUES('$OUID','email','verified',NOW()) ON CONFLICT(user_id,kind) DO UPDATE SET status='verified'" >/dev/null
pq "INSERT INTO poker_subscription(user_id,tier,status,updated_at) VALUES('$OUID','platinum','active',NOW()) ON CONFLICT(user_id) DO UPDATE SET tier='platinum',status='active'" >/dev/null
pq "INSERT INTO poker_global_wallet(user_id,balance,currency,updated_at) VALUES('$OUID',500000,'USD',NOW()) ON CONFLICT(user_id) DO UPDATE SET balance=500000" >/dev/null
CID=$(rpc "$OWN" club_create "{\"name\":\"SEC3 $(date +%N)\",\"currency\":\"USD\"}" | grep -oE 'club_[a-f0-9]+' | head -1)
pq "INSERT INTO poker_club_member(club_id,user_id,username,role,status,joined_at) VALUES('$CID','$MUID','mem','member','active',NOW()) ON CONFLICT DO NOTHING" >/dev/null
echo "owner=${OUID:0:8} club=$CID member=${MUID:0:8}"; echo ""

echo "== PUBLIC reads (allow unauth) =="
chk "healthz            unauth" "$(rpck healthz '')" allow
chk "club_list          unauth" "$(rpck club_list '')" allow
chk "hand_rank          unauth" "$(rpck hand_rank '{"cards":"AsKsQsJsTs"}')" allow
chk "tournament_list    unauth" "$(rpck tournament_list '')" allow

echo "== AUTH-ONLY (deny unauth, allow authed) =="
chk "wallet_get         unauth"  "$(rpck wallet_get '')" deny
chk "wallet_get         authed"  "$(rpc "$STR" wallet_get '')" allow
chk "profile_get        unauth"  "$(rpck profile_get '')" deny
chk "loyalty_get        unauth"  "$(rpck loyalty_get '')" deny
chk "kyc_status         unauth"  "$(rpck kyc_status '')" deny

echo "== CONFIGURER-GATED (deny unauth+stranger, allow owner) =="
BA="{\"club_id\":\"$CID\",\"user_id\":\"$MUID\",\"balance\":50000,\"currency\":\"USD\"}"
chk "balance_allocate   unauth"   "$(rpck balance_allocate "$BA")" deny
chk "balance_allocate   stranger" "$(rpc "$STR" balance_allocate "$BA")" deny
chk "balance_allocate   owner"    "$(rpc "$OWN" balance_allocate "$BA")" allow
chk "rake_config_set    stranger" "$(rpc "$STR" rake_config_set "{\"club_id\":\"$CID\",\"name\":\"S\",\"percent_bps\":500,\"cap_minor\":300}")" deny
chk "rake_config_set    owner"    "$(rpc "$OWN" rake_config_set "{\"club_id\":\"$CID\",\"name\":\"S\",\"percent_bps\":500,\"cap_minor\":300}")" allow
chk "rake_ledger_get    stranger" "$(rpc "$STR" rake_ledger_get "{\"club_id\":\"$CID\"}")" deny
chk "rake_ledger_get    owner"    "$(rpc "$OWN" rake_ledger_get "{\"club_id\":\"$CID\"}")" allow
chk "club_owner_add     stranger" "$(rpc "$STR" club_owner_add "{\"club_id\":\"$CID\",\"user_id\":\"$MUID\"}")" deny

echo "== rake_config_get TOGGLE (opt-in transparency) =="
chk "rake_config_get    unauth  (private)" "$(rpck rake_config_get "{\"club_id\":\"$CID\"}")" deny
chk "rake_config_get    stranger(private)" "$(rpc "$STR" rake_config_get "{\"club_id\":\"$CID\"}")" deny
chk "rake_config_get    member (private)"  "$(rpc "$MEM" rake_config_get "{\"club_id\":\"$CID\"}")" allow
chk "rake_config_get    owner  (private)"  "$(rpc "$OWN" rake_config_get "{\"club_id\":\"$CID\"}")" allow
rpc "$OWN" rake_config_set "{\"club_id\":\"$CID\",\"name\":\"S\",\"percent_bps\":500,\"cap_minor\":300,\"public\":true}" >/dev/null
chk "rake_config_get    unauth  (PUBLIC on)" "$(rpck rake_config_get "{\"club_id\":\"$CID\"}")" allow

echo "== SEC-1 tournament/table/antibot (re-assert) =="
chk "tournament_create  unauth" "$(rpck tournament_create '{"name":"X"}')" deny
chk "table_create       unauth" "$(rpck table_create '{"name":"X"}')" deny
chk "antibot_score      unauth" "$(rpck antibot_score '{"user_id":"z"}')" deny
echo ""
echo "SEC-3 matrix: $P passed, $F failed"
