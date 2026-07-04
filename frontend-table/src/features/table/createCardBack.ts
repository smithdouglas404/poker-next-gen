import { Container, Graphics } from "pixi.js";

import { TABLE_COLORS } from "./colors";

/** Rounded white card-back placeholder with blue hatch and gold medallion. */
export function createCardBack(width: number, height: number): Container {
  const card = new Container();
  const radius = Math.max(5, width * 0.1);
  const inset = Math.max(4, width * 0.07);

  const shadow = new Graphics();
  shadow
    .roundRect(-width / 2 + 2, -height / 2 + 3, width, height, radius)
    .fill({ color: 0x000000, alpha: 0.35 });
  card.addChild(shadow);

  const frame = new Graphics();
  frame
    .roundRect(-width / 2, -height / 2, width, height, radius)
    .fill({ color: 0xffffff });
  card.addChild(frame);

  const frameStroke = new Graphics();
  frameStroke
    .roundRect(-width / 2, -height / 2, width, height, radius)
    .stroke({ color: 0xe5e7eb, width: 2, alpha: 1 });
  card.addChild(frameStroke);

  const back = new Graphics();
  back
    .roundRect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2, radius * 0.75)
    .fill({ color: 0x1e3a8a });
  card.addChild(back);

  const diamond = Math.min(width, height) * 0.18;
  const medallion = new Graphics();
  medallion
    .poly([0, -diamond, diamond * 0.75, 0, 0, diamond, -diamond * 0.75, 0])
    .fill({ color: TABLE_COLORS.gold, alpha: 0.9 })
    .stroke({ color: 0xfef3c7, width: 1.5, alpha: 1 });
  card.addChild(medallion);

  const hatch = new Graphics();
  const left = -width / 2 + inset;
  const top = -height / 2 + inset;
  const innerW = width - inset * 2;
  const innerH = height - inset * 2;
  const step = Math.max(6, width * 0.14);

  for (let x = 0; x <= innerW + innerH; x += step) {
    hatch
      .moveTo(left + x, top)
      .lineTo(left + x - innerH, top + innerH)
      .stroke({ color: 0x60a5fa, width: 1, alpha: 0.4 });
  }

  card.addChild(hatch);
  return card;
}
