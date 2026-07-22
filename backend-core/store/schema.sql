-- Poker Next-Gen custom schema (prefix poker_ to avoid Nakama system tables)

CREATE TABLE IF NOT EXISTS poker_club (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_owner (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    equity_bps INT NOT NULL DEFAULT 0,
    can_configure BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(club_id, user_id)
);

CREATE TABLE IF NOT EXISTS poker_player_balance (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    locked_amount BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(club_id, user_id)
);

CREATE TABLE IF NOT EXISTS poker_rake_config (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    percent_bps INT NOT NULL DEFAULT 500,
    cap_minor BIGINT NOT NULL DEFAULT 500,
    no_flop_no_drop BOOLEAN NOT NULL DEFAULT TRUE,
    min_pot_minor BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_tournament (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    variant TEXT NOT NULL DEFAULT 'texas-holdem',
    buy_in_minor BIGINT NOT NULL DEFAULT 0,
    fee_minor BIGINT NOT NULL DEFAULT 0,
    starting_stack BIGINT NOT NULL DEFAULT 10000,
    max_players INT NOT NULL DEFAULT 180,
    max_seats_per_table INT NOT NULL DEFAULT 6,
    status TEXT NOT NULL DEFAULT 'registering',
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_tournament_registration (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    stack BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'registered',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS poker_blind_level (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    level INT NOT NULL,
    small_blind BIGINT NOT NULL,
    big_blind BIGINT NOT NULL,
    ante BIGINT NOT NULL DEFAULT 0,
    duration_secs INT NOT NULL DEFAULT 600,
    is_break BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_prize_pool (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    rank_from INT NOT NULL,
    rank_to INT NOT NULL,
    payout_bps INT NOT NULL,
    guaranteed_minor BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_balance_rule (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    max_seat_difference INT NOT NULL DEFAULT 1,
    break_table_at_or_below INT NOT NULL DEFAULT 2,
    strategy TEXT NOT NULL DEFAULT 'balanced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_global_wallet (
    user_id TEXT PRIMARY KEY,
    balance BIGINT NOT NULL DEFAULT 100000,
    currency TEXT NOT NULL DEFAULT 'USD',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only ledger for every wallet movement (audit trail + reconciliation).
CREATE TABLE IF NOT EXISTS poker_wallet_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    delta BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_wallet_ledger_user ON poker_wallet_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poker_owner_club ON poker_owner(club_id);
CREATE INDEX IF NOT EXISTS idx_poker_balance_club_user ON poker_player_balance(club_id, user_id);
CREATE INDEX IF NOT EXISTS idx_poker_tournament_status ON poker_tournament(status);

CREATE TABLE IF NOT EXISTS poker_club_house_balance (
    club_id TEXT PRIMARY KEY REFERENCES poker_club(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_rake_ledger (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    match_id TEXT NOT NULL DEFAULT '',
    hand_no INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_tournament_table (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES poker_tournament(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL,
    seated_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE poker_tournament ADD COLUMN IF NOT EXISTS director_match_id TEXT NOT NULL DEFAULT '';
ALTER TABLE poker_tournament ADD COLUMN IF NOT EXISTS current_level INT NOT NULL DEFAULT 0;
ALTER TABLE poker_tournament ADD COLUMN IF NOT EXISTS level_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE poker_tournament_registration ADD COLUMN IF NOT EXISTS match_id TEXT NOT NULL DEFAULT '';
ALTER TABLE poker_tournament_registration ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE poker_tournament_registration ADD COLUMN IF NOT EXISTS finish_place INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS poker_audit_event (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL DEFAULT '',
    room_id TEXT NOT NULL DEFAULT '',
    club_id TEXT NOT NULL DEFAULT '',
    hand_no INT NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS poker_audit_event_match_hand_idx ON poker_audit_event (match_id, hand_no);

ALTER TABLE poker_audit_event ADD COLUMN IF NOT EXISTS prev_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE poker_audit_event ADD COLUMN IF NOT EXISTS anchor_ref TEXT NOT NULL DEFAULT '';

-- Membership subscriptions. Server-authoritative: only backend runtime code
-- (Stripe webhook or admin RPC) ever writes tier/expiry — never the client.
CREATE TABLE IF NOT EXISTS poker_subscription (
    user_id TEXT PRIMARY KEY,
    tier TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'inactive',
    expires_at TIMESTAMPTZ,
    stripe_customer_id TEXT NOT NULL DEFAULT '',
    stripe_subscription_id TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only audit trail of every tier grant/change (who, what, why, when).
CREATE TABLE IF NOT EXISTS poker_subscription_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    from_tier TEXT NOT NULL DEFAULT '',
    to_tier TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_subscription_ledger_user ON poker_subscription_ledger(user_id, created_at DESC);

-- KYC / identity verification state. Server writes status; clients submit data
-- and read status. Verified status gates high tiers + real-money deposits.
CREATE TABLE IF NOT EXISTS poker_kyc (
    user_id TEXT PRIMARY KEY,
    level TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'none',   -- none | pending | verified | rejected
    data JSONB NOT NULL DEFAULT '{}',
    rejection_reason TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wallet deposits (crypto/fiat funding). One row per initiated deposit; the
-- gateway webhook flips status to 'credited' exactly once (idempotent), which
-- is when the Nakama wallet is credited.
CREATE TABLE IF NOT EXISTS poker_deposit (
    id TEXT PRIMARY KEY,                    -- our order_id
    user_id TEXT NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    gateway TEXT NOT NULL DEFAULT '',
    gateway_payment_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', -- pending | waiting | credited | failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_deposit_user ON poker_deposit(user_id, created_at DESC);

-- Wallet withdrawals. Funds are held (debited) on request; an admin approves
-- (payout) or rejects (refund). AML control: never auto-paid.
CREATE TABLE IF NOT EXISTS poker_withdrawal (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    destination TEXT NOT NULL DEFAULT '',
    gateway TEXT NOT NULL DEFAULT '',
    gateway_payout_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | rejected
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_withdrawal_user ON poker_withdrawal(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poker_withdrawal_status ON poker_withdrawal(status);

-- Daily bonus claim tracking (chips granted per tier, once per 24h).
CREATE TABLE IF NOT EXISTS poker_daily_bonus (
    user_id TEXT PRIMARY KEY,
    last_claim_at TIMESTAMPTZ,
    streak INT NOT NULL DEFAULT 0
);

-- Rakeback accrual. Rake taken from raked (club) pots accrues back to the
-- contributing players at their tier's rakeback percent; claimable to wallet.
CREATE TABLE IF NOT EXISTS poker_rakeback (
    user_id TEXT PRIMARY KEY,
    balance BIGINT NOT NULL DEFAULT 0,
    lifetime BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global registry of which tables a user is currently seated at, so the tier's
-- multi-table limit can be enforced across matches. Rows are added on sit and
-- removed on stand/leave.
CREATE TABLE IF NOT EXISTS poker_active_seat (
    user_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, match_id)
);

-- Club membership (the general member roster, distinct from poker_owner which
-- carries equity/config rights). Roles: owner | admin | member.
CREATE TABLE IF NOT EXISTS poker_club_member (
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poker_club_member_user ON poker_club_member(user_id);

-- Cosmetics catalog: sellable/ownable items (character models, taunts, card
-- backs, emotes). `owner_user_id` is set for user-generated items (UGC minted
-- via Tripo); official items have it empty.
CREATE TABLE IF NOT EXISTS poker_cosmetic (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,                     -- model | taunt | cardback | emote | table
    name TEXT NOT NULL,
    rarity TEXT NOT NULL DEFAULT 'common',
    asset_ref TEXT NOT NULL DEFAULT '',     -- GLB URL (model) or asset id
    preview_ref TEXT NOT NULL DEFAULT '',   -- preview image URL
    owner_user_id TEXT NOT NULL DEFAULT '', -- creator (UGC) or '' for official
    price_cents BIGINT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Owned cosmetics (inventory).
CREATE TABLE IF NOT EXISTS poker_inventory (
    user_id TEXT NOT NULL,
    cosmetic_id TEXT NOT NULL REFERENCES poker_cosmetic(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT '',        -- generate | purchase | marketplace | grant
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, cosmetic_id)
);

CREATE INDEX IF NOT EXISTS idx_poker_inventory_user ON poker_inventory(user_id);

-- Equipped cosmetic per kind, per user.
CREATE TABLE IF NOT EXISTS poker_equipped (
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    cosmetic_id TEXT NOT NULL,
    PRIMARY KEY (user_id, kind)
);

-- Tripo3D generation jobs (async character minting).
CREATE TABLE IF NOT EXISTS poker_generation (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    tripo_task_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', -- pending | running | success | failed
    fee_cents BIGINT NOT NULL DEFAULT 0,
    cosmetic_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_generation_user ON poker_generation(user_id, created_at DESC);
ALTER TABLE poker_generation ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'model';
ALTER TABLE poker_generation ADD COLUMN IF NOT EXISTS base_model_url TEXT NOT NULL DEFAULT '';

-- Durably re-hosted generated character GLBs. Tripo download URLs are temporary
-- signed URLs, so at mint time we copy the bytes here (keyed by cosmetic id) and
-- point the cosmetic's asset_ref at /api/model/<id>. Keeps equipped characters
-- alive after the Tripo URL expires.
CREATE TABLE IF NOT EXISTS poker_model_asset (
    cosmetic_id TEXT PRIMARY KEY REFERENCES poker_cosmetic(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL DEFAULT 'model/gltf-binary',
    data BYTEA NOT NULL,
    byte_size BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merkle-root batch anchors: one row per batch of audit events committed to
-- Polygon (or a permanence layer). The batch's Merkle root over the events'
-- payload hashes is anchored with a single tx — cheap, public verifiability.
CREATE TABLE IF NOT EXISTS poker_anchor_batch (
    id TEXT PRIMARY KEY,
    merkle_root TEXT NOT NULL,
    event_count INT NOT NULL DEFAULT 0,
    tx_hash TEXT NOT NULL DEFAULT '',
    chain TEXT NOT NULL DEFAULT 'polygon',
    status TEXT NOT NULL DEFAULT 'pending', -- pending | anchored | failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_anchor_batch_created ON poker_anchor_batch(created_at DESC);

-- Member-to-member cosmetic marketplace listings. Platform takes a fee (the
-- seller tier's marketplace bps) on each sale.
CREATE TABLE IF NOT EXISTS poker_listing (
    id TEXT PRIMARY KEY,
    seller_user_id TEXT NOT NULL,
    cosmetic_id TEXT NOT NULL REFERENCES poker_cosmetic(id) ON DELETE CASCADE,
    price_cents BIGINT NOT NULL,
    fee_cents BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open', -- open | sold | cancelled
    buyer_user_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_listing_status ON poker_listing(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poker_listing_seller ON poker_listing(seller_user_id);

-- High Roller Points (HRP) loyalty: earned by PLAYING (win or lose), separate
-- from subscription tiers. Lifetime HRP drives the loyalty level.
CREATE TABLE IF NOT EXISTS poker_loyalty (
    user_id      TEXT PRIMARY KEY,
    hrp_total    BIGINT NOT NULL DEFAULT 0,
    hands_played BIGINT NOT NULL DEFAULT 0,
    hands_won    BIGINT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permanent achievement unlocks shown on a player's profile.
CREATE TABLE IF NOT EXISTS poker_achievement (
    user_id     TEXT NOT NULL,
    code        TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_poker_achievement_user ON poker_achievement(user_id);

-- Progressive identity verification (Didit). One row per (user, kind) where kind
-- is email | biometric | kyc_aml. Drives capability gating: unregistered guests
-- can only host a game; email unlocks clubs/general; biometric unlocks paying +
-- marketplace; kyc_aml unlocks fiat deposit + withdrawal (crypto is exempt).
CREATE TABLE IF NOT EXISTS poker_verification (
    user_id    TEXT NOT NULL,
    kind       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'none',
    session_id TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_poker_verification_session ON poker_verification(session_id);

-- Short shareable room codes → match id, for PokerNow-style "join by link/code".
CREATE TABLE IF NOT EXISTS poker_room_code (
    code       TEXT PRIMARY KEY,
    match_id   TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-club competitive ELO, used to rank clubs and settle club wars. Default
-- 1500; recomputed at the end of each completed war.
ALTER TABLE poker_club ADD COLUMN IF NOT EXISTS elo INT NOT NULL DEFAULT 1500;

-- Alliances: a federation of clubs. A founding club creates the alliance and
-- other clubs join. A club belongs to at most one alliance (UNIQUE club_id).
CREATE TABLE IF NOT EXISTS poker_alliance (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    founding_club_id TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_alliance_member (
    alliance_id TEXT NOT NULL REFERENCES poker_alliance(id) ON DELETE CASCADE,
    club_id     TEXT NOT NULL,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (alliance_id, club_id),
    UNIQUE (club_id)
);

CREATE INDEX IF NOT EXISTS idx_poker_alliance_member_club ON poker_alliance_member(club_id);

-- Leagues: a competitive season across clubs. Standings accrue points/wins/
-- losses; an admin (or the accrual hook) sets standings and completes the season.
CREATE TABLE IF NOT EXISTS poker_league (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    starts_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status     TEXT NOT NULL DEFAULT 'registering', -- registering | active | completed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_league_standing (
    league_id TEXT NOT NULL REFERENCES poker_league(id) ON DELETE CASCADE,
    club_id   TEXT NOT NULL,
    points    INT NOT NULL DEFAULT 0,
    wins      INT NOT NULL DEFAULT 0,
    losses    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (league_id, club_id)
);

-- Club wars: a head-to-head competition between two clubs. Per-hand deltas are
-- recorded in poker_club_war_hand; the war is settled (winner + ELO) at the end.
CREATE TABLE IF NOT EXISTS poker_club_war (
    id           TEXT PRIMARY KEY,
    club_a       TEXT NOT NULL,
    club_b       TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending', -- pending | active | completed
    winner_id    TEXT NOT NULL DEFAULT '',
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    score_a      BIGINT NOT NULL DEFAULT 0,
    score_b      BIGINT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_club_war_status ON poker_club_war(status, created_at DESC);

CREATE TABLE IF NOT EXISTS poker_club_war_hand (
    id         TEXT PRIMARY KEY,
    war_id     TEXT NOT NULL REFERENCES poker_club_war(id) ON DELETE CASCADE,
    match_id   TEXT NOT NULL DEFAULT '',
    hand_no    INT NOT NULL DEFAULT 0,
    club_id    TEXT NOT NULL,
    delta      BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_club_war_hand_war ON poker_club_war_hand(war_id);

-- ============================================================
-- stats domain
-- ============================================================
CREATE TABLE IF NOT EXISTS poker_hand_stats (
    id TEXT PRIMARY KEY DEFAULT '',
    user_id TEXT NOT NULL,
    club_id TEXT NOT NULL DEFAULT '',
    match_id TEXT NOT NULL,
    hand_no INT NOT NULL,
    vpip BOOLEAN NOT NULL DEFAULT FALSE,
    pfr BOOLEAN NOT NULL DEFAULT FALSE,
    went_to_showdown BOOLEAN NOT NULL DEFAULT FALSE,
    won BOOLEAN NOT NULL DEFAULT FALSE,
    net_cents BIGINT NOT NULL DEFAULT 0,
    contribution_cents BIGINT NOT NULL DEFAULT 0,
    street_reached INT NOT NULL DEFAULT 0,
    bets_raises INT NOT NULL DEFAULT 0,
    calls INT NOT NULL DEFAULT 0,
    opponents_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, match_id, hand_no)
);
CREATE INDEX IF NOT EXISTS idx_poker_hand_stats_user ON poker_hand_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_poker_hand_stats_user_club ON poker_hand_stats(user_id, club_id);
CREATE INDEX IF NOT EXISTS idx_poker_hand_stats_match_hand ON poker_hand_stats(match_id, hand_no);

CREATE TABLE IF NOT EXISTS poker_hand_index (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    room_id TEXT NOT NULL DEFAULT '',
    table_label TEXT NOT NULL DEFAULT '',
    hand_no INT NOT NULL,
    user_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    winner_seats_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    pot BIGINT NOT NULL DEFAULT 0,
    rake BIGINT NOT NULL DEFAULT 0,
    deck_commit TEXT NOT NULL DEFAULT '',
    anchored BOOLEAN NOT NULL DEFAULT FALSE,
    anchor_tx TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, hand_no)
);
CREATE INDEX IF NOT EXISTS idx_poker_hand_index_match_hand ON poker_hand_index(match_id, hand_no);
CREATE INDEX IF NOT EXISTS idx_poker_hand_index_created ON poker_hand_index(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poker_hand_index_anchored ON poker_hand_index(anchored);

CREATE TABLE IF NOT EXISTS poker_hrp_event (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    hrp BIGINT NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_poker_hrp_event_user ON poker_hrp_event(user_id, created_at DESC);

-- ============================================================
-- missions domain
-- ============================================================
CREATE TABLE IF NOT EXISTS poker_mission (
    id           TEXT PRIMARY KEY,
    code         TEXT NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    kind         TEXT NOT NULL DEFAULT 'daily',
    metric       TEXT NOT NULL DEFAULT '',
    goal         BIGINT NOT NULL DEFAULT 1,
    reward_cents BIGINT NOT NULL DEFAULT 0,
    xp           BIGINT NOT NULL DEFAULT 0,
    period_key   TEXT NOT NULL DEFAULT '',
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (code, period_key)
);
CREATE INDEX IF NOT EXISTS poker_mission_active_idx ON poker_mission(active, expires_at);
CREATE INDEX IF NOT EXISTS poker_mission_metric_idx ON poker_mission(metric);
CREATE TABLE IF NOT EXISTS poker_mission_progress (
    user_id    TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    progress   BIGINT NOT NULL DEFAULT 0,
    claimed    BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, mission_id)
);
CREATE TABLE IF NOT EXISTS poker_battlepass_season (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    starts_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status        TEXT NOT NULL DEFAULT 'active',
    xp_per_tier   BIGINT NOT NULL DEFAULT 1000,
    max_tier      INTEGER NOT NULL DEFAULT 50,
    premium_cents BIGINT NOT NULL DEFAULT 0,
    tiers_json    TEXT NOT NULL DEFAULT '[]',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS poker_battlepass_season_status_idx ON poker_battlepass_season(status, starts_at);
CREATE TABLE IF NOT EXISTS poker_battlepass_progress (
    user_id         TEXT NOT NULL,
    season_id       TEXT NOT NULL,
    xp              BIGINT NOT NULL DEFAULT 0,
    premium         BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_free    TEXT NOT NULL DEFAULT '[]',
    claimed_premium TEXT NOT NULL DEFAULT '[]',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, season_id)
);
-- Seed one active battle-pass season so battlepass_status activates out of the
-- box. Idempotent: only inserts when no active, unexpired season already exists.
INSERT INTO poker_battlepass_season (id, name, starts_at, ends_at, status, xp_per_tier, max_tier, premium_cents, tiers_json, created_at)
SELECT 'bps_genesis', 'Genesis Season', NOW(), NOW() + INTERVAL '90 days', 'active', 1000, 50, 4999,
       '[{"tier":1,"free_cents":100,"premium_cents":250},{"tier":2,"free_cents":150,"premium_cents":300},{"tier":3,"free_cents":200,"premium_cents":400},{"tier":5,"free_cents":300,"premium_cents":600},{"tier":10,"free_cents":600,"premium_cents":1200},{"tier":25,"free_cents":1500,"premium_cents":3000},{"tier":50,"free_cents":5000,"premium_cents":10000}]',
       NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM poker_battlepass_season WHERE status='active' AND ends_at > NOW()
);
CREATE TABLE IF NOT EXISTS poker_referral (
    id                    TEXT PRIMARY KEY,
    referrer_user_id      TEXT NOT NULL,
    code                  TEXT NOT NULL,
    referred_user_id      TEXT NOT NULL DEFAULT '',
    status                TEXT NOT NULL DEFAULT 'issued',
    reward_cents          BIGINT NOT NULL DEFAULT 0,
    referred_reward_cents BIGINT NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at            TIMESTAMPTZ,
    claimed_at            TIMESTAMPTZ,
    UNIQUE (referrer_user_id, referred_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS poker_referral_referred_unique ON poker_referral(referred_user_id) WHERE referred_user_id <> '';
CREATE INDEX IF NOT EXISTS poker_referral_code_idx ON poker_referral(code);

-- ============================================================
-- responsible domain
-- ============================================================
CREATE TABLE IF NOT EXISTS poker_rg_limit (
    user_id TEXT PRIMARY KEY,
    deposit_daily_cents BIGINT NOT NULL DEFAULT 0,
    deposit_weekly_cents BIGINT NOT NULL DEFAULT 0,
    deposit_monthly_cents BIGINT NOT NULL DEFAULT 0,
    loss_daily_cents BIGINT NOT NULL DEFAULT 0,
    session_minutes BIGINT NOT NULL DEFAULT 0,
    cool_off_until TIMESTAMPTZ,
    self_excluded_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_user_2fa (
    user_id TEXT PRIMARY KEY,
    totp_secret TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    backup_codes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_recovery_code (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_recovery_code_lookup ON poker_recovery_code(email, code_hash);

CREATE TABLE IF NOT EXISTS poker_api_key (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    prefix TEXT NOT NULL DEFAULT '',
    key_hash TEXT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_poker_api_key_user ON poker_api_key(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_poker_api_key_hash ON poker_api_key(key_hash);

-- ============================================================
-- clubsext domain
-- ============================================================
ALTER TABLE poker_club
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tag TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS avatar_ref TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS banner_ref TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS poker_club_invitation (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    inviter TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'invite',
    role TEXT NOT NULL DEFAULT 'member',
    credit_limit_cents BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_poker_club_inv_club ON poker_club_invitation(club_id, type, status);
CREATE INDEX IF NOT EXISTS idx_poker_club_inv_user ON poker_club_invitation(user_id, type, status);

CREATE TABLE IF NOT EXISTS poker_club_stats (
    club_id TEXT PRIMARY KEY REFERENCES poker_club(id) ON DELETE CASCADE,
    member_count INT NOT NULL DEFAULT 0,
    active_7d INT NOT NULL DEFAULT 0,
    hands BIGINT NOT NULL DEFAULT 0,
    win_rate_bps INT NOT NULL DEFAULT 0,
    chips_won BIGINT NOT NULL DEFAULT 0,
    tourney_wins INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_club_announcement (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL DEFAULT 'info',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_club_ann_club ON poker_club_announcement(club_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poker_club_event (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    small_blind BIGINT NOT NULL DEFAULT 0,
    big_blind BIGINT NOT NULL DEFAULT 0,
    variant TEXT NOT NULL DEFAULT 'texas-holdem',
    format TEXT NOT NULL DEFAULT 'cash',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_club_event_club ON poker_club_event(club_id, scheduled_at);

CREATE TABLE IF NOT EXISTS poker_club_chat (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_club_chat_club ON poker_club_chat(club_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poker_club_activity (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES poker_club(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_club_activity_club ON poker_club_activity(club_id, created_at DESC);

-- ============================================================
-- economy domain
-- ============================================================
CREATE TABLE IF NOT EXISTS poker_wallet_bucket (
  user_id    TEXT NOT NULL,
  bucket     TEXT NOT NULL,
  balance    BIGINT NOT NULL DEFAULT 0,
  currency   TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, bucket)
);
CREATE TABLE IF NOT EXISTS poker_cosmetic_wishlist (
  user_id     TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, cosmetic_id)
);
CREATE TABLE IF NOT EXISTS poker_cosmetic_dye (
  user_id     TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  params_json TEXT NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, cosmetic_id)
);
CREATE TABLE IF NOT EXISTS poker_loadout (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  slots_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_poker_loadout_user ON poker_loadout(user_id);
CREATE TABLE IF NOT EXISTS poker_cosmetic_nft (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  tx_hash     TEXT NOT NULL DEFAULT '',
  chain       TEXT NOT NULL DEFAULT 'polygon',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_poker_cosmetic_nft_user ON poker_cosmetic_nft(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_poker_cosmetic_nft_cos ON poker_cosmetic_nft(cosmetic_id);

-- ============================================================
-- admin domain
-- ============================================================
CREATE TABLE IF NOT EXISTS poker_user_status (
    user_id TEXT PRIMARY KEY,
    banned BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT NOT NULL DEFAULT '',
    banned_by TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_platform_setting (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_admin_audit (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    detail JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_admin_audit_created ON poker_admin_audit(created_at DESC);

CREATE TABLE IF NOT EXISTS poker_ip_rule (
    id TEXT PRIMARY KEY,
    cidr TEXT NOT NULL,
    rule TEXT NOT NULL DEFAULT 'deny',
    reason TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poker_hitl_queue (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT '',
    subject_user_id TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_hitl_queue_status ON poker_hitl_queue(status, created_at);

CREATE TABLE IF NOT EXISTS poker_settlement (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    counterparty TEXT NOT NULL DEFAULT '',
    amount_cents BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT NOT NULL DEFAULT '',
    detail JSONB NOT NULL DEFAULT '{}',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_by TEXT,
    verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_poker_settlement_kind ON poker_settlement(kind, status, created_at DESC);

-- ============================================================
-- aiproc domain
-- ============================================================
CREATE TABLE IF NOT EXISTS poker_antibot_score (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    risk TEXT NOT NULL DEFAULT 'low',
    flags_json JSONB NOT NULL DEFAULT '[]',
    sample_size INT NOT NULL DEFAULT 0,
    banned BOOLEAN NOT NULL DEFAULT FALSE,
    banned_reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_poker_antibot_score_risk ON poker_antibot_score(risk, score DESC);

CREATE TABLE IF NOT EXISTS poker_collusion_flag (
    id TEXT PRIMARY KEY,
    user_a TEXT NOT NULL,
    user_b TEXT NOT NULL,
    match_id TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    reviewed_by TEXT NOT NULL DEFAULT '',
    review_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_poker_collusion_flag_status ON poker_collusion_flag(status, created_at DESC);

CREATE TABLE IF NOT EXISTS poker_announcement (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL DEFAULT 'info',
    audience TEXT NOT NULL DEFAULT 'all',
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_poker_announcement_window ON poker_announcement(starts_at DESC, ends_at);

CREATE TABLE IF NOT EXISTS poker_support_ticket (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'open',
    messages_json JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_poker_support_ticket_user ON poker_support_ticket(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_poker_support_ticket_status ON poker_support_ticket(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS poker_device_fingerprint (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_poker_device_fingerprint_fp ON poker_device_fingerprint(fingerprint);

-- ============================================================
-- tournext domain
-- ============================================================
ALTER TABLE poker_tournament ADD COLUMN IF NOT EXISTS late_reg_secs INT NOT NULL DEFAULT 0;
ALTER TABLE poker_tournament ADD COLUMN IF NOT EXISTS time_bank_secs INT NOT NULL DEFAULT 0;
ALTER TABLE poker_tournament ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'mtt';

-- ============================================================
-- table features (#41): run-it-twice + all-in insurance
-- ============================================================
CREATE TABLE IF NOT EXISTS poker_run_it_twice (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    hand_no INT NOT NULL,
    boards JSONB NOT NULL DEFAULT '[]',
    board_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, hand_no)
);
CREATE INDEX IF NOT EXISTS idx_poker_rit_match ON poker_run_it_twice(match_id, hand_no);

CREATE TABLE IF NOT EXISTS poker_insurance (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    hand_no INT NOT NULL,
    user_id TEXT NOT NULL,
    premium BIGINT NOT NULL DEFAULT 0,
    payout BIGINT NOT NULL DEFAULT 0,
    equity DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'accepted', -- accepted | won | paid
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ,
    UNIQUE(match_id, hand_no, user_id)
);
CREATE INDEX IF NOT EXISTS idx_poker_insurance_match ON poker_insurance(match_id, hand_no);
CREATE INDEX IF NOT EXISTS idx_poker_insurance_user ON poker_insurance(user_id);
