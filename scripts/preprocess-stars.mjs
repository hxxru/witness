import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../public/data');
const sourcePath = path.join(dataDir, 'hyg.csv');
const outputPath = path.join(dataDir, 'bsc5.json');

function parseFloatSafe(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerSafe(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let index = 0;
  let insideQuotes = false;

  while (index < text.length) {
    const character = text[index];

    if (insideQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        field += character;
      }

      index += 1;
      continue;
    }

    if (character === '"') {
      insideQuotes = true;
      index += 1;
      continue;
    }

    if (character === ',') {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }

    if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += 1;
      continue;
    }

    if (character === '\r') {
      index += 1;
      continue;
    }

    field += character;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseCatalog(csvText) {
  const [header = [], ...rows] = parseCsv(csvText);

  return rows.map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ''])));
}

function parseRightAscensionDegrees(star) {
  const hours = parseFloatSafe(star.ra);

  return hours === null ? null : hours * 15;
}

function parseDeclinationDegrees(star) {
  return parseFloatSafe(star.dec);
}

function simplifyStar(star) {
  const properName = star.proper?.trim() || null;
  const fallbackName = star.bf?.trim() || null;

  return {
    ra: parseRightAscensionDegrees(star),
    dec: parseDeclinationDegrees(star),
    vmag: parseFloatSafe(star.mag),
    bv: parseFloatSafe(star.ci),
    hip: parseIntegerSafe(star.hip),
    name: properName || fallbackName,
  };
}

async function main() {
  const rawCatalog = parseCatalog(await readFile(sourcePath, 'utf8'));
  const simplified = rawCatalog
    .map(simplifyStar)
    .filter(
      (star) =>
        Number.isFinite(star.ra) &&
        Number.isFinite(star.dec) &&
        Number.isFinite(star.vmag) &&
        star.name !== 'Sol'
    )
    .sort((left, right) => left.vmag - right.vmag);

  await writeFile(outputPath, JSON.stringify(simplified, null, 2) + '\n');

  console.log(`Wrote ${simplified.length} stars to ${path.relative(process.cwd(), outputPath)}`);
  console.log(`Source catalog: ${path.relative(process.cwd(), sourcePath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
