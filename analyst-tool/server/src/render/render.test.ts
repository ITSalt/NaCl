/**
 * render.test.ts — unit tests for the deterministic render pipeline.
 *
 * Tests cover:
 *  1. deterministic-id: stable ids, seeds, versionNonce across calls.
 *  2. elements: makeRect / makeArrow / makeDiamond / makeText factories.
 *  3. Binding bug regression: arrow sets BOTH startBinding/endBinding AND
 *     pushes into boundElements of source and target shapes.
 *  4. Each renderer (domain-model, context-map, activity, ba-process) with
 *     a mock driver returning fixture records — snapshot output and check hashes.
 *  5. Round-trip determinism: render → computeBoardHash → render again → hashes match.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { seedFromId, deterministicSeeds, elementId } from './deterministic-id.js';
import { makeRect, makeDiamond, makeText, makeArrow, assembleScene, type ShapeRegistry } from './elements.js';
import { computeBoardHash } from '../services/meta.js';
import type { Driver } from 'neo4j-driver';

// ---------------------------------------------------------------------------
// Fake Driver (same pattern as renderable.test.ts)
// ---------------------------------------------------------------------------

type FakeRow = Record<string, unknown>;

function makeFakeDriver(
  responses: { match: string; rows: FakeRow[] }[],
): Driver {
  return {
    session() {
      return {
        async run(cypher: string) {
          const resp = responses.find((r) => cypher.includes(r.match));
          const records = (resp?.rows ?? []).map((row) => ({
            get(key: string) {
              const val = row[key];
              // Simulate neo4j integer wrapper
              if (typeof val === 'number') {
                return { toNumber: () => val, low: val, high: 0 };
              }
              return val ?? null;
            },
            keys: Object.keys(row),
          }));
          return { records };
        },
        async close() { /* no-op */ },
      };
    },
    async close() { /* no-op */ },
  } as unknown as Driver;
}

// ---------------------------------------------------------------------------
// 1. deterministic-id
// ---------------------------------------------------------------------------

describe('deterministic-id', () => {
  it('seedFromId returns a consistent uint32 for the same input', () => {
    const s1 = seedFromId('UC-001');
    const s2 = seedFromId('UC-001');
    assert.equal(s1, s2, 'seed must be stable');
    assert.ok(s1 >= 0 && s1 <= 0xFFFFFFFF, 'seed must be uint32');
  });

  it('seedFromId returns different values for different inputs', () => {
    const s1 = seedFromId('UC-001');
    const s2 = seedFromId('UC-002');
    assert.notEqual(s1, s2);
  });

  it('deterministicSeeds returns stable seed and versionNonce', () => {
    const r1 = deterministicSeeds('DE-Order');
    const r2 = deterministicSeeds('DE-Order');
    assert.equal(r1.seed, r2.seed);
    assert.equal(r1.versionNonce, r2.versionNonce);
  });

  it('deterministicSeeds seed != versionNonce for same input', () => {
    const { seed, versionNonce } = deterministicSeeds('some-id');
    assert.notEqual(seed, versionNonce, 'seed and versionNonce must differ');
  });

  it('elementId returns stable 16-char hex for same input', () => {
    const id1 = elementId('DE-Order', 'rect');
    const id2 = elementId('DE-Order', 'rect');
    assert.equal(id1, id2);
    assert.match(id1, /^[0-9a-f]{16}$/);
  });

  it('elementId differs for different roles', () => {
    const r = elementId('DE-Order', 'rect');
    const t = elementId('DE-Order', 'text');
    assert.notEqual(r, t);
  });
});

// ---------------------------------------------------------------------------
// 2. element factories
// ---------------------------------------------------------------------------

