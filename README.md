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

## How it works

Visit the page at [https://digitalearthpacific.github.io/dep-s2-cloud-exploration](https://digitalearthpacific.github.io/dep-s2-cloud-exploration)
and view a region and year. Find somewhere where the geomad is bad (cloud/missing data) and click the point to pick
the region. Now the app will load all the scenes and show an opinionated mask using SCL. If you can make one better
than the default, then amazing!
