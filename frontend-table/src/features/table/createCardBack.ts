import { Container, Graphics } from "pixi.js";

import { TABLE_COLORS } from "./colors";

/** Rounded white card-back placeholder. */
export function createCardBack(width: number, height: number): Container {
  const card = new Container();
  const radius = Math.max(5, width * 0.1);
  const inset = Math.max(4, width * 0.08);

  const shadow = new Graphics();
  shadow
    .roundRect(-width / 2 + 2, -height / 2 + 3, width, height, radius)
    .fill({ color: 0x000000, alpha: 0.3 });
  card.addChild(shadow);

  const body = new Graphics();
  body
    .roundRect(-width / 2, -height / 2, width, height, radius)
    .fill({ color: 0xffffff })
    .stroke({ color: 0xd1d5db, width: 2, alpha: 1 });
  card.addChild(body);

  const inner = new Graphics();
  inner
    .roundRect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2, radius * 0.7)
    .fill({ color: 0xf8fafc })
    .stroke({ color: 0xe2e8f0, width: 1.5, alpha: 1 });
  card.addChild(inner);

  const emblem = Math.min(width, height) * 0.16;
  const mark = new Graphics();
  mark
    .roundRect(-emblem, -emblem * 1.2, emblem * 2, emblem * 2.4, emblem * 0.25)
    .fill({ color: 0x1e3a8a, alpha: 0.9 })
    .stroke({ color: TABLE_COLORS.gold, width: 1.5, alpha: 0.9 });
  card.addChild(mark);

  return card;
}
