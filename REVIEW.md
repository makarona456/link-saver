# Part B — Code Review of the broken `server.js`

I treated this as a review: read it, worked out what breaks and on what input, ranked
by how much damage it does, then rewrote it. Severity is what drove the ordering —
the destructive data-loss bug matters far more than the cosmetic ones.

## The original snippet

```js
const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());
let links = JSON.parse(fs.readFileSync('links.json'));

app.post('/links', async (req, res) => {
  const { url } = req.body;
  const html = await fetch(url).then(r => r.text());
  const title = html.match(/<title>(.*)<\/title>/)[1];
  const link = { id: Date.now(), url, title, savedAt: new Date() };
  links.push(link);
  fs.writeFileSync('links.json', JSON.stringify(links));
  res.json(link);
});

app.delete('/links/:id', (req, res) => {
  links = links.filter(l => l.id === req.params.id);
  fs.writeFileSync('links.json', JSON.stringify(links));
  res.sendStatus(200);
});

app.listen(3000);
```

---

## Findings, ranked by severity

### 🔴 1. CRITICAL — DELETE erases the entire list (inverted filter condition)

```js
links = links.filter(l => l.id === req.params.id);
```

`filter` **keeps** the elements for which the predicate is true. Deleting should keep
everything *except* the target, so the condition must be `!==`, not `===`. As written,
a delete keeps only the matching item and throws away everything else — then writes that
truncated list straight to disk, permanently.

It is actually worse because of bug #2: the id comparison never matches, so `filter`
keeps **nothing**. The net effect is that **any** `DELETE /links/:id` wipes the whole
database to `[]` and persists it.

- **Breaks on:** any delete request at all, e.g. `DELETE /links/123`.
- **Impact:** silent, irreversible data loss. This is the one that would actually hurt.
- **Fix:** `l.id !== req.params.id` (and fix the type comparison, #2).

### 🔴 2. HIGH — id type mismatch makes DELETE match nothing

`id` is stored as a number (`Date.now()`), but `req.params.id` is always a **string**
(route params are strings). `l.id === req.params.id` is `number === string` → always
`false`. So even after fixing #1 to `!==`, the target is never found and delete silently
does nothing (still returns 200).

- **Breaks on:** every delete.
- **Fix:** compare as strings — `String(l.id) !== req.params.id` — or store ids as strings
  in the first place. I chose string ids (UUIDs) in Part A precisely to avoid this trap.

### 🔴 3. HIGH — server crashes on startup if `links.json` is missing or empty

```js
let links = JSON.parse(fs.readFileSync('links.json'));
```

On a fresh checkout there is no `links.json`, so `readFileSync` throws `ENOENT` and the
process dies before `listen`. An empty file is just as bad: `JSON.parse('')` throws
`SyntaxError`. The very first run of the app fails.

- **Breaks on:** first run (no file), or a truncated/empty/corrupt file.
- **Fix:** treat a missing/empty/corrupt file as an empty list — read inside a try/catch
  and default to `[]`.

### 🔴 4. HIGH — POST crashes on any page without a parseable `<title>`

```js
const title = html.match(/<title>(.*)<\/title>/)[1];
```

If the page has no `<title>` (a JSON API, an image, a bare 404, many SPAs), `match`
returns `null` and `null[1]` throws `TypeError: Cannot read properties of null`. Because
this is an `async` handler, Express 4 does **not** catch the rejection — the client gets
no response and the request hangs until it times out (and it fires an `unhandledRejection`).

The regex is fragile even when it matches: `.` doesn't cross newlines, so a title split
across lines is missed; it ignores attributes (`<title data-x="">`) and case (`<TITLE>`);
and `(.*)` is greedy.

- **Breaks on:** saving a URL whose response has no `<title>` — e.g. `https://example.com/image.png`
  or any JSON endpoint.
- **Fix:** guard the match, use a tolerant regex (`/<title[^>]*>([\s\S]*?)<\/title>/i`),
  and fall back to something sensible (I use the hostname) instead of throwing.

### 🔴 5. HIGH — no error handling around `fetch`; a bad URL hangs the request

```js
const html = await fetch(url).then(r => r.text());
```

`fetch` rejects on an invalid URL, DNS failure, refused connection or timeout. There's no
try/catch, so — same as #4 — the async handler rejects, no response is sent, and the
request hangs. This is exactly the "odd input like a bad URL" the brief calls out.
There's also no timeout, so a slow host ties up the request indefinitely.

- **Breaks on:** `POST /links {"url":"not-a-url"}`, an unreachable host, or a hanging server.
- **Fix:** validate the URL first, wrap the fetch in try/catch, add an `AbortController`
  timeout, and degrade gracefully rather than 500-ing or hanging.

### 🟠 6. MEDIUM — no input validation (and an SSRF door)

`const { url } = req.body;` assumes a body with a `url`. If the body is missing or `url`
is `undefined`, `fetch(undefined)` throws. There's also no restriction on scheme or host,
so the server will happily fetch internal addresses like `http://169.254.169.254/…`
(cloud metadata) — a classic SSRF. At minimum, require a string `http(s)` URL.

- **Breaks on:** empty body, missing `url`, or a malicious internal URL.
- **Fix:** validate with `new URL(url)` and reject non-`http(s)` schemes; consider blocking
  private/loopback ranges if this were ever exposed.

### 🟠 7. MEDIUM — non-atomic writes + a read-modify-write race

A shared module-level `links` array is mutated and written on every request with
`writeFileSync`, which isn't atomic. Two concurrent POSTs can lose an update, and a crash
*during* a write leaves a half-written `links.json` — which then trips bug #3 on the next
boot. 

- **Breaks on:** concurrent requests, or a crash mid-write.
- **Fix:** write to a temp file and `rename` it into place (atomic), and/or serialise writes.

### 🟡 8. LOW — `savedAt: new Date()` serialises inconsistently

`JSON.stringify(new Date())` produces an ISO string, so `savedAt` is a `Date` object in the
POST response but a `string` after a reload. Not harmful, but the type silently changes
across a restart. Store `new Date().toISOString()` explicitly.

### 🟡 9. LOW — DELETE always returns 200, even when nothing matched

The caller can't tell a real delete from a no-op. Return 404 when the id isn't found.

### 🟡 10. LOW — `id: Date.now()` can collide

Two links saved in the same millisecond get the same id. Rare, but it makes delete/patch
ambiguous. Use a UUID (`crypto.randomUUID()`).

### ⚪ 11. COSMETIC — HTML entities in titles aren't decoded

A title like `Foo &amp; Bar` is stored literally. Minor; a small decode pass fixes it.

---

## Severity ranking (most to least dangerous)

| # | Bug | Severity | Why |
|---|-----|----------|-----|
| 1 | DELETE inverted filter wipes the list | 🔴 Critical | Irreversible data loss on any delete |
| 2 | id number-vs-string mismatch | 🔴 High | Delete can never match its target |
| 3 | Crash on missing/empty `links.json` | 🔴 High | App won't start on first run |
| 4 | Crash / hang on missing `<title>` | 🔴 High | Common input breaks saving |
| 5 | No fetch error handling; bad URL hangs | 🔴 High | The odd input the brief cares about |
| 6 | No input validation / SSRF | 🟠 Medium | Bad input crashes; internal-URL fetches |
| 7 | Non-atomic write + race | 🟠 Medium | Corruption feeds bug #3 |
| 8 | `savedAt` type inconsistency | 🟡 Low | Cosmetic type drift |
| 9 | DELETE always 200 | 🟡 Low | Misleading response |
| 10 | `Date.now()` id collisions | 🟡 Low | Rare ambiguity |
| 11 | Entities not decoded | ⚪ Cosmetic | Display nit |

The two that would genuinely bite in production are **#1** (you lose all your data the
first time you delete anything) and **#3/#4/#5** (the app either won't boot or falls over
on ordinary inputs). Everything from #8 down is polish.

