// Preview tier catalog for rendering /membership WITHOUT a live backend.
//
// The real list comes from the `subscription_tiers` RPC (billing/tiers.go). With no
// Nakama running the grid is empty, which makes the screen impossible to review — the
// same problem demoSnapshot.ts solves for the table.
//
// GENERATED FROM backend-core/billing/tiers.go so the preview cannot drift into fiction.
// It is used ONLY when ?preview=1 is present; the live path is untouched and always wins.
import type { TierDef } from "./types";

export const PREVIEW_TIERS: TierDef[] = [
    {
      "id": "free",
      "name": "Free",
      "monthly_price_cents": 0,
      "annual_price_cents": 0,
      "kyc_level": "email",
      "deposit_limit_daily_cents": 0,
      "withdraw_limit_weekly_cents": 0,
      "max_big_blind_cents": 0,
      "tournament_buy_in_max_cents": 0,
      "rakeback_percent": 0,
      "daily_bonus_chips": 500,
      "club_create_limit": 0,
      "club_member_limit": 0,
      "multi_table_limit": 1,
      "marketplace_fee_bps": 290,
      "benefits": [
        "Play-chip tables only",
        "Email verification",
        "Daily bonus: 500 chips",
        "Freeroll tournaments only",
        "Join clubs (cannot create)",
        "1 table at a time"
      ]
    },
    {
      "id": "bronze",
      "name": "Bronze",
      "monthly_price_cents": 499,
      "annual_price_cents": 4799,
      "kyc_level": "basic",
      "deposit_limit_daily_cents": 20000,
      "withdraw_limit_weekly_cents": 50000,
      "max_big_blind_cents": 1000,
      "tournament_buy_in_max_cents": 2500,
      "rakeback_percent": 0,
      "daily_bonus_chips": 1000,
      "club_create_limit": 1,
      "club_member_limit": 25,
      "multi_table_limit": 1,
      "marketplace_fee_bps": 290,
      "benefits": [
        "Real-money micro stakes (up to 5/10)",
        "$200/day deposit, $500/week withdraw",
        "Daily bonus: 1,000 chips",
        "Tournament buy-ins up to $25",
        "Create 1 club (25 members max)",
        "Everything in Free"
      ]
    },
    {
      "id": "silver",
      "name": "Silver",
      "monthly_price_cents": 1499,
      "annual_price_cents": 14399,
      "kyc_level": "standard",
      "deposit_limit_daily_cents": 100000,
      "withdraw_limit_weekly_cents": 250000,
      "max_big_blind_cents": 5000,
      "tournament_buy_in_max_cents": 20000,
      "rakeback_percent": 10,
      "daily_bonus_chips": 2500,
      "club_create_limit": 3,
      "club_member_limit": 100,
      "multi_table_limit": 4,
      "marketplace_fee_bps": 290,
      "benefits": [
        "Mid stakes (up to 25/50)",
        "$1,000/day deposit, $2,500/week withdraw",
        "10% rakeback",
        "Daily bonus: 2,500 chips",
        "Tournament buy-ins up to $200",
        "Create up to 3 clubs (100 members each)",
        "Multi-table up to 4 tables",
        "Everything in Bronze"
      ]
    },
    {
      "id": "gold",
      "name": "Gold",
      "monthly_price_cents": 2999,
      "annual_price_cents": 28799,
      "kyc_level": "full",
      "deposit_limit_daily_cents": 500000,
      "withdraw_limit_weekly_cents": 1000000,
      "max_big_blind_cents": 40000,
      "tournament_buy_in_max_cents": 0,
      "rakeback_percent": 20,
      "daily_bonus_chips": 5000,
      "club_create_limit": 5,
      "club_member_limit": 500,
      "multi_table_limit": 4,
      "marketplace_fee_bps": 290,
      "benefits": [
        "High stakes (up to 200/400)",
        "$5,000/day deposit, $10,000/week withdraw",
        "20% rakeback",
        "Daily bonus: 5,000 chips",
        "Unlimited tournament buy-ins",
        "Create up to 5 clubs (500 members each)",
        "Everything in Silver"
      ]
    },
    {
      "id": "platinum",
      "name": "Platinum",
      "monthly_price_cents": 7999,
      "annual_price_cents": 76799,
      "kyc_level": "enhanced",
      "deposit_limit_daily_cents": 2500000,
      "withdraw_limit_weekly_cents": 5000000,
      "max_big_blind_cents": 0,
      "tournament_buy_in_max_cents": 0,
      "rakeback_percent": 30,
      "daily_bonus_chips": 10000,
      "club_create_limit": 0,
      "club_member_limit": 0,
      "multi_table_limit": 8,
      "marketplace_fee_bps": 200,
      "benefits": [
        "Unlimited stakes",
        "$25,000/day deposit, $50,000/week withdraw",
        "30% rakeback",
        "Daily bonus: 10,000 chips",
        "Unlimited clubs & members",
        "Multi-table up to 8 tables",
        "Reduced 2.0% marketplace fee",
        "Everything in Gold"
      ]
    }
  ];
