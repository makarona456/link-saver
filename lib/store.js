import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DATA_FILE = process.env.DATA_FILE || 'data/links.json';

// Load the saved links. A missing or empty file is a normal first-run state,
// not an error — return an empty list instead of crashing.
export async function loadLinks() {
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return []; // no file yet — that's fine
    if (err instanceof SyntaxError) {
      console.warn(`${DATA_FILE} is corrupt; starting from an empty list.`);
      return [];
    }
    throw err;
  }
}

// Persist the list. Write to a temp file then rename so a crash mid-write
// can never leave a half-written, unparseable links.json behind.
export async function saveLinks(links) {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(links, null, 2));
  await rename(tmp, DATA_FILE);
}
