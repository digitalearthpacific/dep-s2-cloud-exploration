/** Port of dep-geomad src/utils.py::mask_clouds core (per-class morphology, then union). */
import { applyOps } from './morph.js';

export const SCL = [
  { value: 0, name: 'no data', color: '#000000' },
  { value: 1, name: 'saturated or defective', color: '#ff0000' },
  { value: 2, name: 'dark area pixels', color: '#2f2f2f' },
  { value: 3, name: 'cloud shadows', color: '#643200' },
  { value: 4, name: 'vegetation', color: '#00a000' },
  { value: 5, name: 'not vegetated', color: '#ffe65a' },
  { value: 6, name: 'water', color: '#0000ff' },
  { value: 7, name: 'unclassified', color: '#808080' },
  { value: 8, name: 'cloud medium probability', color: '#c0c0c0' },
  { value: 9, name: 'cloud high probability', color: '#ffffff' },
  { value: 10, name: 'thin cirrus', color: '#64c8ff' },
  { value: 11, name: 'snow', color: '#ff96ff' },
];

// { sclValue: { open, dilate } } — opening (radius, kills speckle) then dilation (radius, grows
// edges), each 0 to skip. Only listed classes are masked. Mirrors dep-geomad DEFAULT_MASK_FILTERS.
const OLD_FILTERS = {
  1: { open: 1, dilate: 1 },
  3: { open: 0, dilate: 5 },
  8: { open: 5, dilate: 5 },
  9: { open: 5, dilate: 5 },
  10: { open: 0, dilate: 5 },
};
export const PRESETS = {
  OLD: OLD_FILTERS,
  // Drops cloud shadow (3) and thin cirrus (10): Sen2Cor labels dark ocean as both. Tuned by
  // hand against real Pacific scenes, 2026-09-18. Classes 8/9 (cloud medium/high probability)
  // are the hardest to get right: over atolls, 3/3/3 balances stripping thin beach/reef false
  // positives (opening) against consolidating patchy mountain-mist detections (closing) —
  // still open whether mountainous scenes need a different setting; see mountain testing.
  NEW: {
    1: { open: 1, dilate: 1 },
    8: { open: 3, close: 3, dilate: 3 },
    9: { open: 3, close: 3, dilate: 3 },
  },
};
export const DEFAULT_PRESET = 'NEW';

/** { open, close, dilate } → ordered [[op, radius], ...] for applyOps, in that order:
 * opening first (kill speckle), closing second (fill interior holes), dilation last (grow the
 * halo). Each 0 skips that step; presets that predate `close` simply omit the key. */
export function toOps({ open = 0, close = 0, dilate = 0 }) {
  const ops = [];
  if (open > 0) ops.push(['opening', open]);
  if (close > 0) ops.push(['closing', close]);
  if (dilate > 0) ops.push(['dilation', dilate]);
  return ops;
}

/** Returns { mask, perClass: { value: Uint8Array } }. */
export function maskClouds(scl, w, h, filters) {
  const mask = new Uint8Array(w * h);
  const perClass = {};
  for (const [value, f] of Object.entries(filters)) {
    const v = Number(value);
    let m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = scl[i] === v ? 1 : 0;
    m = applyOps(m, w, h, toOps(f));
    perClass[v] = m;
    for (let i = 0; i < m.length; i++) if (m[i]) mask[i] = 1;
  }
  return { mask, perClass };
}