---

## Corrected code

Kept close to the original shape (CommonJS, same two routes) so it's a direct fix rather
than a rewrite. The same ideas — factored into modules — are what Part A ships.

```js
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const DATA_FILE = 'links.json';
const FETCH_TIMEOUT_MS = 8000;

// #3: a missing/empty/corrupt file is a normal empty state, not a crash.
function loadLinks() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT' || err instanceof SyntaxError) return [];
    throw err;
  }
}

// #7: write to a temp file then rename → never leaves a half-written file behind.
function saveLinks(links) {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(links, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// #4: tolerant parse + guard; returns null instead of throwing.
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

// #4 + #5: best-effort title with a timeout; falls back to the hostname.
async function fetchTitle(url) {
  const fallback = new URL(url).hostname;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return fallback;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return fallback;
    return extractTitle(await res.text()) || fallback;
  } catch {
    return fallback; // DNS error, refused, timeout, etc.
  } finally {
    clearTimeout(timer);
  }
}

let links = loadLinks();

app.post('/links', async (req, res) => {
  const { url } = req.body || {};

  // #6: validate before touching the network.
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https URLs are allowed' });
  }

  const title = await fetchTitle(parsed.href);
  const link = {
    id: crypto.randomUUID(),                 // #10: no collisions
    url: parsed.href,
    title,
    savedAt: new Date().toISOString(),       // #8: stable string type
  };
  links.push(link);
  saveLinks(links);
  res.status(201).json(link);
});

app.delete('/links/:id', (req, res) => {
  const before = links.length;
  links = links.filter((l) => l.id !== req.params.id); // #1 + #2: keep the rest, string compare
  if (links.length === before) {
    return res.status(404).json({ error: 'Not found' }); // #9: honest response
  }
  saveLinks(links);
  res.sendStatus(204);
});

app.listen(3000, () => console.log('Link saver on http://localhost:3000'));
```
