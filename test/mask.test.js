import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dilate, erode, applyOps } from '../src/morph.js';
import { maskClouds, toOps, PRESETS, DEFAULT_PRESET } from '../src/mask.js';

const sum = (a) => a.reduce((s, v) => s + v, 0);
const w = 11, h = 11, c = 5 * w + 5;
const dot = new Uint8Array(w * h); dot[c] = 1;

test('dilation matches skimage disk footprint sizes', () => {
  assert.equal(sum(dilate(dot, w, h, 1)), 5);   // disk(1)
  assert.equal(sum(dilate(dot, w, h, 2)), 13);  // disk(2)
  assert.equal(sum(dilate(dot, w, h, 3)), 29);  // disk(3)
});

test('erosion and opening remove speckle, closing fills a hole', () => {
  assert.equal(sum(erode(dot, w, h, 1)), 0);
  assert.equal(sum(applyOps(dot, w, h, [['opening', 1]])), 0);
  const ring = dilate(dot, w, h, 3); ring[c] = 0;
  assert.equal(applyOps(ring, w, h, [['closing', 1]])[c], 1);
});

test('maskClouds unions per-class masks after their own filters', () => {
  const scl = new Uint8Array(w * h); scl[c] = 9; scl[0] = 3;
  const { mask, perClass } = maskClouds(scl, w, h, { 9: { open: 0, dilate: 1 }, 3: { open: 0, dilate: 0 } });
  assert.equal(sum(perClass[9]), 5);
  assert.equal(sum(perClass[3]), 1);
  assert.equal(sum(mask), 6);
});

test('opening removes a lone pixel but keeps a blob; dilation grows it', () => {
  const scl = new Uint8Array(w * h); scl[c] = 9; // speckle
  for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) scl[y * w + x] = 8; // 3×3 blob
  const none = maskClouds(scl, w, h, { 8: { open: 0, dilate: 0 }, 9: { open: 0, dilate: 0 } });
  const opened = maskClouds(scl, w, h, { 8: { open: 1, dilate: 0 }, 9: { open: 1, dilate: 0 } });
  const dilated = maskClouds(scl, w, h, { 8: { open: 0, dilate: 1 }, 9: { open: 0, dilate: 1 } });
  assert.equal(sum(none.mask), 10);
  assert.equal(sum(opened.perClass[9]), 0);   // speckle gone
  assert.equal(sum(opened.perClass[8]), 5);   // 3×3 blob erodes to its centre, dilates back to disk(1)
  assert.ok(sum(dilated.mask) > sum(none.mask));
});

test('NEW preset drops cloud shadow and thin cirrus; OLD keeps them; NEW is the default', () => {
  assert.deepEqual(Object.keys(PRESETS.NEW), ['1', '8', '9']);
  assert.deepEqual(Object.keys(PRESETS.OLD), ['1', '3', '8', '9', '10']);
  assert.equal(DEFAULT_PRESET, 'NEW');
});

test('toOps orders opening, then closing, then dilation, skipping zeros', () => {
  assert.deepEqual(toOps({ open: 1, close: 2, dilate: 3 }), [['opening', 1], ['closing', 2], ['dilation', 3]]);
  assert.deepEqual(toOps({ open: 0, close: 2, dilate: 0 }), [['closing', 2]]);
  assert.deepEqual(toOps({}), []); // a preset written before `close` existed still works
});