describe('makeRect', () => {
  it('produces a rectangle with quantized coords', () => {
    const rect = makeRect({
      logicalId: 'test-rect',
      x: 10.7,
      y: 20.3,
      width: 220.9,
      height: 80.1,
      backgroundColor: '#e3f2fd',
      strokeColor: '#1565c0',
    });
    assert.equal(rect.type, 'rectangle');
    assert.equal(rect.x, 11);   // Math.round(10.7)
    assert.equal(rect.y, 20);   // Math.round(20.3)
    assert.equal(rect.width, 221);
    assert.equal(rect.height, 80);
    assert.equal(rect.strokeColor, '#1565c0');
    assert.equal(rect.backgroundColor, '#e3f2fd');
  });

  it('seed and versionNonce are stable and non-zero', () => {
    const rect = makeRect({ logicalId: 'stable-id', x: 0, y: 0, width: 100, height: 50 });
    assert.ok(rect.seed > 0);
    assert.ok(rect.versionNonce > 0);
    const rect2 = makeRect({ logicalId: 'stable-id', x: 0, y: 0, width: 100, height: 50 });
    assert.equal(rect.seed, rect2.seed);
    assert.equal(rect.versionNonce, rect2.versionNonce);
  });

  it('defaults strokeColor to #000000', () => {
    const rect = makeRect({ logicalId: 'r', x: 0, y: 0, width: 50, height: 20 });
    assert.equal(rect.strokeColor, '#000000');
  });
});

describe('makeDiamond', () => {
  it('produces a diamond element', () => {
    const d = makeDiamond({ logicalId: 'diam', x: 100, y: 200, width: 160, height: 120 });
    assert.equal(d.type, 'diamond');
    assert.equal(d.width, 160);
    assert.equal(d.height, 120);
  });
});

describe('makeText', () => {
  it('produces a text element with containerId', () => {
    const t = makeText({
      logicalId: 'txt-1',
      x: 10, y: 20, width: 200,
      text: 'Hello',
      fontSize: 18,
      containerId: 'parent-rect',
    });
    assert.equal(t.type, 'text');
    assert.equal(t.text, 'Hello');
    assert.equal(t.fontSize, 18);
    assert.equal(t.containerId, 'parent-rect');
  });

  it('defaults containerId to null', () => {
    const t = makeText({ logicalId: 'txt-2', x: 0, y: 0, width: 100, text: 'X' });
    assert.equal(t.containerId, null);
  });
});

// ---------------------------------------------------------------------------
// 3. Binding bug regression
// ---------------------------------------------------------------------------

describe('makeArrow — binding both directions', () => {
  it('sets startBinding and endBinding on the arrow', () => {
    const registry: ShapeRegistry = new Map();
    const r1 = makeRect({ logicalId: 'r1', x: 0, y: 0, width: 100, height: 50 });
    const r2 = makeRect({ logicalId: 'r2', x: 300, y: 0, width: 100, height: 50 });
    registry.set(r1.id, r1.boundElements);
    registry.set(r2.id, r2.boundElements);

    const arrow = makeArrow({
      logicalId: 'arrow-r1-r2',
      startX: 100, startY: 25,
      endX: 300, endY: 25,
      startShapeId: r1.id,
      endShapeId: r2.id,
      registry,
    });

    assert.equal(arrow.startBinding?.elementId, r1.id, 'arrow.startBinding must point to r1');
    assert.equal(arrow.endBinding?.elementId, r2.id, 'arrow.endBinding must point to r2');
  });

  it('reverse: source and target shapes have the arrow id in boundElements', () => {
    const registry: ShapeRegistry = new Map();
    const r1 = makeRect({ logicalId: 'src', x: 0, y: 0, width: 100, height: 50 });
    const r2 = makeRect({ logicalId: 'tgt', x: 300, y: 0, width: 100, height: 50 });
    registry.set(r1.id, r1.boundElements);
    registry.set(r2.id, r2.boundElements);

    const arrow = makeArrow({
      logicalId: 'arrow-src-tgt',
      startX: 100, startY: 25,
      endX: 300, endY: 25,
      startShapeId: r1.id,
      endShapeId: r2.id,
      registry,
    });

    assert.ok(
      r1.boundElements.some((b) => b.id === arrow.id && b.type === 'arrow'),
      'source shape must have arrow id in boundElements',
    );
    assert.ok(
      r2.boundElements.some((b) => b.id === arrow.id && b.type === 'arrow'),
      'target shape must have arrow id in boundElements',
    );
  });

  it('is idempotent: calling makeArrow twice does not duplicate boundElements entries', () => {
    const registry: ShapeRegistry = new Map();
    const r1 = makeRect({ logicalId: 'a', x: 0, y: 0, width: 100, height: 50 });
    const r2 = makeRect({ logicalId: 'b', x: 200, y: 0, width: 100, height: 50 });
    registry.set(r1.id, r1.boundElements);
    registry.set(r2.id, r2.boundElements);

    makeArrow({
      logicalId: 'arrow-a-b',
      startX: 100, startY: 25, endX: 200, endY: 25,
      startShapeId: r1.id, endShapeId: r2.id, registry,
    });
    // Simulate a second call with the same ids (shouldn't duplicate)
    makeArrow({
      logicalId: 'arrow-a-b',
      startX: 100, startY: 25, endX: 200, endY: 25,
      startShapeId: r1.id, endShapeId: r2.id, registry,
    });

    const arrowEntriesInR1 = r1.boundElements.filter((b) => b.type === 'arrow');
    assert.equal(arrowEntriesInR1.length, 1, 'no duplicate arrow entries on source');
  });

  it('works with no registry (free arrow, no binding)', () => {
    const arrow = makeArrow({
      logicalId: 'free-arrow',
      startX: 0, startY: 0, endX: 100, endY: 100,
    });
    assert.equal(arrow.startBinding, null);
    assert.equal(arrow.endBinding, null);
  });
});

