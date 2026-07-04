package poker

import "github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"

func shuffleFromEngine() ([]string, bool) {
	if !enginemath.Available() {
		return nil, false
	}
	cards, err := enginemath.ShuffleDeck()
	if err != nil || len(cards) != 52 {
		return nil, false
	}
	return cards, true
}
