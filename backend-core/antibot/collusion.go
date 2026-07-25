package antibot

import "math"

// Collusion detection heuristic (mirrors score.go's shape for bots, but for
// PAIRS). The core signal is a persistent one-way chip transfer between a fixed
// pair that keeps meeting — the chip-dumping / soft-play pattern that manual
// moderation can't catch at scale — optionally boosted when the two accounts
// share a device fingerprint. Conservative, documented thresholds: this queues a
// pair for HUMAN review (poker_collusion_flag), it never punishes automatically.

const (
	// MinCollusionHands: below this shared-hand count there isn't enough signal.
	MinCollusionHands = 15
	// collusionPerHandThresholdCents: one-way bleed that reads as dumping — about
	// one big blind per shared hand at $1/$2. Scales the transfer sub-score.
	collusionPerHandThresholdCents = 200.0
)

// CollusionSignal is the per-pair evidence fed to ScoreCollusion.
type CollusionSignal struct {
	Hands        int64
	NetACents    int64
	NetBCents    int64
	Showdowns    int64
	SharedDevice bool
}

// ScoreCollusion returns a 0–1 collusion-likelihood score for a player pair plus
// human-readable reasons.
func ScoreCollusion(s CollusionSignal) (float64, []string) {
	reasons := []string{}
	if s.Hands < MinCollusionHands {
		return 0, reasons
	}
	score := 0.0

	// (1) Persistent pairing — a fixed pair meeting for many hands is the
	// precondition for collusion; scales in with volume.
	pairing := math.Min(1, float64(s.Hands)/200.0)

	// (2) One-way chip transfer — opposite-signed nets mean chips flowed from the
	// loser to the winner across their shared hands. Magnitude per shared hand,
	// normalized against the dumping threshold.
	oneWay := (s.NetACents > 0) != (s.NetBCents > 0)
	if oneWay {
		transfer := math.Min(math.Abs(float64(s.NetACents)), math.Abs(float64(s.NetBCents)))
		perHand := transfer / float64(s.Hands)
		transferScore := math.Min(1, perHand/collusionPerHandThresholdCents)
		if transferScore > 0.15 {
			score += 0.55 * transferScore * (0.5 + 0.5*pairing)
			reasons = append(reasons, "persistent_one_way_chip_transfer")
		}
	}

	// (3) Showdown avoidance — colluders often win pots without showdown (soft
	// folds to a partner).
	if s.Hands >= 20 {
		sdRate := float64(s.Showdowns) / float64(s.Hands)
		if sdRate < 0.05 {
			score += 0.15
			reasons = append(reasons, "low_showdown_rate")
		}
	}

	// (4) Shared device fingerprint — a same-device pair is a strong
	// multi-account / collusion booster.
	if s.SharedDevice {
		score += 0.3
		reasons = append(reasons, "shared_device_fingerprint")
	}

	if score > 1 {
		score = 1
	}
	return score, reasons
}