// ---------------------------------------------------------------------------
// 4. Renderers with mock driver
// ---------------------------------------------------------------------------

describe('renderBoard — domain-model renderer', () => {
  it('produces a scene with entity cards and no duplicate boundElements', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'DomainEntity',
        rows: [
          {
            id: 'DE-Order', name: 'Order', description: 'An order',
            module_name: 'Sales',
            attributes: [{ attr_name: 'id', attr_type: 'UUID' }, { attr_name: 'total', attr_type: 'Decimal' }],
            relationships: [],
          },
          {
            id: 'DE-Item', name: 'Item', description: 'Line item',
            module_name: 'Sales',
            attributes: [{ attr_name: 'qty', attr_type: 'Int' }],
            relationships: [{ target_id: 'DE-Order', target_name: 'Order', rel_type: 'belongs_to', cardinality: '*:1' }],
          },
        ],
      },
      {
        match: 'HAS_ENUM',
        rows: [],
      },
    ]);

    const scene = await renderBoard('domain-model', null, driver);

    assert.equal(scene.type, 'excalidraw');
    assert.ok(scene.elements.length > 0, 'should have elements');

    // All element ids must be unique
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const ids = els.map((e) => e.id as unknown);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'all element ids must be unique');

    // Check that any arrows have both binding directions set
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arrows: any[] = els.filter((e) => e.type === 'arrow');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shapes: any[] = els.filter((e) => e.type !== 'arrow' && e.type !== 'text');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shapeById = new Map<string, any>(shapes.map((s) => [s.id as string, s]));

    for (const arrow of arrows) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const start = (arrow.startBinding as { elementId: string } | null)?.elementId;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const end = (arrow.endBinding as { elementId: string } | null)?.elementId;
      if (start) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const src = shapeById.get(start);
        if (src) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const bounds = (src.boundElements ?? []) as Array<{ id: string; type: string }>;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          assert.ok(bounds.some((b) => b.id === arrow.id), `source shape ${start} must have arrow ${String(arrow.id)} in boundElements`);
        }
      }
      if (end) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const tgt = shapeById.get(end);
        if (tgt) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const bounds = (tgt.boundElements ?? []) as Array<{ id: string; type: string }>;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          assert.ok(bounds.some((b) => b.id === arrow.id), `target shape ${end} must have arrow ${String(arrow.id)} in boundElements`);
        }
      }
    }
  });
});

describe('renderBoard — context-map renderer', () => {
  it('produces a scene with module boxes', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'CONTAINS_ENTITY',
        rows: [
          {
            id: 'M-Sales', name: 'Sales', description: 'Sales module',
            entity_count: { toNumber: () => 3, low: 3, high: 0 },
            uc_count: { toNumber: () => 2, low: 2, high: 0 },
            depends_on: [],
          },
          {
            id: 'M-Auth', name: 'Auth', description: 'Auth module',
            entity_count: { toNumber: () => 1, low: 1, high: 0 },
            uc_count: { toNumber: () => 0, low: 0, high: 0 },
            depends_on: ['M-Sales'],
          },
        ],
      },
      {
        match: 'RELATES_TO',
        rows: [
          { source_module: 'M-Auth', target_module: 'M-Sales' },
        ],
      },
    ]);

    const scene = await renderBoard('context-map', null, driver);
    assert.equal(scene.type, 'excalidraw');
    assert.ok(scene.elements.length > 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids2 = (scene.elements as any[]).map((e) => e.id as unknown);
    assert.equal(new Set(ids2).size, ids2.length, 'unique ids');
  });
});

