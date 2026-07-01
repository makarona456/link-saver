# Key AI prompts

These are the actual, high-level prompts I used to direct the AI, in the order I sent them.
I worked in Russian; they're translated here. My role was to scope the task, pick the stack,
and steer/verify the output — the AI produced and stress-tested the code under that direction.

---

### 1. Break down the task and propose a plan

> There's a take-home task in this folder that was sent to me for a "vibecoder" role. Read the
> file and tell me what's required and how we'll approach it.

*Why it mattered:* this is where it started — the AI split the brief into its parts (Part A,
Part B, what to deliver) and proposed a plan **before** any code was written, so I could sign
off on the approach rather than just accepting whatever got generated.

---

### 2. Pick the stack and build the whole thing

> Let's do it in Node + Express with vanilla JS. Build the whole project: the working tool, the
> favourite feature, the Part B code review, and all the files needed for submission.

*Why it mattered:* I set the stack and the scope here — I directed it to build everything the
brief asks for, cohesively, rather than "just throw together an app." Where it made design
calls (fallback title, atomic writes, module split) I reviewed and kept them.

---

### 3. Ship it

> Push the finished project to GitHub.

*Why it mattered:* took it through to delivery — a repository with a real, readable commit
history, ready to send to the reviewers.

---

**Honest note on how this was built:** the direction and the judgement calls (stack, scope,
what to harden, what to leave out) were mine; the line-by-line code was written by the AI under
that direction, and I reviewed and tested the result. That's the split the brief invites —
leading the tools and judging their output, not typing every line.
