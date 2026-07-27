<!--
  Work that is READY but deliberately not written, because it touches the frozen
  table. Owner's instruction, 2026-07-26: "leave all of the pokertable stuff
  alone until you and I work on the sound profile, chips, shuffling."

  Each item below is specified to the point where implementing it is mechanical:
  the exact file, the exact anchor, what changes, and what could go wrong. The
  point of writing it down rather than doing it is that these are the changes
  most likely to disturb a table that is finished and correct.

  Reviewed together before any of it is written.
-->

# Table-frozen work — specified, not built

Five items. Each was found while fixing something adjacent, verified against the
source, and then stopped at the freeze line.

**Freeze scope** — `frontend-table/src/features/table3d/**` and
`frontend-table/src/features/table/**`. The backend match handler
(`backend-core/match/holdem/`) is NOT frozen and has been edited this session.
Every commit is guarded by:

```
git diff --stat -- frontend-table/src/features/table3d/ frontend-table/src/features/table/
```

which must come back empty.

---

## 1. Club announcements on the felt

**Status:** the backend half is done and live. Only the felt read is missing.

`club_announcement_create` now resolves its audience, sends real Nakama
notifications (code 556, persistent), rate-limits per club, validates severity,
and renders its markdown through `InlineMarkup`. Players receive club
announcements in the notification bell today.

What they do **not** do is appear on the table.

**Why:** `features/table3d/overlays/overlaySession.ts:237` — `loadNews()` reads
the **platform** announcement list and nothing else:

```ts
const data = (await callSessionRpc("announcement_list", {})) as {
  announcements?: AnnouncementDTO[];
};
const first = (data.announcements ?? [])[0];
```

So a club broadcast with delivery style "Sleek overlay" or "Breaking news" —
which the composer offers and stores — reaches the bell and never the felt the
operator was picturing.

**The change.** One function. `loadNews` also calls `club_announcement_list` for
the table's `club_id` (already on the match label as `club_id`), merges the two
newest-first, and prefers the club one on a tie — a club notice is more specific
to the people at that table than a platform-wide one.

```
features/table3d/overlays/overlaySession.ts   loadNews()   ~15 lines
```

`BreakingNewsModal` needs no change: it already takes `{title, body, severity}`
and the club payload has all three. `severity` is now clamped server-side to
`info|warning|critical`, so the modal's existing switch covers every value it
can receive — that was not true before (the in-table composer wrote `"high"`,
which no branch recognised).

**Decisions to make together**
- Should a club announcement interrupt a hand in progress, or queue to the next
  hand break? The platform one currently interrupts.
- Does delivery style actually differ on the felt — sleek overlay vs breaking
  news vs table-chat line — or do all three render the same modal? The composer
  sells three; only one exists.

**Risk if done carelessly:** `loadNews` runs on a timer inside the live table
session. A second RPC per tick on every table is real load, and a slow club
lookup would stall the news poll. Wants a single merged call or a cache.

---

## 2. Avatar dye at the seat

**Status:** the studio half is done. The dye never reaches the table.

`cosmetic_dye_set` stores the dye, `cosmetic_dye_get` reads it back, and the Dye
Shop now hydrates from it (fixed this session — it used to open on hardcoded
gold/red/cyan, so a player who reloaded believed their dye was lost).

But a player's colours are applied in the studio and **invisible at the seat**,
which is the only place they are bought for.

**Why:** `protocol.SeatView` carries `model_url` and no dye:

```go
ModelURL string `json:"model_url,omitempty"` // equipped 3D character GLB
```

**The change, in two halves.**

*Backend (not frozen, could be done now):* `equippedModelURL` in
`match/holdem/handler.go` already looks up the equipped cosmetic per seat. It
would also read `EconomyExtStore.DyeGet(userID, cosmeticID)` and populate a new
`SeatView.Dye` field (`{primary, secondary, accent}`).

*Frontend (frozen):* `GlbFigure` applies the three channels to the GLB's
materials; `SeatPortrait2D` tints the ring/glow to the primary.

**I deliberately did not do the backend half either.** Adding `SeatView.Dye`
that no renderer reads would be exactly the present-but-inert defect this whole
pass has been removing — an unread field is not progress. Both halves land
together or neither does.

