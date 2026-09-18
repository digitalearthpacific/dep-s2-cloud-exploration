const EMPTY = { type: 'FeatureCollection', features: [] };

export function addFootprintLayers(map) {
  map.addSource('geomad-items', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'geomad-fill', type: 'fill', source: 'geomad-items',
    paint: { 'fill-color': '#3474c7', 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'geomad-outline', type: 'line', source: 'geomad-items',
    paint: { 'line-color': '#3474c7', 'line-width': 1, 'line-opacity': 0.7 },
  });
}

export function setFootprints(map, items) {
  map.getSource('geomad-items')?.setData({ type: 'FeatureCollection', features: items ?? [] });
}

export function setFootprintsVisible(map, visible) {
  for (const id of ['geomad-fill', 'geomad-outline']) {
    map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}

/** Square of `sizePx` 10 m pixels centred on the point, drawn as the tile region. */
export function addTileBoxLayer(map) {
  map.addSource('tile-box', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'tile-box', type: 'line', source: 'tile-box',
    paint: { 'line-color': '#ff5722', 'line-width': 2 },
  });
}

export function setTileBox(map, lon, lat, sizePx) {
  const m = sizePx * 10 / 2;
  const dLat = m / 111320;
  const dLon = m / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring = [[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]];
  map.getSource('tile-box')?.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } });
}
