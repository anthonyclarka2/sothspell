# Tiny Notes golden tour

The homepage plays this three-chapter tour in about four minutes. It follows the
CLI and HTTP entry points into the notes service, then traces a note to its
JSON file and a behavior test. English, Spanish, and Arabic text ship with the
tour.

The source is pinned to the `examples/tiny-notes/` tree at commit
`845a52bad16d210f4defdb3c6c905bb97bf3fc58` in this repository. Playback
checks the shipped example files against `source-hashes.json` before
serving full files or analyzing symbol relations. The tour embeds its
excerpts for reading and embedding.

## Regenerate

Edit `tour.source.json`. Keep existing tour, chapter, beat, and anchor IDs
so published links and runs keep working. Review the narration against the
pinned source. If the example source changes, pin a commit containing the new
tree and review each line range and translation against it.

Run `pnpm tour:build:tiny-notes` from the repository root with the pinned
commit available in local Git history. The script reads that revision into a
temporary directory, verifies diagram edges with the analyzer, hashes each
cited range, and writes `tour.json` and `source-hashes.json`. Commit both
outputs with the source document. The runtime can play the checked-in files
from a shallow clone.

Use `pnpm example:tiny-notes` when you want a disposable Git checkout for the
**New tour** authoring flow.
