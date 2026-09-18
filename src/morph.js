/**
 * Binary morphology with a disk footprint of radius r (same footprint as
 * skimage.morphology.disk used by odc.algo.mask_cleanup), implemented via an
 * exact Euclidean distance transform (Felzenszwalb & Huttenlocher) so cost is
 * O(n) per op regardless of radius.
 */

// Finite stand-in for +Infinity: Infinity - Infinity is NaN and breaks the parabola intersection.
const INF = 1e20;

// 1-D squared distance transform of f into d (INF = no source).
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      const p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s > z[k]) break;
      k--;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

/** Squared distance from each pixel to the nearest pixel where mask[i] != 0. */
export function edt2(mask, w, h) {
  const d = new Float64Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n), out = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {          // columns
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x] ? 0 : INF;
    edt1d(f, h, out, v, z);
    for (let y = 0; y < h; y++) d[y * w + x] = out[y];
  }
  for (let y = 0; y < h; y++) {          // rows
    for (let x = 0; x < w; x++) f[x] = d[y * w + x];
    edt1d(f, w, out, v, z);
    for (let x = 0; x < w; x++) d[y * w + x] = out[x];
  }
  return d;
}

export function dilate(mask, w, h, r) {
  if (r <= 0) return Uint8Array.from(mask);
  const d = edt2(mask, w, h), r2 = r * r, out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i] <= r2 ? 1 : 0;
  return out;
}

export function erode(mask, w, h, r) {
  if (r <= 0) return Uint8Array.from(mask);
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const d = edt2(inv, w, h), r2 = r * r, out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i] > r2 ? 1 : 0;
  return out;
}

export const OPS = {
  dilation: dilate,
  erosion: erode,
  opening: (m, w, h, r) => dilate(erode(m, w, h, r), w, h, r),
  closing: (m, w, h, r) => erode(dilate(m, w, h, r), w, h, r),
};

/** Apply an ordered list of [op, radius] to a binary mask. */
export function applyOps(mask, w, h, ops) {
  let m = mask;
  for (const [op, r] of ops) {
    if (!OPS[op]) throw new Error(`Unknown morphology op: ${op}`);
    m = OPS[op](m, w, h, r);
  }
  return m;
}