describe('renderBoard — activity renderer', () => {
  it('produces a scene with swimlanes and steps', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-001', uc_name: 'Create Order', step_id: 'AS-001', step_desc: 'Enter order details', actor: 'User', step_number: { toNumber: () => 1, low: 1, high: 0 } },
          { uc_id: 'UC-001', uc_name: 'Create Order', step_id: 'AS-002', step_desc: 'Validate data', actor: 'System', step_number: { toNumber: () => 2, low: 2, high: 0 } },
          { uc_id: 'UC-001', uc_name: 'Create Order', step_id: 'AS-003', step_desc: 'Save order', actor: 'System', step_number: { toNumber: () => 3, low: 3, high: 0 } },
        ],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-001', driver);
    assert.equal(scene.type, 'excalidraw');
    assert.ok(scene.elements.length > 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids3 = (scene.elements as any[]).map((e) => e.id as unknown);
    assert.equal(new Set(ids3).size, ids3.length, 'unique ids');
  });

  it('case-insensitive actor classification: "system"/"User"/"admin" route to correct lanes', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-X', uc_name: 'X', step_id: 'AS-1', step_desc: 'a', actor: 'User',   step_number: { toNumber: () => 1, low: 1, high: 0 } },
          { uc_id: 'UC-X', uc_name: 'X', step_id: 'AS-2', step_desc: 'b', actor: 'system', step_number: { toNumber: () => 2, low: 2, high: 0 } },
          { uc_id: 'UC-X', uc_name: 'X', step_id: 'AS-3', step_desc: 'c', actor: 'admin',  step_number: { toNumber: () => 3, low: 3, high: 0 } },
        ],
      },
    ]);
    const scene = await renderBoard('activity', 'UC-X', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const stepRect = (id: string) => els.find((e) => e.type === 'rectangle' && String(e.id) === id);
    // User-coloured (#2e7d32) on the user-lane steps; System-coloured (#1565c0) only on the actually-system one
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(stepRect('step-AS-1')?.strokeColor), '#2e7d32', 'User step → green stroke');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(stepRect('step-AS-2')?.strokeColor), '#1565c0', 'system (lowercase) step → blue stroke');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(stepRect('step-AS-3')?.strokeColor), '#2e7d32', 'admin step → user-side, green stroke');
    // System swimlane should be present (mixed UC, not all-null)
    assert.ok(els.some((e) => e.id === 'swim-system-bg'), 'system swimlane bg present in mixed UC');
  });

  it('long step description is wrapped onto multiple lines and rect grows', async () => {
    const { renderBoard } = await import('./index.js');

    const longText = 'Открыть приложение Семейный кинотеатр и выбрать категорию контента из меню';
    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-001', uc_name: 'X', step_id: 'AS-001', step_desc: longText, actor: 'User', step_number: { toNumber: () => 1, low: 1, high: 0 } },
        ],
      },
    ]);
    const scene = await renderBoard('activity', 'UC-001', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const stepText = els.find((e) => e.type === 'text' && e.containerId === 'step-AS-001');
    assert.ok(stepText, 'step text element exists');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.ok(String(stepText.text).includes('\n'), 'long step text must be wrapped with \\n');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(stepText.originalText), longText, 'originalText preserves the raw description');
  });

  it('placeholder step ("--") gets fallback text and dashed stroke', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-002', uc_name: 'X', step_id: 'AS-007', step_desc: '--', actor: 'User', step_number: { toNumber: () => 1, low: 1, high: 0 } },
        ],
      },
    ]);
    const scene = await renderBoard('activity', 'UC-002', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const stepRect = els.find((e) => e.type === 'rectangle' && String(e.id) === 'step-AS-007');
    assert.ok(stepRect, 'step rect exists');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(stepRect.strokeStyle), 'dashed', 'placeholder step has dashed border');
    const stepText = els.find((e) => e.type === 'text' && e.containerId === 'step-AS-007');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.ok(String(stepText.text).includes('AS-007'), 'fallback text includes the step id');
  });

  it('all-empty actor → single lane + warning banner, no system swimlane', async () => {
    const { renderBoard } = await import('./index.js');

    // Empty-string actor (the realistic Neo4j case) collapses to null after
    // classifyActor, just like a missing property would.
    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-003', uc_name: 'X', step_id: 'AS-1', step_desc: 'a', actor: '',   step_number: { toNumber: () => 1, low: 1, high: 0 } },
          { uc_id: 'UC-003', uc_name: 'X', step_id: 'AS-2', step_desc: 'b', actor: null, step_number: { toNumber: () => 2, low: 2, high: 0 } },
        ],
      },
    ]);
    const scene = await renderBoard('activity', 'UC-003', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const sysBg = els.find((e) => e.id === 'swim-system-bg');
    assert.equal(sysBg, undefined, 'system swimlane bg must NOT be rendered when actor is all null');
    const userBg = els.find((e) => e.id === 'swim-user-bg');
    assert.ok(userBg, 'user swimlane bg still rendered (now hosts every step)');
    const warning = els.find((e) => e.type === 'text' && String(e.id ?? '').startsWith('text-warning-UC-003-actor-missing'));
    assert.ok(warning, 'warning banner is added when actor is missing on every step');
    // Regression: warning text and header must use "actor" not legacy "actor_type"
    // These two assertions are RED until activity.ts lines 312 and 375 are updated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.ok(
      !String((warning as any).text ?? '').includes('actor_type'),
      `warning text must not contain legacy "actor_type" — got: ${(warning as any).text}`,
    );
    const userHeaderText = els.find((e) => e.id === 'text-swim-user-header');
    assert.ok(userHeaderText, 'user header text element must exist');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.ok(
      !String((userHeaderText as any).text ?? '').includes('actor_type'),
      `user header text must not contain legacy "actor_type" — got: ${(userHeaderText as any).text}`,
    );
  });

  it('multi-actor UC does not duplicate step boxes (fan-out regression)', async () => {
    const { renderBoard } = await import('./index.js');

    // Simulate the production fan-out: 2 distinct ActivitySteps × 2 ACTOR edges
    // = 4 rows returned by the buggy OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole).
    // Each step row is repeated twice (once per actor), exactly as the real query
    // returns when the UseCase has k=2 actors. The renderer must de-duplicate by
    // step_id and render exactly 2 step rectangles, not 4.
    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          // AS-001 row — repeated twice (fan-out from 2 ACTOR edges)
          { uc_id: 'UC-FAN', uc_name: 'Fan-out UC', step_id: 'AS-001', step_desc: 'Enter credentials', actor: 'User',   step_number: { toNumber: () => 1, low: 1, high: 0 } },
          { uc_id: 'UC-FAN', uc_name: 'Fan-out UC', step_id: 'AS-001', step_desc: 'Enter credentials', actor: 'User',   step_number: { toNumber: () => 1, low: 1, high: 0 } },
          // AS-002 row — repeated twice (fan-out from 2 ACTOR edges)
          { uc_id: 'UC-FAN', uc_name: 'Fan-out UC', step_id: 'AS-002', step_desc: 'Validate',          actor: 'System', step_number: { toNumber: () => 2, low: 2, high: 0 } },
          { uc_id: 'UC-FAN', uc_name: 'Fan-out UC', step_id: 'AS-002', step_desc: 'Validate',          actor: 'System', step_number: { toNumber: () => 2, low: 2, high: 0 } },
        ],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-FAN', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    // Count step rectangles: type==='rectangle' AND id starts with 'step-'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stepRects = els.filter((e: any) => e.type === 'rectangle' && String(e.id ?? '').startsWith('step-'));
    assert.equal(
      stepRects.length,
      2,
      `expected exactly 2 step rectangles (one per distinct ActivityStep) but got ${stepRects.length} — fan-out duplication detected`,
    );

    // Complementary: all step-rect element ids must be unique
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stepIds = stepRects.map((e: any) => String(e.id));
    assert.equal(
      new Set(stepIds).size,
      stepIds.length,
      `step rectangle ids must be unique — got duplicates: ${stepIds.join(', ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-1..TC-5: Activity renderer — diagram title (FR-001 / UC-003-BE)
// ---------------------------------------------------------------------------

describe('renderBoard — activity renderer title (FR-001)', () => {
  it('TC-1: emits a title element with id === "title-UC-003"', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-003', uc_name: 'Regenerate Board from Graph', step_id: 'AS-UC003-01', step_desc: 'Click Regenerate', actor: 'User', step_number: { toNumber: () => 1, low: 1, high: 0 } },
        ],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-003', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const titleEl = els.find((e: any) => String(e.id) === 'title-UC-003');
    assert.ok(titleEl, 'scene must contain an element with id "title-UC-003"');
  });

  it('TC-2: title element has correct text, type, fontSize, strokeColor, and dimensions', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-003', uc_name: 'Regenerate Board from Graph', step_id: 'AS-UC003-01', step_desc: 'Click Regenerate', actor: 'User', step_number: { toNumber: () => 1, low: 1, high: 0 } },
        ],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-003', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const titleEl = els.find((e: any) => String(e.id) === 'title-UC-003') as any;
    assert.ok(titleEl, 'title element must exist');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(titleEl.text), 'Regenerate Board from Graph (UC-003)', 'text must match FR-001 format: "${uc_name} (${ucId})"');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(titleEl.type), 'text', 'type must be "text"');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.ok(Number(titleEl.fontSize) >= 20, `fontSize must be >= 20; got ${String(titleEl.fontSize)}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(titleEl.strokeColor), '#1e1e1e', 'strokeColor must be #1e1e1e');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.ok(Number(titleEl.width) > 0, 'width must be non-zero');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.ok(Number(titleEl.height) > 0, 'height must be non-zero');
  });

  it('TC-3: title element survives assembleScene (not dropped from elements array)', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-003', uc_name: 'Regenerate Board from Graph', step_id: 'AS-UC003-01', step_desc: 'Click Regenerate', actor: 'User', step_number: { toNumber: () => 1, low: 1, high: 0 } },
        ],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-003', driver);
    // Iterate the full elements array post-assembleScene
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allIds = (scene.elements as any[]).map((e: any) => String(e.id));
    assert.ok(allIds.includes('title-UC-003'), `title-UC-003 must be in assembleScene output; found: [${allIds.join(', ')}]`);
  });

  it('TC-4: empty uc_name falls back to "(UC-003)" — no exception thrown, diagram still renders', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-003', uc_name: '', step_id: 'AS-UC003-01', step_desc: 'Click Regenerate', actor: 'User', step_number: { toNumber: () => 1, low: 1, high: 0 } },
        ],
      },
    ]);

    // Must not throw
    const scene = await renderBoard('activity', 'UC-003', driver);
    assert.equal(scene.type, 'excalidraw', 'scene type must be excalidraw');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const titleEl = els.find((e: any) => String(e.id) === 'title-UC-003') as any;
    assert.ok(titleEl, 'title element must still be emitted when uc_name is empty');
    // Decision: emit "(UC-003)" when uc_name is empty
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(titleEl.text), '(UC-003)', 'fallback text must be "(UC-003)" when uc_name is empty');
  });

  it('TC-5: title is the last element in the array (z-top, after bgRects and steps)', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-003', uc_name: 'Regenerate Board from Graph', step_id: 'AS-UC003-01', step_desc: 'Click Regenerate', actor: 'User', step_number: { toNumber: () => 1, low: 1, high: 0 } },
        ],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-003', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const lastEl = els[els.length - 1] as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(lastEl.id), 'title-UC-003', 'title element must be last in the elements array');
  });
});

