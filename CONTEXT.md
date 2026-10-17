# Domain Context

This glossary defines Sóþspell's domain language. It deliberately avoids storage
and implementation details. Use these terms consistently in code, tests, docs,
plans, prompts, and UI copy.

## Glossary

### Sóþspell

A versioned, portable walkthrough of one software project at one revision. A
sóþspell is the artifact the player plays: chapters, beats, code anchors,
diagrams, narration, and metadata. It is not a chat transcript, a wiki, or a
video file. The word is Old English for "truth story"; the ASCII slug used in
code and URLs is `sothspell`.

### Truth story

The property a sóþspell must have: its claims about the project are grounded in
the project snapshot and can be traced to code. A beautiful explanation that
cannot be traced is not a truth story.

### Project

The software repository being explained. A project has a name, a local root, a
revision, and a snapshot. The first project is Bunbun. A project is read-only
from Sóþspell's point of view.

### Project snapshot

An immutable, content-addressed view of a project at a revision. A snapshot
contains the file manifest, hashes, languages, symbols, dependency graph, docs,
and warnings. Authoring and playback resolve anchors against a snapshot; they do
not read the working tree on every request.

### Revision

The identity of the project state a snapshot represents: commit, branch, and
whether the working tree was dirty. A revision is part of the snapshot and the
tour metadata. A tour is pinned to one revision.

### Chapter

A narrative unit of a sóþspell. A chapter has a title, a summary, one or more
diagrams, and an ordered set of beats. Chapters give the story its top-level
shape; they are not folders or source directories.

### Beat

The atomic unit of playback. A beat has one idea, one narration passage, one
stage state (code focus and/or diagram focus), an estimated duration, and
optional suggested questions. A beat is the smallest thing a user can pause on,
seek to, or deep-link to.

### Stage

The visual area of the player where code and diagrams appear together. The stage
is driven by the beat's focus, not by arbitrary layout instructions from the
model.

### Code anchor

A stable reference to evidence in the project: a file path, a symbol when
available, a line range hint, and a content hash. The compiler resolves the
symbol first, then the line hint, and verifies the hash. An anchor is how a beat
cites code.

### Code page

A read-only page that shows a project file with the anchored lines highlighted.
A code page carries the repository path, symbol breadcrumb, the originating beat,
and a stale badge when the source no longer matches the anchor hash. Code pages
are shareable deep links, not an editor.

### Diagram instruction

A structured specification for a diagram: kind, title, nodes, edges, groups, and
optional anchor links. A diagram instruction is not HTML, SVG, Mermaid, or a
screenshot. The compiler lays it out deterministically, and the player renders
it.

### Diagram focus

The subset of a diagram's nodes and edges that a beat highlights. Focus changes
animate; the diagram's underlying layout does not change between beats in the
same chapter.

### Narration

The spoken and written explanation of a beat. Narration has text, optionally
aligned audio, sentence timings, and word timings. Text is always available;
audio is optional.

### Sentence timing

The start and end of one sentence within a beat's narration. Sentence timing
drives captions and coarse highlighting.

### Word timing

The start and end of one word within a beat's narration. Word timing drives
fine-grained highlighting in narrated mode. Word timing is derived from a
provider's character alignment when cloud audio is used, or from browser
boundaries when browser speech is used.

### Playback mode

The user's chosen relationship to narration:

- **Read mode** — text and diagrams, auto-advancing at a reading-speed estimate.
- **Listen mode** — speech, synchronized text, and diagrams.
- **Explore mode** — paused; the user controls code, diagrams, and questions.

Mode is not the same as pause state. A user can pause in any mode.

### Run

One user's progress through one sóþspell. A run records the current beat, offset,
completed beats, playback mode, speed, question history, and timestamps. A run is
not part of the sóþspell artifact; it belongs to the user and can be exported or
deleted.

### Interlude

A question and answer inserted into a run without changing the sóþspell. An
interlude pauses playback, preserves the position, and returns to the same frame
when the user continues.

### Guide

The LLM-backed narrator and answerer. The guide authors the tour through the
authoring pipeline and answers questions through the ask pipeline. The guide is
an implementation detail of the product, not a character in the fiction.

### Authoring pipeline

The process that turns a project snapshot into a sóþspell: curriculum planning,
context packing, beat and diagram generation, validation, repair, and quality
reporting. It is not the player and does not run during playback.

### Publisher

The person or process that generates and reviews a sóþspell. In the first release
the publisher is the local user; the authoring pipeline is their tool.

### Golden tour

A checked-in sóþspell used as a demo and regression fixture. The first golden tour
explains Bunbun at commit `9fef24d`. It is pinned, attributed, and never written
back into the Bunbun tree.

### Stale tour

A sóþspell whose anchor hash no longer matches the current project source. A
stale tour still plays, but affected beats show a stale badge and the code page
explains the mismatch. Staleness is visible, not silently ignored.

### Deep link

A URL that opens a specific beat, code page, or run position. Deep links are part
of the product contract: they survive reloads and can be shared on the same
machine or deployment.

### Progress

The recorded state of a run: current position, completed beats, mode, speed, and
questions. Progress is local-first and anonymous in the first release.

### Harness adapter

The integration layer that lets a host application (the web app, OpenCode, or a
future agent harness) use Sóþspell's core. A harness adapter supplies the project
root, revision, model access, storage, player launch, and progress events. It
does not reimplement authoring or playback.

### Read-only

The rule that Sóþspell may read a project but never write to it or execute its
code. Snapshots, tours, audio, logs, and runs live under Sóþspell's own data
directory. Read-only is a product promise and a test invariant.

## Relationships

- A project has many snapshots; a snapshot belongs to one project and one
  revision.
- A sóþspell belongs to one project snapshot and contains many chapters.
- A chapter contains many beats and one or more diagrams.
- A beat belongs to one chapter and has zero or more code anchors.
- A code anchor belongs to one beat or diagram node and resolves against one
  snapshot.
- A diagram belongs to one chapter; a beat focuses a subset of its nodes and
  edges.
- A narration belongs to one beat; a beat may have no narration audio.
- A run belongs to one user (anonymous in the first release) and one sóþspell.
- A run contains zero or more interludes.
- An interlude belongs to one run and one beat; it does not modify the sóþspell.
- A harness adapter presents a sóþspell and a run; it does not own either.
- A golden tour is a sóþspell with a pinned revision and reviewed evidence.

## Invariants

1. A beat always has a title, narration text, and a stage.
2. Every code claim in a beat is supported by at least one code anchor, except
   beats explicitly marked as orientation.
3. Every anchor resolves to a real file and, when a symbol is named, a real
   symbol in the snapshot.
4. A tour never contains executable code, raw HTML, or raw SVG from the model.
5. A run never changes the sóþspell it plays.
6. A project is never modified by analysis, authoring, playback, or plugin use.
7. A stale anchor is visible to the user; it is never silently shown as current.
8. Text mode is complete: disabling narration does not remove content.
9. Progress survives a reload; a saved run is never lost because the server is
   temporarily unavailable.
10. A harness adapter uses the same sóþspell format and the same run model as the
    web app.
