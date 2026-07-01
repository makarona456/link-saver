# Link Saver

A tiny single-page tool: paste a URL, it fetches the page's real title for you, and keeps
your list across restarts. You can favourite links and filter to favourites only.

Part B (the code review of the broken snippet) lives in [`REVIEW.md`](REVIEW.md).
The AI prompts that did the most work are in [`PROMPTS.md`](PROMPTS.md).

## Run it

Requires Node 18+ (I used v24). No build step.

```bash
npm install
npm start
# open http://localhost:3000
```

Data is written to `data/links.json` (created on first save). Delete that file to reset.

## What it does

- Paste a URL and save it — the server fetches the page and extracts `<title>` itself.
- Shows each link's title, the URL, and when it was saved (newest first).
- Delete a link.
- Mark a link as a favourite (★) and filter the list to favourites only.
- Everything is persisted to disk, so it survives a restart.

## Stack, and why

Node + Express with a vanilla-JS single page, data in a JSON file. I picked it because the
whole thing is small enough that a framework and a database would be overhead, not help —
this runs with one dependency and one command, which is the right weight for a one-hour
build. **If it had to grow**, the two things I'd change first: swap the JSON file for SQLite
(the flat file and its full-rewrite-on-every-change won't survive real concurrency or
volume), and move the routes behind a thin service layer with real validation and tests.
I already split the persistence and title-fetching out of `server.js` into `lib/` so those
seams exist.

## Project layout

```
server.js          Express app + routes
lib/store.js       load/save the JSON file (atomic write, graceful on missing/corrupt)
lib/title.js       fetch a page and extract its <title>, with timeout + fallback
public/index.html  the page + styles
public/app.js      client logic (add / list / delete / favourite / filter)
data/links.json    persisted links (gitignored — it's user data, not source)
```

## The favourite feature — files I touched

Added as its own commit after the base tool worked:

- **`public/index.html`** — the "Favourites only" checkbox + counter, and the star styles.
- **`public/app.js`** — the per-link star button, the `toggleFavourite` call, and the filter.
- **`server.js`** — `PATCH /api/links/:id` to flip the flag (this endpoint was written with
  the rest of the API, so it shows up in the backend commit rather than the favourite one).

## Assumptions I made (the brief left these open)

- **"Real title" = the HTML `<title>` tag.** Not Open Graph / `og:title`. If the page has no
  usable title (no `<title>`, a non-HTML response, or the fetch fails), I fall back to the
  **hostname** rather than failing the save — saving a link shouldn't depend on a third-party
  page being reachable.
- **A bad or unreachable URL still saves** (with the hostname as title); only *malformed* URLs
  and non-http(s) schemes are rejected with a 400. I judged "don't lose the user's link over a
  flaky fetch" to be the friendlier behaviour, but flagging it since the opposite is defensible.
- **Single local user, no auth.** It's a personal tool on localhost.
- **Duplicates are allowed** — saving the same URL twice creates two entries. Dedup felt like
  scope creep for this.
- **Timestamps** are stored in UTC (ISO) and rendered in the browser's local timezone.

## What I deliberately left out (and why)

- **No database / no tests.** For a one-hour build a JSON file is enough and I'd rather ship a
  clear, working thing than a half-tested bigger one. Both are the first things I'd add — see above.
- **No pagination, search, or edit.** Not asked for; would be gold-plating.
- **No SSRF hardening** (blocking internal IPs the server fetches). I *noted* it in REVIEW.md
  because it matters the moment this isn't localhost, but building it now would be over-scoping.
- **Minimal styling.** Clean and readable, not designed.

## What I'd improve with more time

- SQLite (or at least serialised, per-record writes) instead of rewriting the whole JSON file.
- A small test suite around the title parser and the store (the parts most likely to break).
- Optimistic UI with rollback on the favourite toggle, and Open Graph title support.
- SSRF protection and a per-request rate limit if this were ever exposed beyond localhost.

## If I could have asked you questions before starting

I'd have asked **what "the page's real title" should mean when it's ambiguous** — is the HTML
`<title>` enough, or do you want Open Graph / `og:title` where it exists? — and, relatedly,
**what should happen when the title can't be fetched at all** (bad URL, timeout, non-HTML):
save the link with a fallback, or refuse it? I picked "save with the hostname" and noted it,
but that's the single decision most likely to differ from your intent. I'd also have confirmed
whether this is meant to be **single-user/local** (which shaped my choice to skip auth and a
database) or something you expect to deploy and share.
