package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/match/holdem"
	"github.com/smithdouglas404/poker-next-gen/backend-core/match/tournament"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
	"github.com/smithdouglas404/poker-next-gen/backend-core/rpc"
	"github.com/smithdouglas404/poker-next-gen/backend-core/social"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	start := time.Now()

	if err := store.Migrate(ctx, db); err != nil {
		logger.Error("schema migration failed: %v", err)
		return err
	}

	// Create native Nakama leaderboards (idempotent).
	social.EnsureLeaderboards(ctx, nk)

	rpcs := map[string]func(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, string) (string, error){
		"healthz":                     rpc.Healthz,
		"club_create":                 rpc.ClubCreate,
		"club_list":                   rpc.ClubList,
		"club_owner_add":              rpc.ClubOwnerAdd,
		"club_get":                    rpc.ClubGet,
		"club_join":                   rpc.ClubJoin,
		"club_leave":                  rpc.ClubLeave,
		"club_members":                rpc.ClubMembers,
		"club_member_role":            rpc.ClubMemberRole,
		"club_kick":                   rpc.ClubKick,
		"balance_allocate":            rpc.BalanceAllocate,
		"balance_get":                 rpc.BalanceGet,
		"rake_config_set":             rpc.RakeConfigSet,
		"rake_config_get":             rpc.RakeConfigGet,
		"rake_ledger_get":             rpc.RakeLedgerGet,
		"table_create":                rpc.TableCreate,
		"table_list":                  rpc.TableList,
		"tables_freeze_all":           rpc.TablesFreezeAll,
		"table_add_bot":               rpc.TableAddBot,
		"tournament_create":           rpc.TournamentCreate,
		"tournament_list":             rpc.TournamentList,
		"tournament_register":         rpc.TournamentRegister,
		"tournament_start":            rpc.TournamentStart,
		"blind_level_add":             rpc.BlindLevelAdd,
		"blind_level_list":            rpc.BlindLevelList,
		"prize_pool_add":              rpc.PrizePoolAdd,
		"prize_pool_list":             rpc.PrizePoolList,
		"balancing_rule_set":          rpc.BalancingRuleSet,
		"wallet_get":                  rpc.WalletGet,
		"wallet_ledger":               rpc.WalletLedger,
		"profile_get":                 rpc.ProfileGet,
		"me_roles":                    rpc.MeRoles,
		"loyalty_get":                 rpc.LoyaltyGet,
		"matchmaker_enqueue":          rpc.MatchmakerEnqueue,
		"room_resolve":                rpc.RoomResolve,
		"equity_estimate":             rpc.EquityEstimate,
		"hand_rank":                   rpc.HandRank,
		"audit_list":                  rpc.AuditList,
		"audit_verify_hand":           rpc.AuditVerifyHand,
		"omaha_rank":                  rpc.OmahaRank,
		"omaha_showdown":              rpc.OmahaShowdown,
		"gto_advise":                  rpc.GtoAdvise,
		"gto_solve":                   rpc.GtoSolve,
		"coaching_tip":                rpc.CoachingTip,
		"antibot_score":               rpc.AntibotScore,
		"subscription_tiers":          rpc.SubscriptionTiers,
		"subscription_status":         rpc.SubscriptionStatus,
		"subscription_checkout":       rpc.SubscriptionCheckout,
		"subscription_grant_admin":    rpc.SubscriptionGrantAdmin,
		"stripe_webhook":              rpc.StripeWebhook,
		"kyc_status":                  rpc.KycStatus,
		"kyc_submit":                  rpc.KycSubmit,
		"kyc_start":                   rpc.KycStart,
		"kyc_apply":                   rpc.KycApply,
		"me_verification":             rpc.MeVerification,
		"kyc_verify_admin":            rpc.KycVerifyAdmin,
		"wallet_deposit_crypto":       rpc.WalletDepositCrypto,
		"wallet_deposit_fiat":         rpc.WalletDepositFiat,
		"nowpayments_webhook":         rpc.NowPaymentsWebhook,
		"nowpayments_balance":         rpc.NowPaymentsBalance,
		"wallet_withdraw":             rpc.WalletWithdraw,
		"withdrawal_list":             rpc.WithdrawalList,
		"withdrawal_approve_admin":    rpc.WithdrawalApproveAdmin,
		"withdrawal_reject_admin":     rpc.WithdrawalRejectAdmin,
		"daily_bonus_status":          rpc.DailyBonusStatus,
		"daily_bonus_claim":           rpc.DailyBonusClaim,
		"rakeback_status":             rpc.RakebackStatus,
		"rakeback_claim":              rpc.RakebackClaim,
		"cosmetic_list":               rpc.CosmeticList,
		"inventory_list":              rpc.InventoryList,
		"cosmetic_equip":              rpc.CosmeticEquip,
		"character_generate":          rpc.CharacterGenerate,
		"character_generation_status": rpc.CharacterGenerationStatus,
		"model_asset":                 rpc.ModelAsset,
		"anchor_run":                  rpc.AnchorRun,
		"anchor_status":               rpc.AnchorStatus,
		"marketplace_list":            rpc.MarketplaceList,
		"marketplace_browse":          rpc.MarketplaceBrowse,
		"marketplace_buy":             rpc.MarketplaceBuy,
		"marketplace_cancel":          rpc.MarketplaceCancel,
		// Alliances
		"alliance_create":      rpc.AllianceCreate,
		"alliance_list":        rpc.AllianceList,
		"alliance_get":         rpc.AllianceGet,
		"alliance_update":      rpc.AllianceUpdate,
		"alliance_join":        rpc.AllianceJoin,
		"alliance_remove_club": rpc.AllianceRemoveClub,
		"alliance_delete":      rpc.AllianceDelete,
		"club_alliance_get":    rpc.ClubAllianceGet,
		// Leagues
		"league_create":        rpc.LeagueCreate,
		"league_list":          rpc.LeagueList,
		"league_get":           rpc.LeagueGet,
		"league_update":        rpc.LeagueUpdate,
		"league_delete":        rpc.LeagueDelete,
		"league_standings_set": rpc.LeagueStandingsSet,
		"league_complete":      rpc.LeagueComplete,
		"league_join":          rpc.LeagueJoin,
		// Club wars
		"clubwar_schedule":  rpc.ClubwarSchedule,
		"clubwar_list":      rpc.ClubwarList,
		"clubwar_get":       rpc.ClubwarGet,
		"clubwar_accept":    rpc.ClubwarAccept,
		"clubwar_matchmake": rpc.ClubwarMatchmake,
		"clubwar_result":    rpc.ClubwarResult,
		// Stats / leaderboards
		"player_stats":       rpc.PlayerStats,
		"leak_report":        rpc.LeakReport,
		"hand_history":       rpc.HandHistory,
		"stats_head_to_head": rpc.StatsHeadToHead,
		"loyalty_history":    rpc.LoyaltyHistory,
		"leaderboard_top":    rpc.LeaderboardTop,
		// Missions / battle pass / referrals
		"missions_list":               rpc.MissionsList,
		"mission_claim":               rpc.MissionClaim,
		"missions_generate_daily":     rpc.MissionsGenerateDaily,
		"battlepass_status":           rpc.BattlePassStatus,
		"battlepass_claim":            rpc.BattlePassClaim,
		"battlepass_purchase_premium": rpc.BattlePassPurchasePremium,
		"referral_code":               rpc.ReferralCode,
		"referral_apply":              rpc.ReferralApply,
		"referral_status":             rpc.ReferralStatus,
		"referral_claim":              rpc.ReferralClaim,
		// Responsible gambling / account security / recovery
		"rg_limits_get":                  rpc.RgLimitsGet,
		"rg_limits_set":                  rpc.RgLimitsSet,
		"rg_cool_off":                    rpc.RgCoolOff,
		"rg_self_exclude":                rpc.RgSelfExclude,
		"auth_2fa_setup":                 rpc.Auth2FASetup,
		"auth_2fa_verify":                rpc.Auth2FAVerify,
		"auth_2fa_disable":               rpc.Auth2FADisable,
		"auth_change_password":           rpc.AuthChangePassword,
		"account_recovery_request_email": rpc.AccountRecoveryRequestEmail,
		"account_recovery_verify_email":  rpc.AccountRecoveryVerifyEmail,
		"account_recovery_backup_code":   rpc.AccountRecoveryBackupCode,
		"api_key_create":                 rpc.ApiKeyCreate,
		"api_key_list":                   rpc.ApiKeyList,
		"api_key_revoke":                 rpc.ApiKeyRevoke,
		// Clubs expansion
		"club_update":              rpc.ClubUpdate,
		"club_delete":              rpc.ClubDelete,
		"club_transfer_ownership":  rpc.ClubTransferOwnership,
		"club_browse":              rpc.ClubBrowse,
		"club_roster":              rpc.ClubRoster,
		"club_rankings":            rpc.ClubRankings,
		"club_rake_report":         rpc.ClubRakeReport,
		"club_member_stats":        rpc.ClubMemberStats,
		"club_quick_stats":         rpc.ClubQuickStats,
		"club_invite":              rpc.ClubInvite,
		"club_invite_revoke":       rpc.ClubInviteRevoke,
		"club_join_request":        rpc.ClubJoinRequest,
		"club_requests_list":       rpc.ClubRequestsList,
		"club_request_review":      rpc.ClubRequestReview,
		"club_invitations_list":    rpc.ClubInvitationsList,
		"club_announcement_list":   rpc.ClubAnnouncementList,
		"club_announcement_create": rpc.ClubAnnouncementCreate,
		"club_event_list":          rpc.ClubEventList,
		"club_event_create":        rpc.ClubEventCreate,
		"club_chat_send":           rpc.ClubChatSend,
		"club_chat_list":           rpc.ClubChatList,
		// Economy (wallet buckets / shop / dye / wardrobe / NFT)
		"wallet_balances":          rpc.WalletBalances,
		"wallet_transfer":          rpc.WalletTransfer,
		"cosmetic_buy":             rpc.CosmeticBuy,
		"cosmetic_wishlist_add":    rpc.CosmeticWishlistAdd,
		"cosmetic_wishlist_remove": rpc.CosmeticWishlistRemove,
		"cosmetic_wishlist_list":   rpc.CosmeticWishlistList,
		"cosmetic_dye_get":         rpc.CosmeticDyeGet,
		"cosmetic_dye_set":         rpc.CosmeticDyeSet,
		"loadout_save":             rpc.LoadoutSave,
		"loadout_list":             rpc.LoadoutList,
		"loadout_equip":            rpc.LoadoutEquip,
		"cosmetic_mint_nft":        rpc.CosmeticMintNFT,
		"cosmetic_nft_status":      rpc.CosmeticNFTStatus,
		// Admin console
		"admin_financials":          rpc.AdminFinancials,
		"admin_user_search":         rpc.AdminUserSearch,
		"admin_user_adjust_wallet":  rpc.AdminUserAdjustWallet,
		"admin_ban":                 rpc.AdminBan,
		"admin_unban":               rpc.AdminUnban,
		"admin_club_disable":        rpc.AdminClubDisable,
		"admin_table_close":         rpc.AdminTableClose,
		"kyc_pending_list":          rpc.KycPendingList,
		"system_lock_get":           rpc.SystemLockGet,
		"system_lock_set":           rpc.SystemLockSet,
		"platform_settings_get":     rpc.PlatformSettingsGet,
		"platform_settings_set":     rpc.PlatformSettingsSet,
		"admin_env_status":          rpc.AdminEnvStatus,
		"admin_audit_list":          rpc.AdminAuditList,
		"hitl_list":                 rpc.HitlList,
		"hitl_review":               rpc.HitlReview,
		"ip_rule_list":              rpc.IPRuleList,
		"ip_rule_add":               rpc.IPRuleAdd,
		"ip_rule_delete":            rpc.IPRuleDelete,
		"geo_rule_list":             rpc.GeoRuleList,
		"geo_rule_set":              rpc.GeoRuleSet,
		"geo_rule_delete":           rpc.GeoRuleDelete,
		"jurisdiction_check":        rpc.JurisdictionCheck,
		"sponsorship_payout_list":   rpc.SponsorshipPayoutList,
		"sponsorship_payout_create": rpc.SponsorshipPayoutCreate,
		"settlement_list":           rpc.SettlementList,
		"settlement_verify":         rpc.SettlementVerify,
		"admin_ledger_search":       rpc.AdminLedgerSearch,
		// AI processing / support / announcements / anti-fraud
		"antibot_scan_all":             rpc.AntibotScanAll,
		"antibot_flags_list":           rpc.AntibotFlagsList,
		"antibot_ban":                  rpc.AntibotBan,
		"collusion_list":               rpc.CollusionList,
		"collusion_flag_review":        rpc.CollusionFlagReview,
		"announcement_create":          rpc.AnnouncementCreate,
		"announcement_delete":          rpc.AnnouncementDelete,
		"announcement_list":            rpc.AnnouncementList,
		"support_ticket_create":        rpc.SupportTicketCreate,
		"support_ticket_list":          rpc.SupportTicketList,
		"support_ticket_get":           rpc.SupportTicketGet,
		"support_ticket_reply":         rpc.SupportTicketReply,
		"support_ticket_admin_respond": rpc.SupportTicketAdminRespond,
		"support_contact":              rpc.SupportContact,
		"device_register":              rpc.DeviceRegister,
		"device_multi_account_list":    rpc.DeviceMultiAccountList,
		"commentary_generate":          rpc.CommentaryGenerate,
		"rakeback_process_all":         rpc.RakebackProcessAll,
		"stats_global":                 rpc.StatsGlobal,
		"presence_online":              rpc.PresenceOnline,
		"site_settings_get":            rpc.SiteSettingsGet,
		// Tournaments expansion
		"tournament_status":    rpc.TournamentStatus,
		"tournament_balance":   rpc.TournamentBalance,
		"tournament_analytics": rpc.TournamentAnalytics,
		"tournament_finalize":  rpc.TournamentFinalize,
		"tournament_config":    rpc.TournamentConfig,
	}
	for id, fn := range rpcs {
		if err := initializer.RegisterRpc(id, fn); err != nil {
			return err
		}
	}

	if err := initializer.RegisterMatch(protocol.MatchModule, func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule) (runtime.Match, error) {
		return &holdem.Handler{}, nil
	}); err != nil {
		return err
	}

	if err := initializer.RegisterMatch(protocol.TournamentModule, func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule) (runtime.Match, error) {
		return &tournament.Handler{}, nil
	}); err != nil {
		return err
	}

	if err := initializer.RegisterMatchmakerMatched(onMatchmakerMatched); err != nil {
		return err
	}

	logger.Info("poker-next-gen backend-core loaded in %s (engine-math/rs_poker required — no local fallbacks)", time.Since(start))
	logger.Info(
		"registered schemas: clubs=%T owners=%T balances=%T rake=%T brackets=%T balancing=%T blinds=%T prizes=%T",
		models.Club{}, models.Owner{}, models.PlayerAllocatedBalance{}, models.CustomRakeConfiguration{},
		models.TournamentBracket{}, models.MultiTableBalancingRule{}, models.BlindTimer{}, models.PrizeDistributionPool{},
	)
	return nil
}

func onMatchmakerMatched(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, entries []runtime.MatchmakerEntry) (string, error) {
	if len(entries) == 0 {
		return "", runtime.NewError("no matchmaker entries", 3)
	}

	sb := int64(100)
	bb := int64(200)
	buyIn := int64(100000)
	clubID := ""
	for _, e := range entries {
		for k, v := range e.GetProperties() {
			switch k {
			case "buy_in_cents":
				switch n := v.(type) {
				case string:
					var parsed int64
					_ = json.Unmarshal([]byte(n), &parsed)
					if parsed > 0 {
						buyIn = parsed
					}
				case float64:
					if int64(n) > 0 {
						buyIn = int64(n)
					}
				}
			case "club_id":
				if s, ok := v.(string); ok {
					clubID = s
				}
			}
		}
	}

	params := map[string]interface{}{
		"room_id":     "matchmaker",
		"small_blind": sb,
		"big_blind":   bb,
		"buy_in":      buyIn,
	}
	if clubID != "" {
		params["club_id"] = clubID
	}

	matchID, err := nk.MatchCreate(ctx, protocol.MatchModule, params)
	if err != nil {
		return "", err
	}
	return matchID, nil
}
