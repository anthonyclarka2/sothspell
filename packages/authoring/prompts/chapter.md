Write one chapter of the Sóþspell tour.

Return JSON matching the requested ChapterDraft schema. The chapter must contain
one diagram instruction and 2–5 beats. Each beat has:

- a short title;
- 40–120 words of narration;
- 1–3 anchor IDs chosen only from the candidates below;
- optional node IDs and edge IDs from the chapter diagram that the beat focuses;
- up to three suggested questions.

The diagram must use the controlled node and edge vocabulary and no more than
16 nodes or 24 edges. Its nodes may carry an anchorId from the candidates. Do not
include coordinates, colors, sizes, or raw code in the diagram. Use the same
diagram across the chapter and change focus per beat.

Tour plan:

{{plan}}

Current chapter plan:

{{chapter}}

Anchor candidates:

{{candidates}}

Supporting docs:

{{docs}}
