/**
 * One monochrome stroke icon set.
 *
 * The owner console nav was `▦ ▤ ♛ ☰ ♦ 📣 📊 ▧ ⚙` — box-drawing characters,
 * a chess piece, and two full-colour emoji, side by side on the nav of every
 * owner page. Emoji render in the vendor's own palette, so `📣` and `📊` were
 * the only saturated non-brand colour on the screen and they sat next to
 * hairline glyphs that all but disappeared.
 *
 * These are 20x20, 1.6 stroke, `currentColor`, so the nav tints them (gold when
 * active, neutral otherwise) instead of each icon bringing its own colour.
 */

type P = { className?: string };

function Svg({ children, className }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

/** Club overview — a dashboard grid. */
export const IconOverview = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
    <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
  </Svg>
);

/** Live tables — a felt oval. */
export const IconTables = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="5.5" width="16" height="9" rx="4.5" />
    <circle cx="10" cy="10" r="1.2" />
  </Svg>
);

/** Tournament centre — a trophy. */
export const IconTrophy = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h8v4a4 4 0 0 1-8 0V3Z" />
    <path d="M6 4.5H3.5V6a2.5 2.5 0 0 0 2.5 2.5M14 4.5h2.5V6A2.5 2.5 0 0 1 14 8.5" />
    <path d="M10 11v3M7 17h6M8 14h4l.5 3h-5L8 14Z" />
  </Svg>
);

/** Member registry — people. */
export const IconMembers = (p: P) => (
  <Svg {...p}>
    <circle cx="7.5" cy="6.5" r="2.75" />
    <path d="M2.5 16.5c0-2.6 2.2-4.5 5-4.5s5 1.9 5 4.5" />
    <path d="M13.5 4.4a2.75 2.75 0 0 1 0 5.2M14.5 12.3c1.9.5 3 2.1 3 4.2" />
  </Svg>
);

/** Operators & equity — a shield with a split. */
export const IconOperators = (p: P) => (
  <Svg {...p}>
    <path d="M10 2.5 16.5 5v5.2c0 3.4-2.6 6.1-6.5 7.3-3.9-1.2-6.5-3.9-6.5-7.3V5L10 2.5Z" />
    <path d="M10 6v8" />
  </Svg>
);

/** Announcements — a megaphone, replacing the emoji. */
export const IconAnnounce = (p: P) => (
  <Svg {...p}>
    <path d="M3 8.5v3a1.5 1.5 0 0 0 1.5 1.5H6l7.5 3.5V5L6 8.5H4.5A1.5 1.5 0 0 0 3 8.5Z" />
    <path d="M16.5 8a3 3 0 0 1 0 4M6 13v3.5" />
  </Svg>
);

/** Member analytics — a bar chart, replacing the emoji. */
export const IconAnalytics = (p: P) => (
  <Svg {...p}>
    <path d="M3 17h14" />
    <path d="M6 17V9.5M10 17V4.5M14 17v-5" />
  </Svg>
);

/** Revenue reports — a document with a trend line. */
export const IconRevenue = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 2.5h7l4 4v11h-11v-15Z" />
    <path d="M11 2.5v4.5h4.5" />
    <path d="M6.75 14l2-2.5 1.75 1.5 2.25-3" />
  </Svg>
);

/** Global settings — a gear. */
export const IconSettings = (p: P) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="2.75" />
    <path d="M10 1.8v2M10 16.2v2M3.2 6.1l1.7 1M15.1 12.9l1.7 1M3.2 13.9l1.7-1M15.1 7.1l1.7-1" />
  </Svg>
);

// The platform admin console carried the same defect as the owner hub, one nav
// over: `◎ ◈ ✦ ▤ ⚠ ❖ ✉ ◆ ♠ ★ ⚙ ⚖ ▦` — thirteen glyphs from four different
// Unicode blocks, at four apparent weights, several of which the font renders
// in colour. These five complete the set so both consoles draw from one family.

/** Anti-cheat / flags — a warning triangle. */
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M10 3.2 18 16.2H2L10 3.2Z" />
    <path d="M10 8.2v3.4M10 14.1h.01" />
  </Svg>
);

/** Support — an envelope. */
export const IconMail = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
    <path d="m3.2 5.8 6.8 5 6.8-5" />
  </Svg>
);

/** Withdrawals / wallet — a billfold with a clasp. */
export const IconWallet = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="15" height="10.5" rx="2" />
    <path d="M2.5 8.5h15" />
    <circle cx="14" cy="12" r="1.1" />
  </Svg>
);

/** Ledger / settlements — a balance scale. */
export const IconLedger = (p: P) => (
  <Svg {...p}>
    <path d="M10 3.2v13.6M6 16.8h8" />
    <path d="M3.5 6.5h13" />
    <path d="M3.5 6.5 1.8 11a2.4 2.4 0 0 0 3.4 0L3.5 6.5ZM16.5 6.5 14.8 11a2.4 2.4 0 0 0 3.4 0L16.5 6.5Z" />
  </Svg>
);

/** Audit log — a document of ruled lines. */
export const IconAudit = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="2.5" width="13" height="15" rx="2" />
    <path d="M6.5 6.5h7M6.5 10h7M6.5 13.5h4" />
  </Svg>
);
