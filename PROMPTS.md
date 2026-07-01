# Key AI prompts

The 2–3 prompts that did the most work, with a note on *why* I framed each the way I did.
The pattern throughout: I set the constraints and the judgment calls, and used the AI to
produce and stress-test the code rather than to decide the design.

---

### 1. Scoping the backend, with the edge cases named up front

> Build the backend for a small "link saver" in Node + Express, data in a JSON file (no DB).
> Endpoints: save a URL (server fetches the page and extracts the `<title>` itself — the user
> never types it), list, delete. Requirements I care about: (a) a bad/unreachable URL must NOT
> crash or hang the request — degrade to the hostname as the title; (b) a missing or empty
> `links.json` on first run must not crash startup; (c) don't store numeric ids that I'll later
> compare against string route params. Keep it small and readable. Split persistence and
> title-fetching into their own modules so `server.js` stays thin.

*Why:* naming the three failure modes (bad URL, missing file, id type) is the whole point —
those are exactly the traps the Part B snippet fell into, so I directed the build to avoid
them from the start rather than discovering them later. Asking for the module split kept the
"if it had to grow" seams in place.

---

### 2. Adversarial testing before trusting it

> Before I commit this, give me curl commands that try to break the POST endpoint: a real URL,
> an unreachable domain, a non-http scheme, malformed junk, and an empty body. Tell me the
> status code and behaviour you'd expect for each, so I can check the server actually does that.

*Why:* I don't take AI code on faith. Making the model predict the expected result for each
odd input — then running them — is how I verified the "behaves sensibly on a bad URL" bar the
brief calls out, instead of just eyeballing the happy path. (This is what the README's testing
notes are based on.)

---

### 3. Part B — review, don't just patch

> Here's a backend snippet written in a hurry with bugs planted on purpose. Do a code review,
> not a rewrite: for each bug tell me what specifically breaks and on what input, then rank them
> by severity — I care most about anything destructive or that stops it booting, least about
> cosmetics. Call out the DELETE handler and the id types specifically. Then give me a corrected
> version that keeps the original CommonJS shape.

*Why:* I steered it toward *severity and root cause* rather than a list of nits, because the
brief rewards finding the serious bugs (the delete that wipes the list, the startup crash) over
counting cosmetic ones. Pointing it at the DELETE handler and id types made sure it didn't
gloss over the inverted-filter data-loss bug, which is the one that actually matters.
