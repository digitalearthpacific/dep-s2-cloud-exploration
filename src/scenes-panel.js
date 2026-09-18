/** Bottom panel: scene strip (RGB / SCL / mask / masked RGB) + decomposed per-class row. */
import { SCL, PRESETS, DEFAULT_PRESET, maskClouds, toOps } from './mask.js';
import { rgbImage, sclImage, maskImage, medianRgbImage, canvasFor } from './render.js';

const MASK_PINK = [255, 0, 255];
// Thin cirrus (10) is excluded from the interactive editor entirely — in practice, over the
// Pacific, it flags far more false positives than real ones (bright water/reef, mostly).
// PRESETS.OLD still lists it (unchanged, in mask.js) purely as the historical baseline the
// median-compare panel's OLD side reads directly from `mask.js`, not from this editor's state
// — so that comparison still shows the real difference dropping it makes.
const EDITABLE_CLASSES = SCL.filter((c) => c.value !== 0 && c.value !== 10);
const pct = (m) => ((m.reduce((s, v) => s + v, 0) / m.length) * 100).toFixed(1);
// Every values entry always has all three fields, even for a preset written before `close`
// existed or one that never mentions a given class — so a number input never renders blank.
const normalize = (f) => ({ open: 0, close: 0, dilate: 0, ...(f ?? {}) });

