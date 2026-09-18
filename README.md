# S-2 Cloud Explorer

Browser-only tool for exploring Sentinel-2 cloud masking over the Pacific. See `REQUIREMENTS.md`
and `plan.md`.

- Main view: MapLibre + OSM, DEP `dep_s2_geomad` annual composites by year via DEP's WMTS (RGB or `count`),
  with tile footprints from the STAC API when zoomed out.
- Click the map: searches Earth Search `sentinel-2-l2a` for every scene of that year at the point, reads an
  N×N tile (SCL + RGB) per day, and shows RGB / SCL / mask per scene. Edit per-class morphology (a port of
  dep-geomad `mask_clouds`), pick a scene to see its decomposed per-class masks.

```bash
npm ci
npm run dev    # http://127.0.0.1:5173
npm test       # morphology + mask unit tests
npm run build  # static bundle in dist/
```
