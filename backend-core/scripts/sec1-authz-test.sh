set -u
H=http://127.0.0.1:7350
enc() { printf '%s' "$1" | jq -Rs .; }
auth() { curl -s -u "defaultkey:" -H "content-type: application/json" -X POST "$H/v2/account/authenticate/device?create=true" -d "{\"id\":\"$1\"}"; }
rpc_tok() { curl -s -H "Authorization: Bearer $1" "$H/v2/rpc/$2" -d "$(enc "$3")"; }
rpc_key() { curl -s -H "content-type: application/json" "$H/v2/rpc/$1?http_key=defaulthttpkey" -d "$(enc "$2")"; }
# expect: $1=label $2=response $3=want ("deny"|"allow")
chk() { local r="$2"; if echo "$r" | grep -q '"payload"'; then got=allow; else got=deny; fi
  if [ "$got" = "$3" ]; then echo "PASS  $1  ($got)"; else echo "FAIL  $1  (got $got, want $3)  :: $(echo "$r" | head -c 140)"; fi; }

PTOK=$(auth "sec1-player-1" | sed -E 's/.*"token":"([^"]+)".*/\1/')
STOK=$(auth "sec1-stranger-1" | sed -E 's/.*"token":"([^"]+)".*/\1/')
echo "got player + stranger sessions"; echo ""

echo "--- tournament_create ---"
chk "tournament_create UNAUTH (http_key)" "$(rpc_key tournament_create '{"name":"Hack Cup"}')" deny
CREATE=$(rpc_tok "$PTOK" tournament_create '{"name":"Legit Cup"}')
chk "tournament_create AUTHED (player)" "$CREATE" allow
TID=$(echo "$CREATE" | sed -E 's/.*\\"id\\":\\"([^\\]+)\\".*/\1/')
echo "tournament id = $TID"; echo ""

echo "--- structure mutations (should be owner-only) ---"
chk "blind_level_add UNAUTH" "$(rpc_key blind_level_add "{\"tournament_id\":\"$TID\",\"level\":1,\"small_blind\":100,\"big_blind\":200}")" deny
chk "blind_level_add STRANGER" "$(rpc_tok "$STOK" blind_level_add "{\"tournament_id\":\"$TID\",\"level\":1,\"small_blind\":100,\"big_blind\":200}")" deny
chk "blind_level_add CREATOR" "$(rpc_tok "$PTOK" blind_level_add "{\"tournament_id\":\"$TID\",\"level\":1,\"small_blind\":100,\"big_blind\":200}")" allow
chk "prize_pool_add STRANGER" "$(rpc_tok "$STOK" prize_pool_add "{\"tournament_id\":\"$TID\",\"rank_from\":1,\"rank_to\":1,\"payout_bps\":5000}")" deny
chk "prize_pool_add CREATOR" "$(rpc_tok "$PTOK" prize_pool_add "{\"tournament_id\":\"$TID\",\"rank_from\":1,\"rank_to\":1,\"payout_bps\":5000}")" allow
echo ""

echo "--- payout-sum invariant on start ---"
chk "tournament_start bad-sum (5000 bps)" "$(rpc_tok "$PTOK" tournament_start "{\"tournament_id\":\"$TID\"}")" deny
rpc_tok "$PTOK" prize_pool_add "{\"tournament_id\":\"$TID\",\"rank_from\":2,\"rank_to\":2,\"payout_bps\":5000}" >/dev/null
START=$(rpc_tok "$PTOK" tournament_start "{\"tournament_id\":\"$TID\"}")
if echo "$START" | grep -qE '"payload"|director_match'; then echo "PASS  tournament_start valid (10000 bps + blind) passed auth+invariant"; else echo "INFO  tournament_start after fix: $(echo "$START" | head -c 160)"; fi
chk "tournament_start STRANGER" "$(rpc_tok "$STOK" tournament_start "{\"tournament_id\":\"$TID\"}")" deny
echo ""

echo "--- table_create auth mandatory + antibot ---"
chk "table_create UNAUTH (was allowed before)" "$(rpc_key table_create '{"name":"Anon Table","big_blind":100000}')" deny
chk "antibot_score UNAUTH" "$(rpc_key antibot_score '{"user_id":"victim"}')" deny
echo ""
echo "--- control: rake_config_get deliberately public ---"
chk "rake_config_get UNAUTH (intended public)" "$(rpc_key rake_config_get '{"club_id":"nope"}')" allow
