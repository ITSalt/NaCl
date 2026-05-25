# Finding: domain-model arrow direction is a graph convention, not a render bug

**Status:** DECISION DEFERRED (documented 2026-05-25)
**Area:** `server/src/render/excalidraw/domain-model.ts`, `RELATES_TO` graph convention, `nacl-sa-domain`
**Severity of decision:** product / schema-level (framework-wide) — explicitly *not* a local bug fix

## Report

A BA, looking at a generated domain-model board, observed that the arrows
between entities point the "wrong" way. Example from the reported screenshot
(an LMS schema):

- The board draws `Course → Lecture → GroupLecture` (arrowhead on the right),
  each edge labelled `(1:N)`.
- The expectation was the **foreign-key dependency** direction:
  `GroupLecture → Lecture → Course`, because
  `GroupLecture.lecture_id` references `Lecture`, and
  `Lecture.course_id` references `Course`.

The question raised: *are the arrows stored this way in the graph, or does the
renderer invert direction when drawing?*

## Investigation

The domain-model renderer fetches entity relationships with this query
(`domain-model.ts:105`):

```cypher
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
```

and draws each arrow `start = de (source) → end = de2 (target)`, with the
arrowhead only on the target end (`endArrowhead: 'arrow'`), labelled
`${rel_type} (${cardinality})`. See `domain-model.ts:406-460`.

**There is no inversion anywhere in the render pipeline.** The arrow direction
is exactly the stored direction of the `RELATES_TO` edge.

The graph stores `RELATES_TO` in the **"ownership / 1:N"** convention:
`(Course)-[:RELATES_TO {cardinality:'1:N'}]->(Lecture)` reads as
"a Course has many Lectures." The arrowhead points at the "many" side. This is
written by `nacl-sa-domain` (and the BA layer that feeds it), and the renderer
faithfully reflects it.

## Conclusion

This is **not a rendering bug.** The picture matches what the graph stores. The
mismatch is a difference between two legitimate ER conventions:

| Convention | Edge meaning | Arrowhead points to | Example |
|---|---|---|---|
| **Ownership / aggregation** (current, stored) | "the *one* owns *many*" | the *many* side | `Course → Lecture` (1:N) |
| **FK dependency** (BA's expectation) | "the holder of the FK depends on the referenced row" | the *referenced/one* side | `Lecture → Course` (Lecture.course_id) |

Reversing this is **framework-wide**: it touches the graph storage convention
(`RELATES_TO` direction), the skills that write it (`nacl-sa-domain`, BA
handoff), every existing project graph, and any validator that traverses
`RELATES_TO` directionally — exactly the "rework of the whole graph and the
skills based on it" that the requester flagged.

## Options (for the deferred decision)

1. **Renderer-only flip.** In `domain-model.ts`, swap start/end binding and the
   cardinality label (`1:N → N:1`) so the arrowhead points to the FK-referenced
   entity. One file, no migration, reversible, applies to every project.
   *Cost:* the picture would then disagree with the stored `RELATES_TO`
   direction (graph = ownership, board = FK) — a presentation/semantics split.

2. **Derive from the FK attribute.** Have the renderer (or a sync step) choose
   arrow direction from which entity carries the `*_id` attribute referencing
   the other (`Lecture.course_id ⇒ Lecture → Course`). No graph migration, but
   depends on FK attributes being reliably present and named; touches the
   renderer and possibly `nacl-sa-domain`.

3. **Change the stored convention.** Flip `RELATES_TO` storage direction in
   `nacl-sa-domain` / BA skills, migrate all project graphs, and audit
   validators. The full rework; highest blast radius.

4. **Leave as-is.** Keep ownership/`1:N` semantics; document that the arrow is
   an aggregation arrow, not an FK-dependency arrow.

## Decision

Deferred per the requester on 2026-05-25 ("document the finding, decide
separately"). No arrow-direction code was changed. The companion style fix
(clean `roughness: 0` rendering) ships independently of this decision.
