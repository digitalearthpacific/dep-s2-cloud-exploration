/**
 * Earth Search v1 point search on sentinel-2-l2a, de-duplicated to one item
 * per solar day. Overlapping MGRS tiles and reprocessed duplicates
 * (different s2:sequence) share the same pixels where they overlap, so we
 * keep the item whose footprint best contains the requested window instead
 * of merging categorical SCL across items.
 */
import { postJson } from './fetch-json.js';

const SEARCH_URL = 'https://earth-search.aws.element84.com/v1/search';

export async function searchScenes({ lon, lat, year, signal, onProgress }) {
  let body = {
    collections: ['sentinel-2-l2a'],
    intersects: { type: 'Point', coordinates: [lon, lat] },
    datetime: `${year}-01-01T00:00:00Z/${year}-12-31T23:59:59Z`,
    limit: 100,
    fields: {
      include: [
        'id', 'bbox', 'geometry', 'properties.datetime', 'properties.eo:cloud_cover',
        'properties.proj:epsg', 'properties.s2:processing_baseline', 'properties.s2:sequence',
        'properties.created', 'assets.scl', 'assets.red', 'assets.green', 'assets.blue', 'assets.nir',
      ],
      exclude: ['links', 'stac_extensions', 'stac_version'],
    },
  };
  const items = [];
  while (body) {
    const fc = await postJson(SEARCH_URL, body, { signal });
    items.push(...fc.features);
    onProgress?.(items.length);
    body = fc.links?.find((l) => l.rel === 'next')?.body ?? null;
  }
  return items;
}

/** Signed distance (degrees, approx) from point to nearest bbox edge; larger = better contained. */
function margin(item, lon, lat) {
  const [w, s, e, n] = item.bbox;
  return Math.min(lon - w, e - lon, lat - s, n - lat);
}

/** One item per solar day: best-contained, then newest processing. */
export function dedupeByDay(items, lon, lat) {
  const byDay = new Map();
  for (const it of items) {
    const day = it.properties.datetime.slice(0, 10);
    const cur = byDay.get(day);
    if (!cur) { byDay.set(day, it); continue; }
    const dm = margin(it, lon, lat) - margin(cur, lon, lat);
    const better = dm > 1e-3 || (Math.abs(dm) <= 1e-3 && (it.properties.created ?? '') > (cur.properties.created ?? ''));
    if (better) byDay.set(day, it);
  }
  return [...byDay.values()].sort((a, b) => a.properties.datetime.localeCompare(b.properties.datetime));
}
