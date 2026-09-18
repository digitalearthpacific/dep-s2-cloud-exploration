# S-2 Cloud Explorer — Plan

Draft, 2026-09-18. Intentions for the MVP described in REQUIREMENTS.md.
Decisions from review are in the last section; earlier open questions are resolved there.

## What we found

### Data
- **dep_s2_geomad** (stac.digitalearthpacific.org): ~2,660 items per year, each a 9600×9600 px, 10 m tile in
  **EPSG:3832** (PDC Mercator, CM 150). One COG per band on `dep-public-data.s3.us-west-2.amazonaws.com`
  (CORS `*`, range requests OK). Bands: red/green/blue/nir/… plus emad/smad/bcmad/**count** (0–250).
  DEP also runs a WMS (`ows.prod.digitalearthpacific.io/wms`) with a `time` dimension of one value per year
  2017–2025 and styles `simple_rgb` and `count`, served in EPSG:3857.
- **Earth Search v1**, three S-2 L2A collections, checked at a Fiji point (178.44, -18.14):

  | collection | 2018 scenes | 2018 baseline | 2023 scenes | 2023 baseline | offset handling |
  |---|---|---|---|---|---|
  | `sentinel-2-l2a` | 173 | 02.11 | 194 | 05.10 | pre-04.00: none needed; ≥04.00: Element 84 already subtracted the −1000 BOA offset in the COGs (`earthsearch:boa_offset_applied: true`) |
  | `sentinel-2-c1-l2a` | 46 | 05.00 | 144 | 05.10 | raw; `raster:bands.offset = -0.1` must be applied by the reader |
  | `sentinel-2-pre-c1-l2a` | 0 | – | – | – | effectively empty here |

  So `sentinel-2-l2a` is the only collection with full 2017–2021 coverage in the Pacific. Its COGs are on
  `sentinel-cogs.s3.us-west-2.amazonaws.com` (CORS OK; cogniscient already reads them from the browser).
  SCL is a uint8 COG at 20 m; RGB (B04/B03/B02) are uint16 at 10 m.

### Pre-Collection-1 cloud masking (why the old years look different)
- ESA reprocessed the whole archive to Collection 1 (baseline 05.00+) but Earth Search's C1 collection still has
  big gaps in Nov 2016–Nov 2019 and 2022. For those years we are on the original Sen2Cor 2.5–2.9 output.
- **Sen2Cor ≥ 2.10 (baseline ≥ 04.00, Jan 2022)** dilates clouds/shadows/snow in the SCL itself and uses MSI
  parallax to estimate cloud-top height for shadow projection. **Older baselines do neither**: SCL cloud edges
  are tight, and most cloud shadows are missed or land in class 2 (dark area pixels).
- Pre-05.09 SCL does not flag degraded/missing source packets as class 1; that only started Dec 2022.
- Sen2Cor is threshold-based, so over dark Pacific ocean it routinely labels water as **cloud shadow (3)**,
  **dark area (2)** or **unclassified (7)**, and under-detects thin cirrus over water. This is exactly why
  dep-geomad grew `water_aware_shadow`, `water_aware_cirrus`, `mask_sun_glint` and the "bright and flat"
  `mask_high_values` test.
- Practical consequence for this app: the per-class morphology (opening to kill speckle, dilation to grow edges)
  matters far more for 2017–2021 than for 2022+, where the SCL already arrives dilated. The tool should make it
  easy to compare the same recipe across a pre-04.00 and a post-04.00 year.

### Reference code
- `../dep-geomad/src/utils.py::mask_clouds`: per-class `(operation, radius)` list → `odc.algo.mask_cleanup`
  (binary opening/closing/dilation/erosion with a disk footprint), union across classes, then optional
  glint / bright-flat / water-aware tweaks. Defaults in `DEFAULT_MASK_FILTERS`; legacy `S2_OLD_STYLE_FILTERS`
  is `[dilation 3, erosion 2]` on every class. MVP reproduces the per-class morphology + union; the extras are
  phase 2.
- `../../auspatious/cogniscient`: vanilla JS + Vite, maplibre-gl 6, geotiff.js windowed reads, proj4, no
  framework. Its `stac.js`, `map.js`, `export.js` (window computation, overview selection) and `colormap.js`
  are directly reusable.
- deck.gl-raster: `@developmentseed/deck.gl-geotiff` 0.7.0 (peers deck.gl 9.3+), GPU reprojection from any
  EPSG including 3832, untested across the antimeridian (relevant for Fiji/Tonga/Kiribati tiles).

## Intended architecture

Pure client-side SPA, no backend. Same stack as cogniscient so code can be lifted directly:
Vite, vanilla JS modules, maplibre-gl, geotiff.js, proj4. Add `deck.gl` 9 + `@developmentseed/deck.gl-geotiff`
via `MapboxOverlay` for the geomad rasters.

```
src/
  main.js          wiring, URL state (year, band, point, tile size)
  map.js           maplibre map + basemap
  geomad-layer.js  year → STAC search of dep_s2_geomad items in view → deck.gl-geotiff layers (RGB or count)
  stac.js          Earth Search point search, paging, scene count
  tile.js          point + N px → window in each scene's UTM grid; read SCL(20 m→10 m nearest) + B02/B03/B04
  morph.js         binary dilation/erosion/opening/closing, disk radius, on Uint8Array  (+ one test)
  mask.js          per-class filters → union, port of mask_clouds core
  ui/              year picker, band toggle, tile-size input, class/filter editor, scene strip
```

### Main view
- MapLibre with plain OSM raster tiles, centred on the Pacific.
- Year picker 2017–2025 (buttons or `<input type="range">`). RGB / `count` toggle.
- On year change, page through the DEP STAC search for every `dep_s2_geomad` item of that year (~2,660) and
  keep them in memory, stripped to `{id, bbox, geometry, assets.{red,green,blue,count}.href}` so a year is a
  few hundred KB rather than tens of MB of full items.
- **Zoomed out:** draw item footprints as a maplibre GeoJSON fill/line layer (cogniscient `footprint-layer.js`).
- **Imagery:** DEP's WMTS (`ows.prod.digitalearthpacific.io/wmts`, WebMercator, zoom 0–14, `time=<year>-01-01`,
  styles `simple_rgb` / `count`) as a plain MapLibre raster source at every zoom. deck.gl-geotiff was built
  first and dropped (see Decisions).

### Cloud-mask panel
1. Click the map → point. Tile size input (default 256 px at 10 m ≈ 2.56 km).
2. POST Earth Search `/search` on `sentinel-2-l2a` only (C1 gaps rule it out) with `intersects: point`, the
   selected year as datetime, page through `next` links. De-dupe to one item per solar day and show
   "N scenes (M items)". At the Fiji test point 173 items collapse to 66 days: two MGRS tiles overlap the
   point and reprocessed granules (different `s2:sequence`) duplicate them. Overlapping tiles from one pass
   carry identical pixels, so instead of merging categorical SCL we keep the item whose footprint best
   contains the point (largest margin to its bbox edge), newest `created` as tie-break. No warp/merge.
3. Load **all** scenes for the year up front (~170–200 days × 4 windows of 256² ≈ 50–100 MB of typed arrays).
   Compute the pixel window from the scene's `proj:epsg` + `proj:transform`, read SCL at 20 m and upsample ×2
   nearest, read B04/B03/B02 at 10 m. Reuse cogniscient's window/overview code (`export.js`). Show every
   scene, including partial/nodata windows at swath edges; nodata renders transparent.
4. Mask editor: checkbox per SCL class (0–11, geomad colours), per-class ordered list of
   `(dilation|erosion|opening|closing, radius)`. Presets: geomad default, old-style, none.
5. Render, per scene, a horizontal strip of canvases: RGB, SCL, final mask, masked RGB (toggle), plus a
   "decomposed" row of each class's mask after its own filters. All morphology in JS on 256² uint8 — fast
   enough on the main thread; move to a Worker only if it stutters.
6. Summary per scene: % masked, % per class, baseline (so pre/post-04.00 differences are visible).

### Not in MVP (phase 2, from `mask_clouds`)
`mask_high_values` bright-and-flat test, water-aware shadow/cirrus (needs NIR for NDWI), sun-glint, temporal
stacking/geomedian preview, downloading masks.

## Steps
1. Scaffold Vite app, OSM map, year picker, geomad STAC load + footprints layer. Ship visibly first.
2. deck.gl-geotiff geomad layers (RGB / count) when zoomed in.
3. Earth Search point search, day grouping, scene count + scene list.
4. Tile reader (SCL + RGB windows, all scenes) and canvas strip.
5. `morph.js` + `mask.js` with class/filter editor and decomposed view. One `test_mask.js` asserting a known
   dilation/opening result.
6. URL state, deploy (Cloudflare Pages like cogniscient).

## Decisions (2026-09-18 review)
1. **Geomad rendering:** footprints when zoomed out plus DEP WMTS imagery at every zoom. Load all items for
   a year into memory (footprints only). deck.gl-geotiff was tried first and dropped (2026-09-18): tiles that
   cross or whose overview grid overhangs the antimeridian reproject into a world-spanning black quad, and
   the uint16 bands upload as `r16unorm`, which Firefox cannot do (no EXT_texture_norm16). WMTS is simpler
   and works everywhere.
2. **Collection:** `sentinel-2-l2a` only. Gaps in the C1 collections are showstoppers.
3. **Scene selection:** de-dupe by solar day. Implemented as pick-one-item-per-day (best containment,
   newest processing) rather than merging, since same-pass tiles share pixels; see step 2 above.
4. **Load strategy:** load all scenes for the year.
5. **Stack:** vanilla JS + Vite.
6. **Basemap:** plain OSM.
7. **Nodata / partial tiles:** show all.