describe('renderBoard — ba-process renderer', () => {
  it('produces a scene with role swimlanes and workflow steps', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'BusinessProcess',
        rows: [
          {
            bp_id: 'BP-001', bp_name: 'Order Processing',
            step_id: 'WS-001', step_name: 'Receive Order', stereotype: 'Бизнес-функция', step_number: { toNumber: () => 1, low: 1, high: 0 },
            role_id: 'BR-Manager', role_name: 'Manager',
            documents: [],
          },
          {
            bp_id: 'BP-001', bp_name: 'Order Processing',
            step_id: 'WS-002', step_name: 'Process Payment', stereotype: 'Автоматизируется', step_number: { toNumber: () => 2, low: 2, high: 0 },
            role_id: 'BR-System', role_name: 'System',
            documents: [{ doc_id: 'BE-Invoice', doc_name: 'Invoice', relation: 'PRODUCES' }],
          },
        ],
      },
    ]);

    const scene = await renderBoard('process', 'BP-001', driver);
    assert.equal(scene.type, 'excalidraw');
    assert.ok(scene.elements.length > 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids4 = (scene.elements as any[]).map((e) => e.id as unknown);
    assert.equal(new Set(ids4).size, ids4.length, 'unique ids');
  });
});

// ---------------------------------------------------------------------------
// Render style: clean (non-wireframe). Boards must generate with roughness 0
// (Excalidraw "Architect") rather than the hand-drawn roughness 1 ("Artist").
// Regression for: BA cannot switch off the sketchy look via board settings
// because the deterministic renderer overwrites it on every generation.
// ---------------------------------------------------------------------------

