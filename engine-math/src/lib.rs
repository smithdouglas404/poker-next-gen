//! Mathematical engine for Poker Next-Gen.
//!
//! Thin, well-typed wrappers over the [`rs_poker`] core so the rest of the
//! network (Go backend via FFI, or a future WASM frontend module) can evaluate
//! and compare Texas Hold'em hands without re-implementing hand ranking.

use rs_poker::core::{Hand, Rank, Rankable};
use rs_poker::holdem::MonteCarloGame;
use rs_poker::omaha::OmahaHand;
use sha2::{Digest, Sha256};

#[cfg(test)]
use rs_poker::core::CoreRank;

/// Evaluate the best 5-card poker [`Rank`] from a string of cards.
///
/// Cards are two-character codes (value + suit), e.g. `"AsKsQsJsTs"`.
/// Accepts 5, 6, or 7 cards (hole + board) and returns the strongest rank.
///
/// # Errors
/// Returns `Err` if the card string cannot be parsed.
pub fn rank_hand(cards: &str) -> Result<Rank, String> {
    let hand = Hand::new_from_str(cards).map_err(|e| format!("invalid hand '{cards}': {e:?}"))?;
    if hand.count() < 5 {
        return Err(format!("need at least 5 cards, got {}", hand.count()));
    }
    Ok(hand.rank())
}

/// Compare two hands and report which is stronger.
///
/// Returns [`std::cmp::Ordering`] where `Greater` means `a` beats `b`.
///
/// # Errors
/// Returns `Err` if either hand fails to parse.
pub fn compare_hands(a: &str, b: &str) -> Result<std::cmp::Ordering, String> {
    Ok(rank_hand(a)?.cmp(&rank_hand(b)?))
}

const RANKS: [char; 13] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: [char; 4] = ['s', 'h', 'd', 'c'];

fn hand_from_hole_and_board(hole: &str, board: &str) -> Result<Hand, String> {
    Hand::new_from_str(&format!("{hole}{board}"))
        .map_err(|e| format!("invalid cards '{hole}'+'{board}': {e:?}"))
}

/// Monte Carlo equity for each player hole (board may be partial pre-river).
pub fn estimate_equity(holes: &[&str], board: &str, iterations: usize) -> Result<Vec<f32>, String> {
    if holes.len() < 2 {
        return Err("need at least two hands for equity".into());
    }
    let hands: Vec<Hand> = holes
        .iter()
        .map(|h| hand_from_hole_and_board(h, board))
        .collect::<Result<_, _>>()?;
    let mut game = MonteCarloGame::new(hands).map_err(|e| format!("monte carlo setup: {e:?}"))?;
    let iters = iterations.clamp(100, 50_000);
    Ok(game.estimate_equity(iters))
}

/// Showdown winner seat indices (0-based into `holes`); ties return multiple indices.
pub fn showdown_winners(holes: &[&str], board: &str) -> Result<Vec<usize>, String> {
    if holes.is_empty() {
        return Ok(vec![]);
    }
    let mut ranked: Vec<(usize, Rank)> = Vec::with_capacity(holes.len());
    for (i, hole) in holes.iter().enumerate() {
        let rank = rank_hand(&format!("{hole}{board}"))?;
        ranked.push((i, rank));
    }
    let best = ranked
        .iter()
        .map(|(_, r)| r)
        .max()
        .cloned()
        .unwrap_or(Rank::HIGH_CARD_MIN);
    Ok(ranked
        .into_iter()
        .filter(|(_, r)| *r == best)
        .map(|(i, _)| i)
        .collect())
}

/// Batch rank categories for multiple 7-card (or 5+) strings.
pub fn batch_rank(cards: &[&str]) -> Result<Vec<String>, String> {
    cards
        .iter()
        .map(|c| rank_hand(c).map(|r| format!("{:?}", r.category())))
        .collect()
}

/// Cryptographically secure 52-card deck as two-char codes (e.g. "As", "Td").
pub fn shuffle_deck() -> Vec<String> {
    use rand::seq::SliceRandom;
    let mut cards: Vec<String> = Vec::with_capacity(52);
    for &r in &RANKS {
        for &s in &SUITS {
            cards.push(format!("{r}{s}"));
        }
    }
    cards.shuffle(&mut rand::rngs::OsRng);
    cards
}

/// SHA-256 commitment over canonical deck order (concatenated card codes).
pub fn deck_commitment(cards: &[String]) -> String {
    let joined = cards.join("");
    let digest = Sha256::digest(joined.as_bytes());
    hex::encode(digest)
}

/// Rank an Omaha hand (PLO4–PLO7): exactly two hole cards + three board cards.
pub fn rank_omaha(hole: &str, board: &str) -> Result<Rank, String> {
    let hand = OmahaHand::new_from_str(hole, board)
        .map_err(|e| format!("invalid omaha hand '{hole}'+'{board}': {e:?}"))?;
    Ok(hand.rank())
}

