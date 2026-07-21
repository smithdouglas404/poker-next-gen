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