**Decisions to make together**
- Which materials does the primary/secondary/accent map onto for a Tripo GLB?
  The models are generated, so the material names are not fixed — this may need
  a convention (first material = primary, etc.) or a per-model mapping.
- 2.5D portraits are pre-rendered WebP. Dye can only tint the ring/glow there,
  not the character. Is a ring-only tint honest enough, or does dye become a
  3D-mode-only feature (and say so in the shop)?

---

## 3. Rendered table thumbnails

**Status:** blocked on a renderer that does not exist. This is the one that
blocks the most.

Four parity rows need a grid of small live tables:

| Row | Needs |
|---|---|
| `dpts_1` Tournament Center | grid of table thumbnails with prize pool, fill, blinds |
| `dpts_5` Club Overview | Featured Tables thumbnail grid |
| `dpts_7` Public Table Browser | owner-side browser, thumbnails with LIVE badges |
| `fbapt_12` | in-tournament leaderboard podium |

Our only table renderer is the R3F `<Canvas>`, and a dozen WebGL contexts on one
page is not viable — browsers cap them (typically 8–16) and silently drop the
oldest.

**HRC solved this** and their approach is in the parity review
(`docs/HRC-PARITY-REVIEW.md`, "The rendering finding"): a pre-rendered plate
image plus percentage-coordinate DOM overlays, with a hand-tuned per-seat scale
ramp (`1.0` at the hero seat down to `0.83` at 12 o'clock) doing the entire
foreshortening effect, and CSS `rotateX(55deg)` on flat SVG for chip stacks.
Zero WebGL. Their shipped default table is this, with R3F behind a toggle.

**What we already have:** `features/table/bakedTable.ts` (plate config with
camera + seat ellipse) and the plate art in `public/table/`, including HRC's own
`poker-table-felt.webp`, already vendored.

**What is missing:** the canvas-free renderer. Ours composites an R3F `<Canvas>`
over the plate, which is exactly what a grid cannot afford.

**This does not violate the design-system rule.** CLAUDE.md non-negotiable #1
forbids "gradient divs or box-shadows pretending to be a 3D table" *for the live
table*, and already sanctions the baked plate as "an explicit opt-in PHOTOREAL
render… not a gradient-div faking the 3D felt". A pre-rendered plate is real 3D
art. The live cinematic table stays R3F — this is strictly for thumbnails and
multi-table views.

**Decisions to make together**
- Is a thumbnail interactive (click to sit) or purely a picture with a
  click-through? Interactive means seat hit-boxes at every scale.
- Live data or a snapshot? A dozen live-updating tables is a dozen subscriptions.

---

## 4. On-felt street scrubber (`_6` / `_7`)

A scrub bar over the current hand's streets, on the felt.

Small in isolation, but it lives inside the live table's HUD and competes for
the same bottom-centre space as the action bar. The hand replayer
(`features/hands/HandReplayer.tsx`) already does the reconstruction from the
audit chain and could supply the data — this is placement and interaction, not
new logic.

**Decision to make together:** where does it go without crowding the action bar,
and is it visible during a live hand or only after the hand completes? Showing a
scrubber mid-hand invites the question of whether you can scrub back while the
action is on you.

---

## 5. Player MENU dropdown (task #119) and felt panel rehoming (task #120)

Two pre-existing tasks in the same frozen area.

- **#119** — the HRC per-player menu (profile, note, mute, report) opened from a
  seat.
- **#120** — Profile gains Verification and Avatar tabs, and some panels
  currently on the felt move there.

#120 is half-doable now: the Profile tabs are outside the freeze. The "rehome
felt panels" half is not, and splitting it would leave the same panel in two
places until the second half lands, which is worse than waiting.

---

## Summary

| # | Item | Backend ready? | Blocked on |
|---|---|---|---|
| 1 | Club announcements on the felt | ✅ done and live | one function in `overlaySession.ts` |
| 2 | Avatar dye at the seat | ⚠️ deliberately not started | both halves must land together |
| 3 | Table thumbnails | n/a | a canvas-free renderer (biggest item) |
| 4 | Street scrubber | ✅ replayer exists | placement decision |
| 5 | Player menu / panel rehoming | n/a | freeze |

Item 3 is the one worth planning properly — it unblocks four parity rows and is
the only one that needs a new rendering approach rather than a wiring change.
