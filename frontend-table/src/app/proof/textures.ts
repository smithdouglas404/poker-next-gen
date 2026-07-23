// Browser-side canvas texture builders for the cinematic proof (client-only).
import * as THREE from "three";

const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
// Four-color deck.
const SUIT_COLOR: Record<string, string> = { s: "#101317", h: "#e5484d", d: "#2f6bff", c: "#1fa85a" };

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function cardFaceTexture(code: string): THREE.CanvasTexture {
  const rank = code.slice(0, code.length - 1).toUpperCase().replace("T", "10");
  const suit = code.slice(-1).toLowerCase();
  const color = SUIT_COLOR[suit] ?? "#101317";
  const glyph = SUIT_GLYPH[suit] ?? "?";

  const W = 320, H = 448;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;

  // Card body with subtle vertical sheen.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#eef2f6");
  rounded(ctx, 6, 6, W - 12, H - 12, 34);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.10)"; ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.font = "bold 88px Georgia, 'Times New Roman', serif";
  ctx.fillText(rank, 26, 22);
  ctx.font = "72px Georgia, serif";
  ctx.fillText(glyph, 30, 118);

  // Big center pip.
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "230px Georgia, serif";
  ctx.globalAlpha = 0.96;
  ctx.fillText(glyph, W / 2, H / 2 + 24);
  ctx.globalAlpha = 1;

  // Bottom-right mirrored.
  ctx.save();
  ctx.translate(W - 26, H - 22); ctx.rotate(Math.PI);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.font = "bold 88px Georgia, serif"; ctx.fillText(rank, 0, 0);
  ctx.font = "72px Georgia, serif"; ctx.fillText(glyph, 4, 96);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function cardBackTexture(): THREE.CanvasTexture {
  const W = 320, H = 448;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  rounded(ctx, 6, 6, W - 12, H - 12, 34);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#3a0d12"); g.addColorStop(1, "#5c1420");
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 8;
  rounded(ctx, 26, 26, W - 52, H - 52, 22); ctx.stroke();
  // diamond lattice
  ctx.strokeStyle = "rgba(224,30,43,0.25)"; ctx.lineWidth = 2;
  for (let i = -H; i < W; i += 26) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + H, 0); ctx.lineTo(i, H); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Lush felt: radial center-bright/edge-dark green + faint weave noise + gold ring + club mark.
export function feltTexture(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.62);
  g.addColorStop(0, "#1c7d4e");
  g.addColorStop(0.55, "#0f5f39");
  g.addColorStop(1, "#053821");
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);

  // weave noise
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // gold inner ring line
  ctx.strokeStyle = "rgba(212,175,55,0.85)"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.40, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(212,175,55,0.30)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); ctx.stroke();

  // club mark (lion diamond)
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#d4af37";
  ctx.font = "bold 150px Georgia, serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("♦", 0, -6);
  ctx.globalAlpha = 0.5;
  ctx.font = "bold 34px 'Space Grotesk', Arial, sans-serif";
  ctx.fillText("HIGH ROLLERS", 0, 150);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
