import { SCL } from './mask.js';

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const SCL_RGB = SCL.map((c) => hex(c.color));

/** RGB stretch; masked pixels are painted `maskColor`, or left transparent when it is null. */
export function rgbImage(tile, { max = 3000, mask = null, maskColor = null } = {}) {
  const { size, red, green, blue } = tile;
  const img = new ImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const nodata = red[i] === 0 && green[i] === 0 && blue[i] === 0;
    if (nodata) continue; // transparent
    if (mask && mask[i]) {
      if (!maskColor) continue;
      d[i * 4] = maskColor[0]; d[i * 4 + 1] = maskColor[1]; d[i * 4 + 2] = maskColor[2]; d[i * 4 + 3] = 255;
      continue;
    }
    d[i * 4] = Math.min(255, (red[i] / max) * 255);
    d[i * 4 + 1] = Math.min(255, (green[i] / max) * 255);
    d[i * 4 + 2] = Math.min(255, (blue[i] / max) * 255);
    d[i * 4 + 3] = 255;
  }
  return img;
}

export function sclImage(tile) {
  const { size, scl } = tile;
  const img = new ImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = SCL_RGB[scl[i]] ?? [255, 0, 255];
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = scl[i] === 0 ? 0 : 255;
  }
  return img;
}

export function maskImage(mask, size, color = [255, 0, 255]) {
  const img = new ImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    if (!mask[i]) continue;
    d[i * 4] = color[0]; d[i * 4 + 1] = color[1]; d[i * 4 + 2] = color[2]; d[i * 4 + 3] = 255;
  }
  return img;
}

/**
 * Per-channel median RGB composite across all tiles, using each tile's `mask` (a key into the
 * tile object, e.g. 'oldMask'/'newMask') to exclude cloud/shadow pixels — same nodata rule as
 * rgbImage. A pixel with no valid sample across every tile is left transparent.
 * ponytail: per-channel median, not a true joint geomedian (what dep-geomad actually computes) —
 * good enough for a quick visual compare; swap in a geomedian if channel-independent medians
 * introduce visible colour fringing.
 */
// Flagged, not left transparent, so a gap in coverage (every scene clouded/masked out at a
// pixel, or the point sitting near a scene edge) is obvious at a glance in the composite.
const NO_OBSERVATIONS_COLOR = [255, 136, 0];

export function medianRgbImage(tiles, maskKey, { max = 3000 } = {}) {
  if (!tiles.length) return null;
  const size = tiles[0].size;
  const img = new ImageData(size, size);
  const d = img.data;
  const n = tiles.length;
  const bufR = new Uint16Array(n), bufG = new Uint16Array(n), bufB = new Uint16Array(n);
  for (let i = 0; i < size * size; i++) {
    let count = 0;
    for (const t of tiles) {
      if (t[maskKey][i]) continue;
      const r = t.red[i], g = t.green[i], b = t.blue[i];
      if (r === 0 && g === 0 && b === 0) continue; // nodata
      bufR[count] = r; bufG[count] = g; bufB[count] = b; count++;
    }
    if (count === 0) {
      d[i * 4] = NO_OBSERVATIONS_COLOR[0]; d[i * 4 + 1] = NO_OBSERVATIONS_COLOR[1]; d[i * 4 + 2] = NO_OBSERVATIONS_COLOR[2];
      d[i * 4 + 3] = 255;
      continue;
    }
    d[i * 4] = Math.min(255, (medianOf(bufR, count) / max) * 255);
    d[i * 4 + 1] = Math.min(255, (medianOf(bufG, count) / max) * 255);
    d[i * 4 + 2] = Math.min(255, (medianOf(bufB, count) / max) * 255);
    d[i * 4 + 3] = 255;
  }
  return img;
}

// TypedArray#sort defaults to numeric ascending order (unlike Array#sort), so no comparator needed.
function medianOf(buf, count) {
  const sorted = buf.slice(0, count).sort();
  const mid = count >> 1;
  return count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function canvasFor(img, px = 160) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.style.width = c.style.height = `${px}px`;
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}
