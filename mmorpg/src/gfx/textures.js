import { THREE } from './common.js';
import { mulberry32 } from '../shared/world.js';

// ---- tileable value noise ----------------------------------------------
// u, v in [0,1); fx/fy are integer base frequencies so every octave tiles.
function tfbmTile(u, v, fx, fy, oct, seed) {
  let amp = 0.5, sum = 0, norm = 0, px = fx, py = fy;
  for (let i = 0; i < oct; i++) {
    const ix = u * px, iy = v * py;
    // tile with independent periods per axis
    const x0 = Math.floor(ix), y0 = Math.floor(iy), fxx = ix - x0, fyy = iy - y0;
    const ux = fxx * fxx * (3 - 2 * fxx), uy = fyy * fyy * (3 - 2 * fyy);
    const h = (a, b) => {
      a = ((a % px) + px) % px; b = ((b % py) + py) % py;
      let k = (a * 374761393 + b * 668265263 + (seed + i * 31) * 1274126177) | 0;
      k = Math.imul(k ^ (k >>> 13), 1274126177); k ^= k >>> 16;
      return (k >>> 0) / 4294967296;
    };
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    sum += amp * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy);
    norm += amp; amp *= 0.5; px *= 2; py *= 2;
  }
  return sum / norm;
}

function canvasOf(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function texFrom(canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// fn(u, v) -> [r, g, b] 0..1 (linear-ish artist values written straight to sRGB bytes), optional height
function paint(size, fn) {
  const c = canvasOf(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  const height = new Float32Array(size * size);
  const out = [0, 0, 0, 1, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x / size, y / size, out);
    const i = (y * size + x) * 4;
    d[i] = Math.max(0, Math.min(255, out[0] * 255));
    d[i + 1] = Math.max(0, Math.min(255, out[1] * 255));
    d[i + 2] = Math.max(0, Math.min(255, out[2] * 255));
    d[i + 3] = Math.max(0, Math.min(255, out[3] * 255));
    height[y * size + x] = out[4];
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, height };
}
function normalFrom(height, size, strength) {
  const c = canvasOf(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c, { srgb: false });
}
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildTextures() {
  const T = {};
  const S = 512;

  // generic tiling noise (R: fbm, G: finer fbm, B: ridged) used by shaders for wind, mist, variation
  {
    const p = paint(256, (u, v, o) => {
      const a = tfbmTile(u, v, 4, 4, 5, 3), b = tfbmTile(u, v, 16, 16, 3, 9);
      const r = 1 - Math.abs(tfbmTile(u, v, 6, 6, 4, 21) * 2 - 1);
      o[0] = a; o[1] = b; o[2] = r; o[3] = 1;
    });
    T.noise = texFrom(p.canvas, { srgb: false, aniso: 1 });
  }

  // packed dirt path
  {
    const rnd = mulberry32(5);
    const pebbles = Array.from({ length: 150 }, () => [rnd(), rnd(), 0.004 + rnd() * 0.012, rnd()]);
    const p = paint(S, (u, v, o) => {
      const n = tfbmTile(u, v, 6, 6, 5, 1), f = tfbmTile(u, v, 40, 40, 2, 2);
      let h = n * 0.7 + f * 0.3, peb = 0, tone = 0;
      for (const q of pebbles) {
        let dx = Math.abs(u - q[0]), dy = Math.abs(v - q[1]);
        if (dx > 0.5) dx = 1 - dx; if (dy > 0.5) dy = 1 - dy;
        const d = Math.hypot(dx, dy) / q[2];
        if (d < 1) { const k = Math.sqrt(1 - d * d); if (k > peb) { peb = k; tone = q[3]; } }
      }
      const base = mix(0.12, 0.27, h);
      let r = base * 1.0, g = base * 0.86, b = base * 0.74;
      if (peb > 0) { const s = mix(0.2, 0.34, tone) * (0.6 + peb * 0.4); r = mix(r, s, 0.7); g = mix(g, s * 0.97, 0.7); b = mix(b, s * 0.95, 0.7); }
      o[0] = r; o[1] = g; o[2] = b; o[3] = 1; o[4] = h * 0.6 + peb * 0.5;
    });
    T.dirt = texFrom(p.canvas);
    T.groundN = normalFrom(p.height, S, 2.6);
  }

  // mossy forest floor
  {
    const p = paint(S, (u, v, o) => {
      const n = tfbmTile(u, v, 5, 5, 5, 41), f = tfbmTile(u, v, 48, 48, 2, 43), m = tfbmTile(u, v, 3, 3, 3, 47);
      const litter = sstep(0.62, 0.7, tfbmTile(u, v, 64, 64, 2, 53));
      let r = mix(0.05, 0.13, n) + f * 0.03, g = mix(0.09, 0.2, n) + f * 0.05, b = mix(0.04, 0.08, n);
      const dry = sstep(0.5, 0.75, m);
      r = mix(r, r * 1.5 + 0.03, dry); g = mix(g, g * 1.05, dry);
      r = mix(r, 0.22, litter * 0.5); g = mix(g, 0.17, litter * 0.5); b = mix(b, 0.09, litter * 0.5);
      o[0] = r; o[1] = g; o[2] = b; o[3] = 1; o[4] = n;
    });
    T.moss = texFrom(p.canvas);
  }

  // bark
  {
    const p = paint(S, (u, v, o) => {
      const warp = tfbmTile(u, v, 3, 2, 3, 61) * 0.12;
      const ridge = 1 - Math.abs(tfbmTile(u + warp, v, 14, 2, 4, 67) * 2 - 1);
      const fine = tfbmTile(u, v, 48, 8, 2, 71);
      const h = Math.pow(ridge, 1.6) * 0.8 + fine * 0.2;
      const moss = sstep(0.55, 0.72, tfbmTile(u, v, 4, 3, 3, 73));
      let r = mix(0.07, 0.3, h), g = mix(0.055, 0.23, h), b = mix(0.045, 0.17, h);
      r = mix(r, 0.1, moss * 0.6); g = mix(g, 0.2, moss * 0.6); b = mix(b, 0.07, moss * 0.6);
      o[0] = r; o[1] = g; o[2] = b; o[3] = 1; o[4] = h;
    });
    T.bark = texFrom(p.canvas);
    T.barkN = normalFrom(p.height, S, 5.5);
  }

  // weathered stone
  {
    const p = paint(S, (u, v, o) => {
      const n = tfbmTile(u, v, 4, 4, 5, 81), f = tfbmTile(u, v, 36, 36, 3, 83);
      const crack = Math.pow(1 - Math.abs(tfbmTile(u, v, 5, 5, 4, 87) * 2 - 1), 14);
      const pit = sstep(0.68, 0.8, tfbmTile(u, v, 28, 28, 2, 89));
      const h = n * 0.55 + f * 0.45 - crack * 0.7 - pit * 0.35;
      const l = mix(0.26, 0.56, n * 0.6 + f * 0.4) * (1 - crack * 0.6) * (1 - pit * 0.3);
      const warm = tfbmTile(u, v, 3, 3, 2, 91);
      o[0] = l * mix(0.96, 1.08, warm); o[1] = l * 0.98; o[2] = l * mix(1.0, 0.86, warm); o[3] = 1; o[4] = h;
    });
    T.stone = texFrom(p.canvas);
    T.stoneN = normalFrom(p.height, S, 4.5);
  }

  // leaf sprig (alpha tested) — drawn with 2D canvas
  {
    const c = canvasOf(256), ctx = c.getContext('2d');
    const rnd = mulberry32(99);
    ctx.clearRect(0, 0, 256, 256);
    const leaf = (x, y, ang, len, w, col) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.45, -w, len, 0);
      ctx.quadraticCurveTo(len * 0.45, w, 0, 0);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
      ctx.restore();
    };
    for (let i = 0; i < 130; i++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 104, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
      const l = 150 + rnd() * 90 | 0, g = 170 + rnd() * 85 | 0;
      leaf(x, y, a + (rnd() - 0.5) * 1.6, 17 + rnd() * 15, 5 + rnd() * 4.5, `rgb(${l * 0.62 | 0},${g},${l * 0.5 | 0})`);
    }
    T.leaf = texFrom(c, { repeat: false, aniso: 4 });
  }

  // soft round sprite
  {
    const c = canvasOf(128), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    T.soft = texFrom(c, { repeat: false, aniso: 1 });
  }
  return T;
}
