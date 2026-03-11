import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const WIDTH = 1024;
const HEIGHT = 512;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.resolve(scriptDir, '../public/data/ne_110m_land.geojson');
const outputPath = path.resolve(scriptDir, '../public/data/land-mask.png');

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function projectLongitude(longitude) {
  return ((longitude + 180) / 360) * WIDTH;
}

function projectLatitude(latitude) {
  return ((90 - latitude) / 180) * HEIGHT;
}

function unwrapRing(ring) {
  if (ring.length === 0) {
    return [];
  }

  const unwrapped = [[ring[0][0], ring[0][1]]];
  let previousLongitude = ring[0][0];

  for (let index = 1; index < ring.length; index += 1) {
    const [rawLongitude, latitude] = ring[index];
    let longitude = rawLongitude;

    while (longitude - previousLongitude > 180) {
      longitude -= 360;
    }

    while (longitude - previousLongitude < -180) {
      longitude += 360;
    }

    unwrapped.push([longitude, latitude]);
    previousLongitude = longitude;
  }

  return unwrapped;
}

function projectRing(ring) {
  return unwrapRing(ring).map(([longitude, latitude]) => ({
    x: projectLongitude(longitude),
    y: projectLatitude(latitude),
  }));
}

function fillWrappedSpan(mask, row, startX, endX, fillValue) {
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) {
    return;
  }

  const minShift = Math.floor(-maxX / WIDTH) - 1;
  const maxShift = Math.ceil((WIDTH - minX) / WIDTH) + 1;
  const rowOffset = row * WIDTH;

  for (let shift = minShift; shift <= maxShift; shift += 1) {
    const shiftedMinX = minX + shift * WIDTH;
    const shiftedMaxX = maxX + shift * WIDTH;
    const left = Math.max(0, Math.floor(shiftedMinX));
    const right = Math.min(WIDTH, Math.ceil(shiftedMaxX));

    if (right <= left) {
      continue;
    }

    mask.fill(fillValue, rowOffset + left, rowOffset + right);
  }
}

function rasterizeRing(mask, ring, fillValue) {
  const projected = projectRing(ring);

  if (projected.length < 3) {
    return;
  }

  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of projected) {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const startRow = clamp(Math.floor(minY), 0, HEIGHT - 1);
  const endRow = clamp(Math.ceil(maxY), 0, HEIGHT);

  for (let row = startRow; row < endRow; row += 1) {
    const sampleY = row + 0.5;
    const intersections = [];

    for (let index = 0; index < projected.length; index += 1) {
      const current = projected[index];
      const next = projected[(index + 1) % projected.length];

      if ((current.y <= sampleY && next.y > sampleY) || (next.y <= sampleY && current.y > sampleY)) {
        const t = (sampleY - current.y) / (next.y - current.y);
        intersections.push(current.x + (next.x - current.x) * t);
      }
    }

    intersections.sort((left, right) => left - right);

    for (let index = 0; index + 1 < intersections.length; index += 2) {
      fillWrappedSpan(mask, row, intersections[index], intersections[index + 1], fillValue);
    }
  }
}

function rasterizePolygon(mask, polygon) {
  rasterizeRing(mask, polygon[0], 1);

  for (let index = 1; index < polygon.length; index += 1) {
    rasterizeRing(mask, polygon[index], 0);
  }
}

function crc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const CRC_TABLE = crc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePNG(mask) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = WIDTH * 4 + 1;
  const raw = Buffer.alloc(stride * HEIGHT);

  for (let row = 0; row < HEIGHT; row += 1) {
    const rowOffset = row * stride;
    raw[rowOffset] = 0;

    for (let column = 0; column < WIDTH; column += 1) {
      const value = mask[row * WIDTH + column] === 1 ? 255 : 0;
      const pixelOffset = rowOffset + 1 + column * 4;
      raw[pixelOffset] = value;
      raw[pixelOffset + 1] = value;
      raw[pixelOffset + 2] = value;
      raw[pixelOffset + 3] = 255;
    }
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  const geojson = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const mask = new Uint8Array(WIDTH * HEIGHT);

  for (const feature of geojson.features) {
    if (feature.geometry?.type !== 'Polygon') {
      continue;
    }

    const featureMask = new Uint8Array(WIDTH * HEIGHT);
    rasterizePolygon(featureMask, feature.geometry.coordinates);

    for (let index = 0; index < featureMask.length; index += 1) {
      if (featureMask[index] === 1) {
        mask[index] = 1;
      }
    }
  }

  const png = encodePNG(mask);
  await fs.writeFile(outputPath, png);

  const landPixels = mask.reduce((count, value) => count + value, 0);
  const coverage = ((landPixels / mask.length) * 100).toFixed(2);
  console.info(`Wrote ${outputPath}`);
  console.info(`Land pixels: ${landPixels}/${mask.length} (${coverage}%)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
