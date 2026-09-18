/**
 * Load every dep_s2_geomad item for a year from the DEP STAC API, stripped
 * server-side (fields extension) to id, bbox, geometry and the asset hrefs
 * we render. ~2,700 items / ~3 MB per year, paged 1000 at a time.
 */
import { postJson } from './fetch-json.js';

const SEARCH_URL = 'https://stac.digitalearthpacific.org/search';
export const BANDS = ['red', 'green', 'blue', 'count'];

export async function loadGeomadYear(year, { signal, onProgress } = {}) {
  let body = {
    collections: ['dep_s2_geomad'],
    datetime: `${year}-01-01T00:00:00Z/${year}-12-31T23:59:59Z`,
    limit: 1000,
    fields: {
      include: ['id', 'bbox', 'geometry', ...BANDS.map((b) => `assets.${b}.href`)],
      // Keep `collection`: the server's paging token looks the last item up by
      // (id, collection) and 500s without it (with no CORS header, so the browser
      // reports it as a CORS failure).
      exclude: ['properties', 'links', 'stac_extensions', 'stac_version'],
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
