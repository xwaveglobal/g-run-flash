/**
 * Canvas textures for the XWAVE X1 3D model (badge wordmark, carbon weave, tyre tread).
 * Used twice: by the model builder (scripts/car/) to embed them in the GLB, and at run time,
 * where the game applies them by material name — so the runtime never decodes images from the
 * GLB (works the same in the web build, the single-file build and the native TikTok build).
 */

type Canvas = HTMLCanvasElement;

function canvas(w: number, h: number): [Canvas, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** glowing XWAVE wordmark on a transparent background (the rear badge, 4:1) */
export function x1BadgeCanvas(): Canvas {
  const [c, g] = canvas(512, 128);
  g.clearRect(0, 0, 512, 128);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'italic 900 84px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  // soft blue halo, then the near-white letters (the master shows white letters with a blue glow)
  g.shadowColor = 'rgba(80,170,255,0.95)';
  g.shadowBlur = 18;
  g.fillStyle = '#9fd4ff';
  g.fillText('XWAVE', 256, 68);
  g.shadowBlur = 0;
  g.fillStyle = '#f4faff';
  g.fillText('XWAVE', 256, 68);
  return c;
}

/** 2×2 twill carbon weave, tileable */
export function x1CarbonCanvas(): Canvas {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#16181c';
  g.fillRect(0, 0, 128, 128);
  const cell = 16;
  for (let y = 0; y < 128; y += cell) {
    for (let x = 0; x < 128; x += cell) {
      const k = ((x + y) / cell) % 4 < 2;
      const gr = k ? g.createLinearGradient(x, y, x + cell, y) : g.createLinearGradient(x, y, x, y + cell);
      gr.addColorStop(0, '#1b1e23');
      gr.addColorStop(0.5, '#33373f');
      gr.addColorStop(1, '#1b1e23');
      g.fillStyle = gr;
      g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  }
  return c;
}

/** tyre tread: circumferential grooves + sipes, repeats around the tyre (u) — v runs across the width */
export function x1TreadCanvas(): Canvas {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#1a1b1e';
  g.fillRect(0, 0, 64, 256);
  // shoulders (sidewall) a little lighter
  g.fillStyle = '#202226';
  g.fillRect(0, 0, 64, 40);
  g.fillRect(0, 216, 64, 40);
  // three main grooves
  g.fillStyle = '#0b0b0d';
  for (const v of [92, 128, 164]) g.fillRect(0, v - 4, 64, 8);
  // diagonal sipes on the shoulders: these make the rotation visible
  g.strokeStyle = '#0d0d10';
  g.lineWidth = 4;
  for (let x = -16; x < 80; x += 16) {
    g.beginPath();
    g.moveTo(x, 44);
    g.lineTo(x + 10, 80);
    g.moveTo(x, 212);
    g.lineTo(x + 10, 176);
    g.stroke();
  }
  return c;
}

/**
 * v4.3 (Step 06 PBR): metallic-flake normal map for the paint's base coat (the clearcoat above stays
 * smooth). Tangent-space normals: flat background (128, 128, 255) with ~1,400 tiny flakes, each tilted
 * a little in a random direction — sparkle up close, averages out to flat in the mip chain (no
 * shimmer at distance). Deterministic; plain fillRect calls only (works with the native canvas).
 */
export function x1FlakeCanvas(): Canvas {
  const [c, g] = canvas(128, 128);
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, 128, 128);
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 1400; i++) {
    const a = rnd() * Math.PI * 2;
    const t = 0.25 + rnd() * 0.45; // tilt
    const nx = Math.cos(a) * t;
    const ny = Math.sin(a) * t;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    g.fillStyle = `rgb(${Math.round((nx * 0.5 + 0.5) * 255)},${Math.round((ny * 0.5 + 0.5) * 255)},${Math.round((nz * 0.5 + 0.5) * 255)})`;
    const sz = rnd() < 0.7 ? 1 : 2;
    g.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 128), sz, sz);
  }
  return c;
}
