package poker

import (
	"fmt"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
)

// NewSecureDeck returns a shuffled 52-card deck from engine-math (rs_poker CSPRNG).
// There is no local fallback — engine-math must be reachable.
func NewSecureDeck() ([]Card, error) {
	codes, err := enginemath.ShuffleDeck()
	if err != nil {
		return nil, fmt.Errorf("engine-math shuffle: %w", err)
	}
	if len(codes) != 52 {
		return nil, fmt.Errorf("engine-math shuffle: expected 52 cards, got %d", len(codes))
	}
	deck, err := codesToDeck(codes)
	if err != nil {
		return nil, err
	}
	return deck, nil
}

func codesToDeck(codes []string) ([]Card, error) {
	deck := make([]Card, 0, len(codes))
	for _, code := range codes {
		if len(code) < 2 {
			return nil, fmt.Errorf("invalid card code %q", code)
		}
		rankChar := string(code[0])
		suitChar := string(code[len(code)-1])
		rank := 0
		switch rankChar {
		case "A":
			rank = 14
		case "K":
			rank = 13
		case "Q":
			rank = 12
		case "J":
			rank = 11
		case "T":
			rank = 10
		default:
			if rankChar >= "2" && rankChar <= "9" {
				rank = int(rankChar[0] - '0')
			}
		}
		suit := 0
		switch suitChar {
		case "s":
			suit = 0
		case "h":
			suit = 1
		case "d":
			suit = 2
		case "c":
			suit = 3
		}
		if rank == 0 {
			return nil, fmt.Errorf("invalid card rank in %q", code)
		}
		deck = append(deck, Card{Rank: rank, Suit: suit})
	}
	if len(deck) != 52 {
		return nil, fmt.Errorf("engine-math shuffle: parsed %d cards", len(deck))
	}
	return deck, nil
}