describe('render style — clean (roughness 0, not wireframe)', () => {
  it('factory defaults: makeRect / makeDiamond / makeArrow / makeText default to roughness 0', () => {
    const rect = makeRect({ logicalId: 'r', x: 0, y: 0, width: 50, height: 20 });
    assert.equal(rect.roughness, 0, 'rect default roughness must be 0');
    const diamond = makeDiamond({ logicalId: 'd', x: 0, y: 0, width: 50, height: 20 });
    assert.equal(diamond.roughness, 0, 'diamond default roughness must be 0');
    const arrow = makeArrow({ logicalId: 'a', startX: 0, startY: 0, endX: 10, endY: 10 });
    assert.equal(arrow.roughness, 0, 'arrow default roughness must be 0');
    const text = makeText({ logicalId: 't', x: 0, y: 0, width: 100, text: 'X' });
    assert.equal(text.roughness, 0, 'text roughness must be 0');
  });

  it('domain-model: every rectangle, arrow and text in the scene has roughness 0', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'DomainEntity',
        rows: [
          {
            id: 'DE-Order', name: 'Order', description: 'An order',
            module_name: 'Sales',
            attributes: [{ attr_name: 'id', attr_type: 'UUID' }],
            relationships: [],
          },
          {
            id: 'DE-Item', name: 'Item', description: 'Line item',
            module_name: 'Sales',
            attributes: [{ attr_name: 'qty', attr_type: 'Int' }],
            relationships: [{ target_id: 'DE-Order', target_name: 'Order', rel_type: 'belongs_to', cardinality: '*:1' }],
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    const scene = await renderBoard('domain-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const styled = els.filter((e) => e.type === 'rectangle' || e.type === 'arrow' || e.type === 'text');
    assert.ok(styled.length > 0, 'fixture must produce rect/arrow/text elements');
    for (const el of styled) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      assert.equal(Number(el.roughness), 0, `${String(el.type)} ${String(el.id)} must have roughness 0 (clean), got ${String(el.roughness)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Round-trip determinism test
// ---------------------------------------------------------------------------

describe('renderBoard — determinism and hash stability', () => {
  it('two consecutive renders of the same graph produce the same hash', async () => {
    const { renderBoard } = await import('./index.js');

    const driverFactory = () => makeFakeDriver([
      {
        match: 'DomainEntity',
        rows: [
          {
            id: 'DE-A', name: 'EntityA', description: null,
            module_name: null,
            attributes: [{ attr_name: 'id', attr_type: 'UUID' }],
            relationships: [],
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    const scene1 = await renderBoard('domain-model', null, driverFactory());
    const scene2 = await renderBoard('domain-model', null, driverFactory());

    const h1 = computeBoardHash(scene1);
    const h2 = computeBoardHash(scene2);
    assert.equal(h1, h2, 'consecutive renders must produce the same hash');
    assert.match(h1, /^sha256:[0-9a-f]{64}$/);
  });

  it('hash changes when graph data changes', async () => {
    const { renderBoard } = await import('./index.js');

    const driver1 = makeFakeDriver([
      {
        match: 'DomainEntity',
        rows: [
          { id: 'DE-A', name: 'EntityA', description: null, module_name: null, attributes: [], relationships: [] },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);
    const driver2 = makeFakeDriver([
      {
        match: 'DomainEntity',
        rows: [
          { id: 'DE-A', name: 'EntityA', description: null, module_name: null, attributes: [], relationships: [] },
          { id: 'DE-B', name: 'EntityB', description: null, module_name: null, attributes: [], relationships: [] },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    const scene1 = await renderBoard('domain-model', null, driver1);
    const scene2 = await renderBoard('domain-model', null, driver2);

    const h1 = computeBoardHash(scene1);
    const h2 = computeBoardHash(scene2);
    assert.notEqual(h1, h2, 'different graph → different hash');
  });
});