export function createScenesPanel(root) {
  const el = {
    status: root.querySelector('#scenes-status'),
    strip: root.querySelector('#strip'),
    decomposed: root.querySelector('#decomposed'),
    classes: root.querySelector('#classes'),
    classRows: root.querySelector('#class-rows'),
    sceneFilterSlider: root.querySelector('#scene-filter-slider'),
    sceneFilterValue: root.querySelector('#scene-filter-value'),
    recalculate: root.querySelector('#recalculate'),
    preset: root.querySelector('#preset'),
    view: root.querySelector('#view'),
    medianCompare: root.querySelector('#median-compare'),
    medianOld: root.querySelector('#median-old'),
    medianNew: root.querySelector('#median-new'),
    medianSlider: root.querySelector('#median-slider'),
    medianHandle: root.querySelector('#median-handle'),
  };
  // `values` remembers every class's open/dilate radii even while unchecked, so toggling
  // a class off and back on restores what was there rather than resetting to 0/0.
  // `enabled` is the set of SCL class values currently applied to the mask.
  const initial = structuredClone(PRESETS[DEFAULT_PRESET]);
  const state = {
    tiles: [],
    values: Object.fromEntries(EDITABLE_CLASSES.map((c) => [c.value, normalize(initial[c.value])])),
    // Excludes class 10 even if a chosen preset (OLD) lists it — see EDITABLE_CLASSES above.
    enabled: new Set(Object.keys(initial).map(Number).filter((v) => v !== 10)),
    selected: null,
    view: 'mask',
  };
  const currentFilters = () => Object.fromEntries([...state.enabled].map((v) => [v, state.values[v]]));

  // ── class / filter editor: one row per SCL class, opening radius then dilation radius ──
  // Unchecking a class disables its inputs but keeps their values (`state.values`), so
  // re-checking it restores what was there instead of resetting to 0/0.
  function renderClassEditor() {
    const head = document.createElement('div');
    head.className = 'class-row class-head';
    head.innerHTML = '<span></span><span></span><span>SCL class</span>'
      + '<span title="Opening radius (px): removes blobs smaller than this, applied first">open</span>'
      + '<span title="Closing radius (px): fills small holes without growing the boundary, applied second">close</span>'
      + '<span title="Dilation radius (px): grows the mask by this, applied last">dilate</span>';
    const rows = EDITABLE_CLASSES.map((c) => {
      const on_ = state.enabled.has(c.value);
      const row = document.createElement('label');
      row.className = 'class-row' + (on_ ? '' : ' off');
      const on = Object.assign(document.createElement('input'), { type: 'checkbox', checked: on_ });
      const sw = document.createElement('span');
      sw.className = 'swatch'; sw.style.background = c.color;
      const name = document.createElement('span');
      name.textContent = c.name;
      const num = (key) => {
        const i = Object.assign(document.createElement('input'), { type: 'number', min: 0, max: 25, step: 1, value: state.values[c.value][key], disabled: !state.enabled.has(c.value) });
        // Just records the value — press Recalculate to actually re-mask every scene with it.
        i.addEventListener('change', () => { state.values[c.value][key] = Math.max(0, Number(i.value) || 0); custom(); });
        return i;
      };
      on.addEventListener('change', () => {
        on.checked ? state.enabled.add(c.value) : state.enabled.delete(c.value);
        custom(); renderClassEditor();
      });
      row.append(on, sw, name, num('open'), num('close'), num('dilate'));
      return row;
    });
    el.classRows.replaceChildren(head, ...rows);
  }
  const custom = () => { el.preset.value = ''; };
  el.preset.replaceChildren(
    ...Object.keys(PRESETS).map((k) => Object.assign(document.createElement('option'), { value: k, textContent: k })),
    Object.assign(document.createElement('option'), { value: '', textContent: 'custom' }),
  );
  el.preset.value = DEFAULT_PRESET;
  el.preset.addEventListener('change', () => {
    const preset = PRESETS[el.preset.value];
    if (!preset) return;
    for (const c of EDITABLE_CLASSES) state.values[c.value] = normalize(preset[c.value]);
    // Excludes class 10 even for OLD, which does list it — see EDITABLE_CLASSES above.
    state.enabled = new Set(Object.keys(preset).map(Number).filter((v) => v !== 10));
    renderClassEditor();
  });
  // Live label only — like the class editor above, the filter itself doesn't apply until
  // Recalculate is pressed (a range input fires continuously while dragging; recomputing the
  // median on every tick of that would be far too much work for a slider drag).
  el.sceneFilterSlider.addEventListener('input', () => { el.sceneFilterValue.textContent = el.sceneFilterSlider.value; });
  el.recalculate.addEventListener('click', recomputeAll);
  // Display-only: which of the already-computed masks to draw, not a recompute.
  el.view.addEventListener('change', () => { state.view = el.view.value; renderStrip(); renderDecomposed(); });

  // ── median compare (far left): OLD vs NEW preset, fixed regardless of the live editor above ──
  const setWipe = (pct) => {
    el.medianNew.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    el.medianHandle.style.left = `${pct}%`;
  };
  el.medianSlider.addEventListener('input', () => setWipe(el.medianSlider.value));
  setWipe(el.medianSlider.value);

  // Force the median panel square by pinning both dimensions, in px, to #classes' own
  // rendered height. A CSS `aspect-ratio` on a grid item whose row height AND column width
  // are both auto/content-driven doesn't resolve reliably (each axis can be sized before the
  // other is known) — pin from a sibling that has no such ambiguity instead. Content-driven,
  // not viewport-driven: #classes' height comes from its fixed list of SCL rows.
  new ResizeObserver(() => {
    const h = el.classes.offsetHeight;
    if (h > 0) el.medianCompare.style.width = el.medianCompare.style.height = `${h}px`;
  }).observe(el.classes);

  // Computed once, after every scene has finished loading (see `renderMedian` below) — not
  // per tile as they stream in, so it never shows a partial, still-filling-in composite.
  // Scenes over the "exclude scenes over N% cloud" threshold are dropped from both composites
  // entirely (not just per-pixel masked) — the scene strip is untouched, this only affects
  // which scenes feed the median.
  function updateMedian() {
    const maxCloud = Number(el.sceneFilterSlider.value);
    const included = state.tiles.filter((t) => (t.item.properties['eo:cloud_cover'] ?? 0) <= maxCloud);
    const old = medianRgbImage(included, 'oldMask');
    const neu = medianRgbImage(included, 'newMask');
    for (const [canvas, img] of [[el.medianOld, old], [el.medianNew, neu]]) {
      if (!img) continue;
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').putImageData(img, 0, 0);
    }
  }

  // ── strip ──
  // ponytail: ~40 ms per 256² tile with the default preset, so ~3 s for a full year on the main thread;
  // move maskClouds into a Worker if filter edits feel sluggish.
  function compute(tile) {
    const t0 = performance.now();
    tile.result = maskClouds(tile.scl, tile.size, tile.size, currentFilters());
    tile.ms = performance.now() - t0;
    // The median panel's "NEW" side is *this* mask — whatever the live editor currently
    // produces (NEW preset by default, but tracks any custom tweak once Recalculate is
    // pressed) — not a second, separately-frozen copy that would silently go stale.
    tile.newMask = tile.result.mask;
  }

  // OLD mask for the median-compare panel: the fixed original recipe, computed once per tile
  // at load time. This is the one side of the comparison that's deliberately never editable.
  function computeOldMask(tile) {
    tile.oldMask = maskClouds(tile.scl, tile.size, tile.size, PRESETS.OLD).mask;
  }

  function column(tile) {
    const col = document.createElement('div');
    col.className = 'scene' + (state.selected === tile ? ' selected' : '');
    const p = tile.item.properties;
    const head = document.createElement('div');
    head.className = 'scene-head';
    head.innerHTML = `<b>${p.datetime.slice(0, 10)}</b><br>PB ${p['s2:processing_baseline']} · ${Math.round(p['eo:cloud_cover'])}% cloud<br>masked ${pct(tile.result.mask)}%`;
    col.append(head);
    // Two images per scene: SCL, then RGB with the mask either painted pink over it or cut out.
    col.append(canvasFor(sclImage(tile)));
    col.append(canvasFor(rgbImage(tile, { mask: tile.result.mask, maskColor: state.view === 'masked' ? null : MASK_PINK })));
    col.addEventListener('click', () => { state.selected = tile; renderStrip(); renderDecomposed(); });
    return col;
  }

  function renderStrip() {
    el.strip.replaceChildren(...state.tiles.map(column));
  }

  function renderDecomposed() {
    const tile = state.selected;
    if (!tile) { el.decomposed.replaceChildren(); return; }
    const cells = Object.entries(tile.result.perClass).map(([v, m]) => {
      const c = SCL[Number(v)];
      const cell = document.createElement('div');
      cell.className = 'scene';
      cell.innerHTML = `<div class="scene-head"><b>${c.name}</b><br>${toOps(state.values[v]).map(([o, r]) => `${o} ${r}`).join(', ') || 'no morphology'}<br>${pct(m)}%</div>`;
      cell.append(canvasFor(maskImage(m, tile.size, hexToRgb(c.color))));
      return cell;
    });
    const title = document.createElement('div');
    title.className = 'scene-head';
    title.innerHTML = `<b>${tile.item.properties.datetime.slice(0, 10)}</b><br>decomposed<br>${tile.ms.toFixed(0)} ms`;
    el.decomposed.replaceChildren(title, ...cells);
  }

  // The one place that actually re-masks every loaded scene and redraws the median compare —
  // deliberately not wired to every checkbox/number-input change (that was ~40ms × up to ~100
  // tiles per keystroke); the "Recalculate" button below the class list triggers this instead.
  function recomputeAll() {
    for (const t of state.tiles) compute(t);
    renderStrip();
    renderDecomposed();
    updateMedian();
  }

  renderClassEditor();

  return {
    setStatus(text) { el.status.textContent = text; },
    reset() {
      state.tiles = []; state.selected = null;
      renderStrip(); renderDecomposed();
      for (const canvas of [el.medianOld, el.medianNew]) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    },
    addTile(tile) {
      compute(tile);
      computeOldMask(tile);
      state.tiles.push(tile);
      state.tiles.sort((a, b) => a.item.properties.datetime.localeCompare(b.item.properties.datetime));
      renderStrip();
    },
    // Call once all scenes for this point/year have loaded (or failed/aborted) — draws the
    // OLD vs NEW median composite from whatever tiles did make it in.
    renderMedian: updateMedian,
  };
}

const hexToRgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
