"use client";

// Renders the markup the announcement composer's toolbar actually produces.
//
// The B / I / U / link buttons have always worked — they wrap the selection in
// `**`, `*`, `__` and `[label](url)`. Nothing anywhere parsed them, so a player
// reading an announcement saw literal asterisks around the words the operator
// meant to emphasise.
//
// This deliberately produces REACT ELEMENTS, never an HTML string. The app has
// no sanitizer and no other use of dangerouslySetInnerHTML, and this is
// operator-authored text shown to every player in a club — the one place where
// introducing an HTML pipeline would be least defensible. Keeping the output as
// elements makes injection structurally impossible rather than filtered.

import { Fragment, type ReactNode } from "react";

/** Order matters: `**` must be tried before `*`, or bold parses as two italics. */
const RULES: { re: RegExp; render: (inner: ReactNode, key: number, href?: string) => ReactNode }[] = [
  {
    re: /\*\*([^*]+)\*\*/,
    render: (inner, key) => (
      <strong key={key} className="font-semibold text-white">
        {inner}
      </strong>
    ),
  },
  {
    re: /__([^_]+)__/,
    render: (inner, key) => (
      <span key={key} className="underline underline-offset-2">
        {inner}
      </span>
    ),
  },
  {
    re: /\*([^*]+)\*/,
    render: (inner, key) => <em key={key}>{inner}</em>,
  },
];

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/;

/**
 * Only http(s) links are rendered as links. `javascript:` and `data:` URLs are
 * the classic way a "safe" link renderer stops being safe, so anything that is
 * not an absolute http(s) URL falls back to plain text.
 */
function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parse(text: string, keySeed: number): ReactNode[] {
  // Links first — a label may itself contain emphasis, and matching emphasis
  // first would split the link syntax apart.
  const link = LINK_RE.exec(text);
  if (link) {
    const [full, label, href] = link;
    const before = text.slice(0, link.index);
    const after = text.slice(link.index + full.length);
    const url = safeHref(href);
    return [
      ...parse(before, keySeed * 3 + 1),
      url ? (
        <a
          key={`l${keySeed}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold underline underline-offset-2 hover:text-gold-lite"
        >
          {parse(label, keySeed * 3 + 2)}
        </a>
      ) : (
        // Not a usable link: show the operator's own text rather than dropping
        // it, so nothing they typed silently disappears.
        <Fragment key={`l${keySeed}`}>{full}</Fragment>
      ),
      ...parse(after, keySeed * 3 + 3),
    ];
  }

  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    return [
      ...parse(before, keySeed * 3 + 1),
      rule.render(parse(m[1], keySeed * 3 + 2), keySeed),
      ...parse(after, keySeed * 3 + 3),
    ];
  }

  return text ? [text] : [];
}

/**
 * Inline markup for announcement bodies. Newlines are preserved as line breaks
 * so an operator's paragraphs survive.
 */
export function InlineMarkup({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <span className={className}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {parse(line, i + 1)}
        </Fragment>
      ))}
    </span>
  );
}

/** Strips markers for places that need a bare string (previews, tooltips). */
export function stripMarkup(text: string): string {
  return text
    .replace(LINK_RE, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}
