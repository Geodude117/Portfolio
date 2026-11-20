// Fetches upcoming bin collections from Hull City Council and saves just the dates and bin types
// to public/data/bins.json, which the "My bin collections" article reads.
//
// The property is identified by its UPRN, read from the HULL_UPRN environment variable
// (a GitHub Actions secret), so the address never appears in the repo or on the site.
// This script never fails the build: if anything goes wrong it writes an empty file with an error.
import { mkdir, writeFile } from 'node:fs/promises';

const OUT_DIR = 'public/data';
const OUT_FILE = `${OUT_DIR}/bins.json`;
const uprn = (process.env.HULL_UPRN ?? '').trim();

async function save(data) {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify({ updated: new Date().toISOString(), ...data }, null, 2));
}

if (!/^\d{5,12}$/.test(uprn)) {
  console.warn('HULL_UPRN is not set (or not a number); writing an empty bins.json.');
  await save({ collections: [], error: 'not-configured' });
  process.exit(0);
}

try {
  const res = await fetch(`https://www.hull.gov.uk/ajax/bin-collection?bindate=${uprn}`, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; personal-portfolio-bin-checker)',
      referer: 'https://www.hull.gov.uk/bins-and-recycling/bin-collections/bin-collection-day-checker',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.json();
  const items = Array.isArray(body?.[0]) ? body[0] : [];

  // Group by date: [{ date: "2026-11-27", bins: ["Blue Bin", "Brown Bin"] }, ...]
  const byDate = new Map();
  for (const item of items) {
    const date = String(item.next_collection_date ?? '');
    const type = String(item.collection_type ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !type) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    if (!byDate.get(date).includes(type)) byDate.get(date).push(type);
  }
  const collections = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bins]) => ({ date, bins }));

  if (collections.length === 0) throw new Error('No collections in the response');
  await save({ collections });
  console.log(`Saved ${collections.length} collection dates to ${OUT_FILE}.`);
} catch (err) {
  console.warn(`Could not fetch bin collections: ${err.message}`);
  await save({ collections: [], error: 'fetch-failed' });
}
