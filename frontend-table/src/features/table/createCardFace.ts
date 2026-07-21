import { Container, Graphics, Text } from "pixi.js";

import { createCardBack } from "./createCardBack";
import { suitColor } from "./deckStyle";

function parseCode(code: string): { rank: string; suit: string; color: number } {
  const suit = code.slice(-1);
  const rank = code.slice(0, -1);
  // Color honors the active deck style (two-color vs four-color).
  return { rank: rank === "T" ? "10" : rank, suit, color: suitColor(suit) };
}

/** Face-up or face-down playing card for canvas rendering. */
export function createCardFace(width: number, height: number, code: string, faceUp: boolean): Container {
  if (!faceUp) {
    return createCardBack(width, height);
  }

  const card = new Container();
  const radius = Math.max(5, width * 0.1);
  const { rank, suit, color } = parseCode(code);
  const suitSymbol = { s: "♠", h: "♥", d: "♦", c: "♣" }[suit] ?? "?";

  const body = new Graphics();
  body
    .roundRect(-width / 2, -height / 2, width, height, radius)
    .fill({ color: 0xffffff })
    .stroke({ color: 0xd1d5db, width: 2 });
  card.addChild(body);

  const rankText = new Text({
    text: `${rank}${suitSymbol}`,
    style: { fontFamily: "Arial", fontSize: Math.max(12, width * 0.28), fontWeight: "bold", fill: color },
  });
  rankText.anchor.set(0.5);
  card.addChild(rankText);

  return card;
}
