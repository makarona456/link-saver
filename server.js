import express from 'express';
import { fetchPageTitle } from './lib/title.js';
import { loadLinks, saveLinks } from './lib/store.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// In-memory copy of the list, loaded once at startup and kept in sync with disk.
let links = await loadLinks();

// GET /api/links — return the saved list, newest first.
app.get('/api/links', (req, res) => {
  res.json(links);
});

// POST /api/links — save a new link. The client sends only { url };
// the server fetches the page and derives the title itself.
app.post('/api/links', async (req, res) => {
  const { url } = req.body ?? {};

  // Validate before we bother the network. new URL throws on junk input.
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Please provide a valid URL (including http:// or https://).' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http and https URLs are supported.' });
  }

  // A dead or slow URL must not crash the request — degrade to the hostname.
  const title = await fetchPageTitle(parsed.href);

  const link = {
    id: crypto.randomUUID(),
    url: parsed.href,
    title,
    favourite: false,
    savedAt: new Date().toISOString(),
  };

  links.unshift(link);
  await saveLinks(links);
  res.status(201).json(link);
});

// PATCH /api/links/:id — toggle the favourite flag.
app.patch('/api/links/:id', async (req, res) => {
  const link = links.find((l) => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: 'Link not found.' });

  if (typeof req.body?.favourite === 'boolean') {
    link.favourite = req.body.favourite;
  } else {
    link.favourite = !link.favourite; // no explicit value → treat as a toggle
  }

  await saveLinks(links);
  res.json(link);
});

// DELETE /api/links/:id — remove one link by id.
app.delete('/api/links/:id', async (req, res) => {
  const before = links.length;
  links = links.filter((l) => l.id !== req.params.id);
  if (links.length === before) return res.status(404).json({ error: 'Link not found.' });

  await saveLinks(links);
  res.sendStatus(204);
});

app.listen(PORT, () => {
  console.log(`Link Saver running at http://localhost:${PORT}`);
});
