/**
 * excalidraw-bindings — repair missing reverse bindings on existing scenes.
 *
 * Excalidraw requires *both* directions of an arrow binding to follow a shape:
 *   - The arrow has `startBinding.elementId` / `endBinding.elementId` pointing
 *     at the shape (one-way reference).
 *   - The shape's `boundElements` array must contain `{ id: arrowId, type: 'arrow' }`
 *     pointing back at the arrow (reverse reference).
 *
 * If the reverse reference is missing, the arrow draws on the canvas but does
 * not move when the shape is dragged — they look "linked" but behave
 * independently.
 *
 * `nacl-render` historically wrote the forward references only. This module
 * is a non-destructive repair: callers (typically `readBoard`) pass the parsed
 * scene through `repairArrowBindings()` before returning it to the client.
 * The on-disk file is unchanged until the user saves, at which point the
 * repaired bindings are persisted naturally via the normal write path.
 */

interface BoundEntry {
  id: string;
  type: string;
}

interface MutableElement {
  id: string;
  type: string;
  boundElements?: BoundEntry[] | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
}

interface MutableScene {
  elements: MutableElement[];
  [key: string]: unknown;
}

/**
 * Returns a new scene with reverse `boundElements` entries added wherever an
 * arrow's start/end binding refers to a shape that doesn't already track it.
 *
 * Idempotent — running twice produces the same output.
 *
 * Does not mutate the input.
 */
export function repairArrowBindings<T extends { elements: unknown[] } & Record<string, unknown>>(
  scene: T,
): T {
  // Treat the input as untyped — Excalidraw scene types are loose by design.
  const inputScene = scene as unknown as MutableScene;
  if (!Array.isArray(inputScene.elements)) return scene;

  const byId = new Map<string, MutableElement>();
  for (const el of inputScene.elements) {
    if (el && typeof el.id === 'string') byId.set(el.id, el);
  }

  // Collect the reverse-link patches we need to apply: target id → set of arrow ids.
  const needed = new Map<string, Set<string>>();
  for (const el of inputScene.elements) {
    if (el?.type !== 'arrow') continue;
    const arrowId = el.id;
    for (const b of [el.startBinding, el.endBinding]) {
      if (!b) continue;
      const targetId = b.elementId;
      if (typeof targetId !== 'string') continue;
      if (!byId.has(targetId)) continue;
      let set = needed.get(targetId);
      if (!set) {
        set = new Set();
        needed.set(targetId, set);
      }
      set.add(arrowId);
    }
  }

  if (needed.size === 0) return scene;

  // Build a new elements array with patched targets. Only clone elements we touch.
  const newElements = inputScene.elements.map((el) => {
    if (!el || typeof el.id !== 'string') return el;
    const arrowsForThis = needed.get(el.id);
    if (!arrowsForThis) return el;

    const existing = Array.isArray(el.boundElements) ? el.boundElements : [];
    const existingArrowIds = new Set(
      existing.filter((b) => b && b.type === 'arrow').map((b) => b.id),
    );
    const toAdd: BoundEntry[] = [];
    for (const arrowId of arrowsForThis) {
      if (!existingArrowIds.has(arrowId)) {
        toAdd.push({ id: arrowId, type: 'arrow' });
      }
    }
    if (toAdd.length === 0) return el;

    return {
      ...el,
      boundElements: [...existing, ...toAdd],
    };
  });

  return { ...scene, elements: newElements };
}
