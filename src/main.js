import { Marker } from 'maplibre-gl';
import { createMap } from './map.js';
import { loadGeomadYear } from './geomad.js';
import { addFootprintLayers, setFootprints, setFootprintsVisible, addTileBoxLayer, setTileBox } from './footprints.js';
import { addGeomadLayer, setGeomadLayer } from './geomad-layer.js';
import { searchScenes, dedupeByDay } from './stac.js';
import { readTile } from './tile.js';
import { createScenesPanel } from './scenes-panel.js';

const $ = (id) => document.getElementById(id);
const FOOTPRINT_MAX_ZOOM = 8; // tile outlines only when zoomed out
const map = createMap('map');
map.on('error', (e) => console.error('maplibre error', e.error?.message ?? e));
const panel = createScenesPanel($('scenes'));

const state = { year: Number($('year').value), band: $('band').value, items: [], point: null };
let abortYear = null, abortScenes = null;
const marker = new Marker({ color: '#ff5722' });

// ── GeoMAD main view ──
// GeoMAD tile footprints from the STAC API. Kept but off: the WMTS covers the imagery
// now, so the ~3 MB/year item load is not worth it. Flip to true to get them back.
const SHOW_FOOTPRINTS = false;

function render() {
  setFootprints(map, state.items);
  setGeomadLayer(map, state.year, state.band);
}

async function loadYear(year) {
  $('year-label').textContent = year;
  if (!SHOW_FOOTPRINTS) return;
  abortYear?.abort();
  abortYear = new AbortController();
  $('status').textContent = `Loading ${year}…`;
  try {
    const items = await loadGeomadYear(year, {
      signal: abortYear.signal,
      onProgress: (n) => ($('status').textContent = `Loading ${year}… ${n} tiles`),
    });
    state.items = items;
    render();
    $('status').textContent = `${year}: ${items.length} GeoMAD tiles`;
  } catch (e) {
    if (e.name !== 'AbortError') $('status').textContent = `Error: ${e.message}`;
  }
}

// ── Cloud mask panel ──
const progress = $('scenes-progress');
function showProgress(indeterminate) {
  progress.hidden = false;
  if (indeterminate) progress.removeAttribute('value'); // native indeterminate animation
}
function hideProgress() { progress.hidden = true; }

async function loadScenes() {
  if (!state.point) return;
  abortScenes?.abort();
  const ac = (abortScenes = new AbortController());
  const { lon, lat } = state.point;
  const size = Number($('tile-size').value);
  panel.reset();
  panel.setStatus('Searching Earth Search…');
  showProgress(true);
  try {
    const items = await searchScenes({ lon, lat, year: state.year, signal: ac.signal,
      onProgress: (n) => panel.setStatus(`Searching… ${n} items`) });
    const scenes = dedupeByDay(items, lon, lat);
    let done = 0, failed = 0;
    progress.max = scenes.length;
    progress.value = 0;
    panel.setStatus(`${scenes.length} scenes (${items.length} items). Loading 0/${scenes.length}…`);
    // ponytail: fixed concurrency of 6 readers; tune if S3 throttles or memory spikes.
    const queue = [...scenes];
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (queue.length && !ac.signal.aborted) {
        const item = queue.shift();
        try { panel.addTile(await readTile(item, lon, lat, size, ac.signal)); }
        catch (e) { if (e.name === 'AbortError') return; failed++; console.warn(item.id, e); }
        done++;
        progress.value = done;
        panel.setStatus(`${scenes.length} scenes (${items.length} items). Loaded ${done}/${scenes.length}${failed ? `, ${failed} failed` : ''}`);
      }
    }));
    if (!ac.signal.aborted) panel.renderMedian(); // only once every scene has settled, not partway through
  } catch (e) {
    if (e.name !== 'AbortError') panel.setStatus(`Error: ${e.message}`);
  } finally {
    if (!ac.signal.aborted) hideProgress();
  }
}

function setPoint(lon, lat) {
  state.point = { lon, lat };
  marker.setLngLat([lon, lat]).addTo(map);
  setTileBox(map, lon, lat, Number($('tile-size').value));
  $('point').textContent = `${lon.toFixed(4)}, ${lat.toFixed(4)}`;
  loadScenes();
}

function setPicking(on) {
  state.picking = on;
  $('pick').classList.toggle('active', on);
  $('pick').textContent = on ? 'Click the map…' : 'Pick point';
  map.getCanvas().style.cursor = on ? 'crosshair' : '';
}

// ── wiring ──
$('year').addEventListener('input', () => ($('year-label').textContent = $('year').value));
$('year').addEventListener('change', () => { state.year = Number($('year').value); setGeomadLayer(map, state.year, state.band); loadYear(state.year); loadScenes(); });
$('band').addEventListener('change', () => { state.band = $('band').value; render(); });
$('tile-size').addEventListener('change', () => {
  if (state.point) setTileBox(map, state.point.lon, state.point.lat, Number($('tile-size').value));
  loadScenes();
});
$('pick').addEventListener('click', () => setPicking(!state.picking));

map.on('load', () => {
  addGeomadLayer(map, state.year, state.band);
  addFootprintLayers(map);
  const syncFootprints = () => setFootprintsVisible(map, SHOW_FOOTPRINTS && map.getZoom() < FOOTPRINT_MAX_ZOOM);
  map.on('zoomend', syncFootprints);
  syncFootprints();
  addTileBoxLayer(map);
  map.on('click', (e) => {
    if (!state.picking) return;
    setPicking(false);
    setPoint(e.lngLat.lng, e.lngLat.lat);
  });
  loadYear(state.year);
});
