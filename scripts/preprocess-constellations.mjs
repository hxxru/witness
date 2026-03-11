import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../public/data');
const sourcePath = path.join(dataDir, 'stellarium-western.json');
const constellationsPath = path.join(dataDir, 'constellations.json');
const starNamesPath = path.join(dataDir, 'star-names.json');

function flattenPolylineSegments(polyline) {
  const segments = [];

  if (!Array.isArray(polyline)) {
    return segments;
  }

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const from = polyline[index];
    const to = polyline[index + 1];

    if (Number.isInteger(from) && Number.isInteger(to)) {
      segments.push([from, to]);
    }
  }

  return segments;
}

function extractStarNames(raw) {
  const starNames = {};
  const commonNames = raw.common_names;

  if (!commonNames || typeof commonNames !== 'object') {
    return starNames;
  }

  for (const [key, value] of Object.entries(commonNames)) {
    const match = key.match(/(?:HIP\\s*)?(\\d+)/i);

    if (!match) {
      continue;
    }

    const hip = Number.parseInt(match[1], 10);
    const name =
      typeof value === 'string'
        ? value
        : value?.english || value?.native || value?.name || null;

    if (Number.isInteger(hip) && name) {
      starNames[hip] = name;
    }
  }

  return starNames;
}

function extractConstellations(raw) {
  const constellations = Array.isArray(raw.constellations) ? raw.constellations : [];

  return constellations.map((constellation) => {
    const lines = Array.isArray(constellation.lines)
      ? constellation.lines.flatMap(flattenPolylineSegments)
      : [];

    return {
      name:
        constellation.common_name?.native ||
        constellation.common_name?.english ||
        constellation.iau ||
        constellation.id,
      abbr: constellation.iau || constellation.id,
      lines,
    };
  });
}

async function main() {
  const raw = JSON.parse(await readFile(sourcePath, 'utf8'));
  const constellations = extractConstellations(raw);
  const starNames = extractStarNames(raw);

  await writeFile(constellationsPath, JSON.stringify(constellations, null, 2) + '\n');
  await writeFile(starNamesPath, JSON.stringify(starNames, null, 2) + '\n');

  console.log(
    `Wrote ${constellations.length} constellations to ${path.relative(process.cwd(), constellationsPath)}`
  );
  console.log(
    `Wrote ${Object.keys(starNames).length} star names to ${path.relative(process.cwd(), starNamesPath)}`
  );

  if (!raw.common_names) {
    console.warn(
      'Warning: stellarium-western.json does not include a common_names block, so star-names.json is empty.'
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
