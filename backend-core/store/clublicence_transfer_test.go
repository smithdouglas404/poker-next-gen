package store

import (
	"reflect"
	"testing"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
)

// Transfer promotes the recipient and DEMOTES the outgoing owner to manager, so
// working out who still carries the licence afterwards is the whole question.
// Get this wrong in the permissive direction and a club keeps running cash games
// with no licensed principal; get it wrong in the strict direction and a
// legitimate handover to a co-owner is refused for no reason.
func TestPostTransferOwnerSeats(t *testing.T) {
	owner := func(id, role string) models.Owner {
		return models.Owner{UserID: id, Role: role}
	}

	cases := []struct {
		name   string
		owners []models.Owner
		from   string
		to     string
		want   []string
	}{
		{
			name:   "sole owner hands over: only the recipient remains",
			owners: []models.Owner{owner("alice", "owner")},
			from:   "alice", to: "bob",
			want: []string{"bob"},
		},
		{
			name: "a second owner survives the transfer and can still license the club",
			owners: []models.Owner{
				owner("alice", "owner"),
				owner("carol", "owner"),
			},
			from: "alice", to: "bob",
			want: []string{"bob", "carol"},
		},
		{
			name: "managers and agents never enter the set, however senior",
			owners: []models.Owner{
				owner("alice", "owner"),
				owner("dan", "manager"),
				owner("erin", "moderator"),
				owner("finn", "agent"),
			},
			from: "alice", to: "bob",
			want: []string{"bob"},
		},
		{
			name: "recipient already holds an owner seat — counted once, not twice",
			owners: []models.Owner{
				owner("alice", "owner"),
				owner("bob", "owner"),
			},
			from: "alice", to: "bob",
			want: []string{"bob"},
		},
		{
			name: "the outgoing owner is gone from the set even with other seats present",
			owners: []models.Owner{
				owner("alice", "owner"),
				owner("carol", "manager"),
			},
			from: "alice", to: "bob",
			want: []string{"bob"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := PostTransferOwnerSeats(tc.owners, tc.from, tc.to)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("seats = %v, want %v", got, tc.want)
			}
			// The outgoing owner must never remain — they are demoted to manager,
			// and a manager carries no licence.
			for _, id := range got {
				if id == tc.from && tc.from != tc.to {
					t.Fatalf("outgoing owner %q still in the owner set", tc.from)
				}
			}
		})
	}
}

// Removal has no promotion to offset the loss, unlike transfer — so this is
// strictly "the remaining owner-role seats, minus one".
func TestPostRemovalOwnerSeats(t *testing.T) {
	owner := func(id, role string) models.Owner {
		return models.Owner{UserID: id, Role: role}
	}

	cases := []struct {
		name    string
		owners  []models.Owner
		removed string
		want    []string
	}{
		{
			name:    "sole owner removed leaves nobody",
			owners:  []models.Owner{owner("alice", "owner")},
			removed: "alice",
			want:    []string{},
		},
		{
			name: "a co-owner survives removal and can still license the club",
			owners: []models.Owner{
				owner("alice", "owner"),
				owner("carol", "owner"),
			},
			removed: "alice",
			want:    []string{"carol"},
		},
		{
			name: "managers and agents never enter the set, however senior",
			owners: []models.Owner{
				owner("alice", "owner"),
				owner("bob", "owner"),
				owner("dan", "manager"),
				owner("erin", "agent"),
			},
			removed: "alice",
			want:    []string{"bob"},
		},
		{
			name: "removing a manager leaves the owner set untouched",
			owners: []models.Owner{
				owner("alice", "owner"),
				owner("dan", "manager"),
			},
			removed: "dan",
			want:    []string{"alice"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := PostRemovalOwnerSeats(tc.owners, tc.removed)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("seats = %v, want %v", got, tc.want)
			}
			for _, id := range got {
				if id == tc.removed {
					t.Fatalf("removed owner %q still in the owner set", tc.removed)
				}
			}
		})
	}
}
