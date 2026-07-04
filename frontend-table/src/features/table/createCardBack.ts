import { Container, Graphics } from "pixi.js";

import { TABLE_COLORS } from "./colors";

/** Rounded white card-back placeholder with a simple geometric pattern. */
export function createCardBack(width: number, height: number): Container {
  const card = new Container();
  const radius = Math.max(4, width * 0.08);
  const inset = Math.max(3, width * 0.06);

  const frame = new Graphics();
  frame
    .roundRect(-width / 2, -height / 2, width, height, radius)
    .fill({ color: 0xffffff })
    .stroke({ color: 0xd1d5db, width: 1.5, alpha: 0.95 });
  card.addChild(frame);

  const back = new Graphics();
  back
    .roundRect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2, radius * 0.75)
    .fill({ color: 0x1e3a8a });
  card.addChild(back);

  const pattern = new Graphics();
  const innerW = width - inset * 2;
  const innerH = height - inset * 2;

  // Diagonal hatch lines for a classic card-back feel.
  for (let i = -innerH; i < innerW + innerH; i += width * 0.18) {
    pattern
      .moveTo(-width / 2 + inset + i, -height / 2 + inset)
      .lineTo(-width / 2 + inset + i - innerH, -height / 2 + inset + innerH)
      .stroke({ color: 0x3b82f6, width: 1, alpha: 0.35 });
  }

  // Center diamond medallion.
  const diamond = Math.min(innerW, innerH) * 0.22;
  pattern
    .poly([
      0,
      -diamond,
      diamond * 0.75,
      0,
      0,
      diamond,
      -diamond * 0.75,
      0,
    ])
    .fill({ color: TABLE_COLORS.gold, alpha: 0.85 })
    .stroke({ color: 0xfef3c7, width: 1, alpha: 0.9 });

  card.addChild(pattern);
  return card;
}
