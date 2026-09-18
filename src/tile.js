/**
 * Read an N×N pixel window (10 m grid) centred on a point from one
 * sentinel-2-l2a item: SCL (20 m, upsampled ×2 nearest) plus red/green/blue
 * (10 m). Windows that hang off the image edge are zero-filled (nodata).
 */
import { fromUrl, Pool } from 'geotiff';
import proj4 from 'proj4';

const pool = typeof window !== 'undefined' ? new Pool() : undefined;
export const BANDS = ['red', 'green', 'blue', 'scl'];

function utmProj(epsg) {
  const code = String(epsg);
  if (!/^32[67]\d\d$/.test(code)) throw new Error(`Unsupported CRS EPSG:${epsg}`);
  return `+proj=utm +zone=${code.slice(3)}${code.startsWith('327') ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
}

/** Pixel window [x0, y0, x1, y1] on the 10 m grid, centred on the point. */
export function windowFor(item, lon, lat, size) {
  const epsg = item.properties['proj:epsg'];
  const [x, y] = proj4('EPSG:4326', utmProj(epsg), [lon, lat]);
  const t = item.assets.red['proj:transform']; // [10, 0, ox, 0, -10, oy]
  const px = Math.floor((x - t[2]) / t[0]);
  const py = Math.floor((y - t[5]) / t[4]);
  const half = size >> 1;
  return [px - half, py - half, px - half + size, py - half + size];
}

/** Read one band into an N×N typed array; `scale` is source px per 10 m px (1 for 10 m, 0.5 for 20 m). */
async function readBand(href, win, size, scale, signal) {
  const tiff = await fromUrl(href);
  const image = await tiff.getImage(0);
  const W = image.getWidth(), H = image.getHeight();
  const src = win.map((v) => Math.round(v * scale));
  const cx0 = Math.max(0, src[0]), cy0 = Math.max(0, src[1]);
  const cx1 = Math.min(W, src[2]), cy1 = Math.min(H, src[3]);
  const Ctor = image.getBitsPerSample() > 8 ? Uint16Array : Uint8Array;
  const out = new Ctor(size * size);
  if (cx1 <= cx0 || cy1 <= cy0) return out;
  const outW = Math.round((cx1 - cx0) / scale), outH = Math.round((cy1 - cy0) / scale);
  const data = await image.readRasters({
    window: [cx0, cy0, cx1, cy1], width: outW, height: outH, samples: [0],
    resampleMethod: 'nearest', pool, signal,
  });
  const ox = Math.round((cx0 - src[0]) / scale), oy = Math.round((cy0 - src[1]) / scale);
  for (let j = 0; j < outH; j++) {
    const oj = j + oy;
    if (oj < 0 || oj >= size) continue;
    for (let i = 0; i < outW; i++) {
      const oi = i + ox;
      if (oi >= 0 && oi < size) out[oj * size + oi] = data[0][j * outW + i];
    }
  }
  return out;
}

export async function readTile(item, lon, lat, size, signal) {
  const win = windowFor(item, lon, lat, size);
  const [red, green, blue, scl] = await Promise.all([
    readBand(item.assets.red.href, win, size, 1, signal),
    readBand(item.assets.green.href, win, size, 1, signal),
    readBand(item.assets.blue.href, win, size, 1, signal),
    readBand(item.assets.scl.href, win, size, 0.5, signal),
  ]);
  return { item, size, red, green, blue, scl };
}