/// Omaha showdown winner indices (0-based into `holes`).
pub fn omaha_showdown_winners(holes: &[&str], board: &str) -> Result<Vec<usize>, String> {
    if holes.is_empty() {
        return Ok(vec![]);
    }
    let mut ranked: Vec<(usize, Rank)> = Vec::with_capacity(holes.len());
    for (i, hole) in holes.iter().enumerate() {
        let rank = rank_omaha(hole, board)?;
        ranked.push((i, rank));
    }
    let best = ranked
        .iter()
        .map(|(_, r)| r)
        .max()
        .cloned()
        .unwrap_or(Rank::HIGH_CARD_MIN);
    Ok(ranked
        .into_iter()
        .filter(|(_, r)| *r == best)
        .map(|(i, _)| i)
        .collect())
}

/// GTO-style action advice via Monte Carlo equity vs pot odds (CFR-lite approximation).
pub fn gto_advise(
    hero_hole: &str,
    villain_holes: &[&str],
    board: &str,
    pot: f64,
    to_call: f64,
    iterations: usize,
) -> Result<GtoAdvice, String> {
    if hero_hole.is_empty() {
        return Err("hero hole required".into());
    }
    let mut holes: Vec<&str> = vec![hero_hole];
    holes.extend(villain_holes.iter().copied());
    if holes.len() < 2 {
        return Err("need at least one villain for GTO advise".into());
    }
    let eq = estimate_equity(&holes, board, iterations)?;
    let hero_eq = eq[0] as f64;
    let pot_odds = if to_call > 0.0 {
        to_call / (pot + to_call)
    } else {
        0.0
    };
    let ev_call = hero_eq * (pot + to_call) - to_call;
    let mut suggested = "check".to_string();
    let mut rationale = format!(
        "hero equity {:.1}% vs pot odds {:.1}%",
        hero_eq * 100.0,
        pot_odds * 100.0
    );
    if to_call <= 0.0 {
        if hero_eq > 0.55 {
            suggested = "bet".to_string();
            rationale.push_str("; strong equity favors value bet");
        } else {
            suggested = "check".to_string();
            rationale.push_str("; marginal equity — pot control");
        }
    } else if hero_eq >= pot_odds + 0.05 {
        suggested = "call".to_string();
        rationale.push_str("; equity exceeds pot odds");
    } else if hero_eq < pot_odds - 0.05 {
        suggested = "fold".to_string();
        rationale.push_str("; equity below pot odds");
    } else {
        suggested = "call".to_string();
        rationale.push_str("; close spot — mixed strategy call");
    }
    Ok(GtoAdvice {
        suggested_action: suggested,
        hero_equity: hero_eq,
        pot_odds,
        ev_call,
        engine: "rs_poker_equity".to_string(),
        note: "CFR solver available in rs_poker arena; this endpoint uses equity approximation".to_string(),
        rationale,
    })
}

/// Action recommendation from equity vs pot odds.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GtoAdvice {
    pub suggested_action: String,
    pub hero_equity: f64,
    pub pot_odds: f64,
    pub ev_call: f64,
    pub engine: String,
    pub note: String,
    pub rationale: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cmp::Ordering;

    #[test]
    fn royal_flush_ranks() {
        let rank = rank_hand("AsKsQsJsTs").expect("valid hand");
        // A royal/straight flush is the strongest category rs_poker knows.
        assert_eq!(rank.category(), CoreRank::StraightFlush);
    }

    #[test]
    fn straight_flush_beats_full_house() {
        let ord = compare_hands("AsKsQsJsTs", "AhAdAcKhKd").expect("valid hands");
        assert_eq!(ord, Ordering::Greater);
    }

    #[test]
    fn equity_favors_pair_over_high_card() {
        let eq = estimate_equity(&["AsAh", "7c2d"], "", 500).expect("equity");
        assert!(eq[0] > eq[1]);
    }

    #[test]
    fn showdown_picks_winner() {
        let winners = showdown_winners(&["AsAh", "7c2d"], "AdKhQhJs2c").expect("showdown");
        assert_eq!(winners, vec![0]);
    }

    #[test]
    fn shuffle_commitment_is_stable() {
        let cards: Vec<String> = (0..52).map(|i| format!("{i:02}")).collect();
        let h1 = deck_commitment(&cards);
        let h2 = deck_commitment(&cards);
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
    }

    #[test]
    fn omaha_ranks_hand() {
        let rank = rank_omaha("AhAsKhKs", "QhJhTh").expect("omaha rank");
        assert!(format!("{:?}", rank.category()).contains("Flush") || format!("{:?}", rank.category()).contains("Straight"));
    }
}
