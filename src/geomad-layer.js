/**
 * GeoMAD imagery from DEP's WMTS (KVP GetTile, WebMercator, 256 px, zoom 0–14).
 * Styles worth exposing: simple_rgb, count; the service also has ndvi, ndwi, etc.
 */
const WMTS = 'https://ows.prod.digitalearthpacific.io/wmts';
const STYLE = { rgb: 'simple_rgb', count: 'count' };

function tileUrl(year, band) {
  const q = new URLSearchParams({
    service: 'WMTS', request: 'GetTile', version: '1.0.0', layer: 'dep_s2_geomad',
    style: STYLE[band], format: 'image/png', tilematrixset: 'WholeWorld_WebMercator',
    time: `${year}-01-01`,
  });
  return `${WMTS}?${q}&tilematrix={z}&tilerow={y}&tilecol={x}`;
}

export function addGeomadLayer(map, year, band) {
  map.addSource('geomad', { type: 'raster', tiles: [tileUrl(year, band)], tileSize: 256, maxzoom: 14,
    attribution: 'GeoMAD © Digital Earth Pacific' });
  map.addLayer({ id: 'geomad', type: 'raster', source: 'geomad' });
}

export function setGeomadLayer(map, year, band) {
  map.getSource('geomad')?.setTiles([tileUrl(year, band)]);
}
