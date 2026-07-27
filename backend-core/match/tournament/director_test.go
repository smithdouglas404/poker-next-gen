package tournament

import "testing"

// pickMergeTarget backs rebalance's table-break merge: it must never return the
// table being broken as its own merge destination. The old rebalance code chose
// a single global "smallest table" index before deciding which table to break,
// so whenever the smallest table overall was also the one selected to break —
// the common case, since being smallest is exactly why it gets broken — it
// merged a table into itself. That merge was a silent no-op, but the table was
// still dropped from the director's TableMatches afterward, permanently cutting
// its still-live players off from every future blind update.
func TestPickMergeTarget_NeverReturnsTheSkippedTable(t *testing.T) {
	cases := []struct {
		name       string
		seatCounts []int
		skip       int
		want       int
	}{
		{"skip is the global minimum: target is next-smallest, not itself", []int{5, 5, 2}, 2, 0},
		{"skip is not the minimum: target is the true minimum elsewhere", []int{5, 5, 2}, 0, 2},
		{"tie for minimum excluding skip: first tie wins", []int{2, 5, 2}, 0, 2},
		{"only one other table: it is the target regardless of count", []int{2, 9}, 0, 1},
		{"skip is the only table: nothing to merge into", []int{3}, 0, -1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := pickMergeTarget(tc.seatCounts, tc.skip)
			if got == tc.skip {
				t.Fatalf("pickMergeTarget(%v, skip=%d) = %d — merged the broken table into itself",
					tc.seatCounts, tc.skip, got)
			}
			if got != tc.want {
				t.Fatalf("pickMergeTarget(%v, skip=%d) = %d, want %d", tc.seatCounts, tc.skip, got, tc.want)
			}
		})
	}
}
