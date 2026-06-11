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

  it('TC-NULL-STEP-NAME: step text element has non-empty text when ws.function_name is null in graph', async () => {
    // Regression for: WorkflowStep with function_name=null produces step rectangle
    // with text='' (invisible block). Expected: fallback to step_id so the block
    // is always readable on the canvas.
    const { renderBoard } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'BusinessProcess',
        rows: [
          {
            bp_id: 'BP-NULL', bp_name: 'Null Name Process',
            step_id: 'WS-NULL-01',
            step_name: null,           // simulates ws.function_name = null in Neo4j
            stereotype: null,
            step_number: { toNumber: () => 1, low: 1, high: 0 },
            role_id: 'BR-Analyst', role_name: 'Analyst',
            documents: [],
          },
        ],
      },
    ]);

    const scene = await renderBoard('process', 'BP-NULL', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    // Find the text element bound to the step rectangle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stepTextEl = els.find((e: any) => String(e.id) === 'text-step-BP-NULL-WS-NULL-01') as any;
    assert.ok(stepTextEl, 'step text element must be present in the scene');
    // The text must NOT be empty — the step rectangle must be visually readable
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.ok(
      String(stepTextEl.text).trim().length > 0,
      `step text must be non-empty when step_name is null; got: "${String(stepTextEl.text)}"`,
    );
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

// ---------------------------------------------------------------------------
// UC-021: Requirement cards on activity diagram
// ---------------------------------------------------------------------------

// Helper: a standard activity driver with 2 steps and configurable requirements.
//
// IMPORTANT: HAS_REQUIREMENT entry MUST come before HAS_STEP in the responses
// array. The REQUIREMENT_QUERY contains both HAS_REQUIREMENT and HAS_STEP (the
// latter in its OPTIONAL MATCH clause), so the fake driver would incorrectly match
// it against the HAS_STEP entry if HAS_STEP were listed first. By listing
// HAS_REQUIREMENT first, the REQUIREMENT_QUERY matches it on the first find(),
// while the ACTIVITY_QUERY (which only contains HAS_STEP) correctly skips the
// HAS_REQUIREMENT entry and matches HAS_STEP.
function makeActivityDriverWithRequirements(reqRows: FakeRow[]): Driver {
  return makeFakeDriver([
    {
      match: 'HAS_REQUIREMENT',
      rows: reqRows,
    },
    {
      match: 'HAS_STEP',
      rows: [
        { uc_id: 'UC-021', uc_name: 'Pay Invoice', step_id: 'AS-021-01', step_desc: 'Enter payment', actor: 'User',   step_number: { toNumber: () => 1, low: 1, high: 0 } },
        { uc_id: 'UC-021', uc_name: 'Pay Invoice', step_id: 'AS-021-02', step_desc: 'Validate card',  actor: 'System', step_number: { toNumber: () => 2, low: 2, high: 0 } },
      ],
    },
  ]);
}

describe('renderBoard — activity renderer requirement cards (UC-021)', () => {
  it('REQ-UC021-01: functional requirement is rendered as a «requirement» stereotyped rectangle', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeActivityDriverWithRequirements([
      {
        rq_id: 'RQ-F-001',
        rq_type: 'functional',
        description: 'System must validate payment details before processing',
        realized_steps: ['AS-021-02'],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-021', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    // Must have a rectangle with id matching the req card pattern
    const reqCard = els.find((e: any) => String(e.id) === 'req-UC021-RQ-F-001');
    assert.ok(reqCard, 'requirement card rect must exist with id req-UC021-RQ-F-001');
    assert.equal(String(reqCard.type), 'rectangle', 'requirement card must be a rectangle');

    // Must have a header text with «requirement» stereotype
    const headerText = els.find((e: any) =>
      e.type === 'text' &&
      e.containerId === 'req-UC021-RQ-F-001' &&
      String(e.text ?? '').includes('«requirement»')
    );
    assert.ok(headerText, 'requirement card must have a header text containing «requirement»');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.ok(String(headerText.text).includes('functional'), 'header must include rq_type');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.ok(String(headerText.text).includes('RQ-F-001'), 'header must include rq.id');
  });

  it('REQ-UC021-04: requirement card carries correct customData (nodeId, nodeType, stereotype)', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeActivityDriverWithRequirements([
      {
        rq_id: 'RQ-F-002',
        rq_type: 'behavioral',
        description: 'System must log every payment attempt',
        realized_steps: ['AS-021-01'],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-021', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const reqCard = els.find((e: any) => String(e.id) === 'req-UC021-RQ-F-002') as any;
    assert.ok(reqCard, 'requirement card must exist');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(reqCard.customData?.nodeId), 'RQ-F-002', 'customData.nodeId must equal rq.id');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(reqCard.customData?.nodeType), 'Requirement', 'customData.nodeType must be "Requirement"');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(reqCard.customData?.stereotype), 'behavioral', 'customData.stereotype must equal rq_type');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(reqCard.customData?.synced, true, 'customData.synced must be true');
  });

  it('REQ-UC021-02: one arrow per realized step — 1 step → 1 arrow, 2 steps → 2 arrows', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeActivityDriverWithRequirements([
      {
        rq_id: 'RQ-F-003',
        rq_type: 'functional',
        description: 'Requirement realized by two steps',
        realized_steps: ['AS-021-01', 'AS-021-02'],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-021', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    // Arrows whose startBinding points to the req card
    const reqCardId = 'req-UC021-RQ-F-003';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqArrows = els.filter((e: any) =>
      e.type === 'arrow' &&
      (e.startBinding as { elementId: string } | null)?.elementId === reqCardId
    );
    assert.equal(reqArrows.length, 2, 'a requirement realized by 2 steps must have exactly 2 arrows');

    // Verify arrow end-bindings point to the step rects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const endTargets = reqArrows.map((a: any) =>
      (a.endBinding as { elementId: string } | null)?.elementId
    );
    assert.ok(endTargets.includes('step-AS-021-01'), 'one arrow must point to step AS-021-01');
    assert.ok(endTargets.includes('step-AS-021-02'), 'one arrow must point to step AS-021-02');
  });

  it('REQ-UC021-02: one arrow — 1 step → 1 arrow from card to step', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeActivityDriverWithRequirements([
      {
        rq_id: 'RQ-F-004',
        rq_type: 'functional',
        description: 'Single-step realization',
        realized_steps: ['AS-021-01'],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-021', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const reqCardId = 'req-UC021-RQ-F-004';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqArrows = els.filter((e: any) =>
      e.type === 'arrow' &&
      (e.startBinding as { elementId: string } | null)?.elementId === reqCardId
    );
    assert.equal(reqArrows.length, 1, 'single-step requirement must have exactly 1 arrow');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const endTarget = (reqArrows[0] as any).endBinding as { elementId: string } | null;
    assert.equal(endTarget?.elementId, 'step-AS-021-01', 'arrow end-binding must point to step-AS-021-01');
  });

  it('non-functional/behavioral rq_type (nfr) is NOT drawn on the activity board', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeActivityDriverWithRequirements([
      {
        rq_id: 'RQ-N-001',
        rq_type: 'nfr',
        description: 'System must respond in under 200ms',
        realized_steps: ['AS-021-01'],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-021', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const nfrCard = els.find((e: any) => String(e.id) === 'req-UC021-RQ-N-001');
    assert.equal(nfrCard, undefined, 'nfr requirement must NOT be rendered on the activity board');

    // Also ensure no text mentioning RQ-N-001 is present
    const nfrText = els.find((e: any) => e.type === 'text' && String(e.text ?? '').includes('RQ-N-001'));
    assert.equal(nfrText, undefined, 'no text element must reference the nfr requirement id');
  });

  it('REQ-UC021-03: vacuous — zero REALIZED_BY edges produces byte-identical output', async () => {
    const { renderBoard } = await import('./index.js');

    // Driver with no requirements rows
    const driverWithReqs = makeActivityDriverWithRequirements([]);
    // Baseline: driver where HAS_REQUIREMENT query is never matched (simulates old code)
    const baselineDriver = makeFakeDriver([
      {
        match: 'HAS_STEP',
        rows: [
          { uc_id: 'UC-021', uc_name: 'Pay Invoice', step_id: 'AS-021-01', step_desc: 'Enter payment', actor: 'User',   step_number: { toNumber: () => 1, low: 1, high: 0 } },
          { uc_id: 'UC-021', uc_name: 'Pay Invoice', step_id: 'AS-021-02', step_desc: 'Validate card',  actor: 'System', step_number: { toNumber: () => 2, low: 2, high: 0 } },
        ],
      },
      // No HAS_REQUIREMENT match — simulates a UC with no requirements in the graph
    ]);

    const sceneWithEmpty = await renderBoard('activity', 'UC-021', driverWithReqs);
    const sceneBaseline = await renderBoard('activity', 'UC-021', baselineDriver);

    const h1 = computeBoardHash(sceneWithEmpty);
    const h2 = computeBoardHash(sceneBaseline);
    assert.equal(h1, h2, 'a UC with zero requirements must produce a board identical to the pre-feature baseline');

    // Also: no req-* elements
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqEls = (sceneWithEmpty.elements as any[]).filter((e: any) => String(e.id ?? '').startsWith('req-'));
    assert.equal(reqEls.length, 0, 'no req-* elements must be present when there are no requirements');
  });

  it('determinism: render→serialize→render again is byte-identical (with requirements)', async () => {
    const { renderBoard } = await import('./index.js');

    const driverFactory = () => makeActivityDriverWithRequirements([
      {
        rq_id: 'RQ-F-005',
        rq_type: 'functional',
        description: 'Determinism test requirement',
        realized_steps: ['AS-021-01', 'AS-021-02'],
      },
    ]);

    const scene1 = await renderBoard('activity', 'UC-021', driverFactory());
    const scene2 = await renderBoard('activity', 'UC-021', driverFactory());

    const h1 = computeBoardHash(scene1);
    const h2 = computeBoardHash(scene2);
    assert.equal(h1, h2, 'two renders of the same graph (with requirements) must produce the same hash');
  });

  it('requirement card and its texts share groupIds ["group-req-<rqId>"]', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeActivityDriverWithRequirements([
      {
        rq_id: 'RQ-F-006',
        rq_type: 'functional',
        description: 'Grouping test',
        realized_steps: ['AS-021-01'],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-021', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const reqCard = els.find((e: any) => String(e.id) === 'req-UC021-RQ-F-006') as any;
    assert.ok(reqCard, 'requirement card must exist');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.ok(
      (reqCard.groupIds as string[]).includes('group-req-RQ-F-006'),
      `requirement card must be in group group-req-RQ-F-006; got: ${JSON.stringify(reqCard.groupIds)}`,
    );

    // All text elements with containerId === reqCard.id should also have the same group
    const cardTexts = els.filter((e: any) =>
      e.type === 'text' && e.containerId === 'req-UC021-RQ-F-006'
    );
    assert.ok(cardTexts.length > 0, 'requirement card must have at least one bound text element');
    for (const t of cardTexts) {
      assert.ok(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (t.groupIds as string[]).includes('group-req-RQ-F-006'),
        `text element ${String(t.id)} must be in group-req-RQ-F-006`,
      );
    }
  });

  it('requirement arrows are NOT placed in groupIds', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeActivityDriverWithRequirements([
      {
        rq_id: 'RQ-F-007',
        rq_type: 'functional',
        description: 'Arrow groupId test',
        realized_steps: ['AS-021-01'],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-021', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const reqCardId = 'req-UC021-RQ-F-007';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqArrows = els.filter((e: any) =>
      e.type === 'arrow' &&
      (e.startBinding as { elementId: string } | null)?.elementId === reqCardId
    );
    assert.ok(reqArrows.length > 0, 'at least one requirement arrow must exist');
    for (const arrow of reqArrows) {
      assert.deepEqual(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (arrow as any).groupIds,
        [],
        'requirement arrows must NOT be in any groupIds',
      );
    }
  });

  it('all element ids in a scene with requirements are unique', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeActivityDriverWithRequirements([
      {
        rq_id: 'RQ-F-008',
        rq_type: 'functional',
        description: 'Uniqueness test',
        realized_steps: ['AS-021-01', 'AS-021-02'],
      },
      {
        rq_id: 'RQ-B-001',
        rq_type: 'behavioral',
        description: 'Another requirement',
        realized_steps: ['AS-021-02'],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-021', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allIds = (scene.elements as any[]).map((e: any) => String(e.id));
    assert.equal(new Set(allIds).size, allIds.length, 'all element ids must be unique');
  });

  it('stable ordering by rq.id: RQ-B-001 card appears before RQ-F-008 card', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeActivityDriverWithRequirements([
      // Return in non-alphabetical order; renderer must sort by rq_id
      {
        rq_id: 'RQ-F-008',
        rq_type: 'functional',
        description: 'F requirement',
        realized_steps: ['AS-021-01'],
      },
      {
        rq_id: 'RQ-B-001',
        rq_type: 'behavioral',
        description: 'B requirement',
        realized_steps: ['AS-021-02'],
      },
    ]);

    const scene = await renderBoard('activity', 'UC-021', driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const bIdx = els.findIndex((e: any) => String(e.id) === 'req-UC021-RQ-B-001');
    const fIdx = els.findIndex((e: any) => String(e.id) === 'req-UC021-RQ-F-008');
    assert.ok(bIdx !== -1, 'RQ-B-001 card must exist');
    assert.ok(fIdx !== -1, 'RQ-F-008 card must exist');
    assert.ok(bIdx < fIdx, `RQ-B-001 (idx ${bIdx}) must appear before RQ-F-008 (idx ${fIdx}) — stable sort by rq.id`);
  });
});

// ---------------------------------------------------------------------------
// UC-022: Interface-model board renderer
// ---------------------------------------------------------------------------

// Helper: build a fake driver for the interface-model renderer.
// The renderer fires TWO queries:
//   1. FORMS_QUERY  — matched by 'HAS_FIELD'   (Form/Screen + fields + MAPS_TO)
//   2. REQS_QUERY   — matched by 'REALIZED_BY' (interface/validation requirements)
function makeIfaceDriver(formRows: FakeRow[], reqRows: FakeRow[]): Driver {
  return makeFakeDriver([
    { match: 'HAS_FIELD',   rows: formRows },
    { match: 'REALIZED_BY', rows: reqRows  },
  ]);
}

describe('renderBoard — interface-model renderer (UC-022)', () => {
  // REQ-UC022-01: each Form/Screen → class-like card; header shows stereotype + id
  it('REQ-UC022-01a: Form node renders as a rectangle; header text contains «form» and the node id', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-001', name: 'LoginForm',
          fields: [],
        },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const card = els.find((e: any) => String(e.id) === 'iface-FRM-001');
    assert.ok(card, 'Form card rect must exist with id iface-FRM-001');
    assert.equal(String(card.type), 'rectangle', 'Form card must be a rectangle');

    // Header text: bound to card (containerId = card.id) and contains «form» + id
    const headerText = els.find((e: any) =>
      e.type === 'text' &&
      e.containerId === 'iface-FRM-001' &&
      String(e.text ?? '').includes('«form»') &&
      String(e.text ?? '').includes('FRM-001')
    );
    assert.ok(headerText, 'Form card header text must contain «form» and FRM-001');
  });

  it('REQ-UC022-01b: Screen node renders with «screen» stereotype in header', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Screen', id: 'SCR-001', name: 'DashboardScreen',
          fields: [],
        },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const headerText = els.find((e: any) =>
      e.type === 'text' &&
      e.containerId === 'iface-SCR-001' &&
      String(e.text ?? '').includes('«screen»') &&
      String(e.text ?? '').includes('SCR-001')
    );
    assert.ok(headerText, 'Screen card header must contain «screen» and SCR-001');
  });

  // REQ-UC022-01c: unknown kind falls back to «interface»
  it('REQ-UC022-01c: unknown kind node falls back to «interface» stereotype', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Widget', id: 'WGT-001', name: 'SearchWidget',
          fields: [],
        },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const headerText = els.find((e: any) =>
      e.type === 'text' &&
      e.containerId === 'iface-WGT-001' &&
      String(e.text ?? '').includes('«interface»') &&
      String(e.text ?? '').includes('WGT-001')
    );
    assert.ok(headerText, 'Unknown-kind card header must contain «interface» and WGT-001');
  });

  // REQ-UC022-02: FormFields as member rows
  it('REQ-UC022-02a: FormField member rows are rendered as text elements inside the card group', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-002', name: 'RegisterForm',
          fields: [
            { field: 'FF-001', fname: 'email',    ftype: 'email',  maps_to_attr: null, maps_to_entity: null },
            { field: 'FF-002', fname: 'password', ftype: 'string', maps_to_attr: null, maps_to_entity: null },
          ],
        },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    // Expect 2 field-row text elements
    const fieldRows = els.filter((e: any) =>
      e.type === 'text' &&
      (String(e.text ?? '').includes('email') || String(e.text ?? '').includes('password'))
    );
    assert.ok(fieldRows.length >= 2, `Expected at least 2 field rows, got ${fieldRows.length}`);

    // Each field row must be in the card's group
    for (const row of fieldRows) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      assert.ok(
        (row.groupIds as string[]).includes('group-iface-FRM-002'),
        `Field row ${String(row.id)} must be in group-iface-FRM-002`,
      );
    }
  });

  // REQ-UC022-02: MAPS_TO arrows to domain entities
  it('REQ-UC022-02b: MAPS_TO arrows drawn from form card to domain-entity cards (one per entity)', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-003', name: 'OrderForm',
          fields: [
            { field: 'FF-010', fname: 'orderId', ftype: 'string', maps_to_attr: 'id', maps_to_entity: 'DE-Order' },
            { field: 'FF-011', fname: 'amount',  ftype: 'number', maps_to_attr: 'total', maps_to_entity: 'DE-Order' },
          ],
        },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    // Should have a domain entity card for DE-Order
    const deCard = els.find((e: any) => String(e.id) === 'iface-de-DE-Order');
    assert.ok(deCard, 'Domain entity card iface-de-DE-Order must be rendered for MAPS_TO target');

    // Should have exactly one MAPS_TO arrow from FRM-003 to DE-Order
    const mapsToArrows = els.filter((e: any) =>
      e.type === 'arrow' &&
      (e.startBinding as { elementId: string } | null)?.elementId === 'iface-FRM-003' &&
      (e.endBinding as { elementId: string } | null)?.elementId === 'iface-de-DE-Order'
    );
    assert.equal(mapsToArrows.length, 1, 'Exactly 1 MAPS_TO arrow from FRM-003 to DE-Order (deduplicated)');
  });

  it('REQ-UC022-02c: two forms with different MAPS_TO targets produce two arrows', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-A', name: 'FormA',
          fields: [
            { field: 'FF-A1', fname: 'x', ftype: 'string', maps_to_attr: 'id', maps_to_entity: 'DE-X' },
          ],
        },
        {
          kind: 'Form', id: 'FRM-B', name: 'FormB',
          fields: [
            { field: 'FF-B1', fname: 'y', ftype: 'string', maps_to_attr: 'id', maps_to_entity: 'DE-Y' },
          ],
        },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const arrowsFromA = els.filter((e: any) =>
      e.type === 'arrow' &&
      (e.startBinding as { elementId: string } | null)?.elementId === 'iface-FRM-A'
    );
    const arrowsFromB = els.filter((e: any) =>
      e.type === 'arrow' &&
      (e.startBinding as { elementId: string } | null)?.elementId === 'iface-FRM-B'
    );
    assert.equal(arrowsFromA.length, 1, 'FRM-A must have 1 MAPS_TO arrow');
    assert.equal(arrowsFromB.length, 1, 'FRM-B must have 1 MAPS_TO arrow');
  });

  // REQ-UC022-03: interface/validation requirements anchored via REALIZED_BY
  it('REQ-UC022-03a: interface requirement anchored to a Form renders as «requirement» rect with arrow to form card', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-010', name: 'LoginForm',
          fields: [],
        },
      ],
      [
        {
          rq_id: 'RQ-I-001', rq_type: 'interface', description: 'Form must have accessible labels',
          target_label: 'Form', target_id: 'FRM-010',
        },
      ],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const reqCard = els.find((e: any) => String(e.id) === 'iface-req-RQ-I-001');
    assert.ok(reqCard, 'Requirement card iface-req-RQ-I-001 must exist');
    assert.equal(String(reqCard.type), 'rectangle', 'Requirement card must be a rectangle');

    // Header text contains «requirement» stereotype
    const reqHeader = els.find((e: any) =>
      e.type === 'text' &&
      e.containerId === 'iface-req-RQ-I-001' &&
      String(e.text ?? '').includes('«requirement»')
    );
    assert.ok(reqHeader, 'Requirement card must have header with «requirement» stereotype');

    // Arrow from req card to form card
    const reqArrows = els.filter((e: any) =>
      e.type === 'arrow' &&
      (e.startBinding as { elementId: string } | null)?.elementId === 'iface-req-RQ-I-001' &&
      (e.endBinding as { elementId: string } | null)?.elementId === 'iface-FRM-010'
    );
    assert.equal(reqArrows.length, 1, 'Requirement must have exactly 1 arrow to the Form card');
  });

  it('REQ-UC022-03b: requirement card carries correct customData (nodeId, nodeType="Requirement", synced=true)', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        { kind: 'Screen', id: 'SCR-010', name: 'ProfileScreen', fields: [] },
      ],
      [
        {
          rq_id: 'RQ-V-001', rq_type: 'validation', description: 'Email must be valid format',
          target_label: 'Screen', target_id: 'SCR-010',
        },
      ],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const reqCard = els.find((e: any) => String(e.id) === 'iface-req-RQ-V-001') as any;
    assert.ok(reqCard, 'Requirement card must exist');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(reqCard.customData?.nodeId), 'RQ-V-001');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(reqCard.customData?.nodeType), 'Requirement');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(reqCard.customData?.synced, true);
  });

  it('REQ-UC022-03c: validation requirement anchored to a FormField renders with arrow to the parent Form card', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-020', name: 'PaymentForm',
          fields: [
            { field: 'FF-020', fname: 'cardNumber', ftype: 'string', maps_to_attr: null, maps_to_entity: null },
          ],
        },
      ],
      [
        {
          rq_id: 'RQ-V-002', rq_type: 'validation', description: 'Card number must be 16 digits',
          target_label: 'FormField', target_id: 'FF-020',
        },
      ],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const reqCard = els.find((e: any) => String(e.id) === 'iface-req-RQ-V-002');
    assert.ok(reqCard, 'Requirement card iface-req-RQ-V-002 must exist');

    // Arrow must exist from the requirement card
    const reqArrow = els.find((e: any) =>
      e.type === 'arrow' &&
      (e.startBinding as { elementId: string } | null)?.elementId === 'iface-req-RQ-V-002'
    );
    assert.ok(reqArrow, 'Requirement card anchored to FormField must have at least one arrow');
  });

  // REQ-UC022-04: Form card carries correct customData
  it('REQ-UC022-04a: Form card customData has nodeId, nodeType="Form", synced=true', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        { kind: 'Form', id: 'FRM-030', name: 'SomeForm', fields: [] },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const card = els.find((e: any) => String(e.id) === 'iface-FRM-030') as any;
    assert.ok(card, 'Form card must exist');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(card.customData?.nodeId), 'FRM-030');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(card.customData?.nodeType), 'Form');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(card.customData?.synced, true);
  });

  it('REQ-UC022-04b: Screen card customData.nodeType is "Screen"', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        { kind: 'Screen', id: 'SCR-030', name: 'SomeScreen', fields: [] },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const card = els.find((e: any) => String(e.id) === 'iface-SCR-030') as any;
    assert.ok(card, 'Screen card must exist');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    assert.equal(String(card.customData?.nodeType), 'Screen');
  });

  // REQ-UC022-05: groupIds — card rect, header text, field rows all in same group
  it('REQ-UC022-05: Form card rect and its texts share groupIds ["group-iface-<id>"]', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-040', name: 'SomeForm',
          fields: [
            { field: 'FF-040', fname: 'name', ftype: 'string', maps_to_attr: null, maps_to_entity: null },
          ],
        },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const groupName = 'group-iface-FRM-040';
    const groupMembers = els.filter((e: any) => (e.groupIds as string[]).includes(groupName));
    assert.ok(groupMembers.length >= 3, `Card rect + header + 1 field row must share group ${groupName}; found ${groupMembers.length}`);
  });

  // REQ-UC022-05: arrows outside groups
  it('REQ-UC022-05: MAPS_TO arrows are NOT in any groupIds', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-050', name: 'ArrowGroupTest',
          fields: [
            { field: 'FF-050', fname: 'x', ftype: 'string', maps_to_attr: 'id', maps_to_entity: 'DE-Z' },
          ],
        },
      ],
      [],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];

    const arrows = els.filter((e: any) => e.type === 'arrow');
    assert.ok(arrows.length > 0, 'must have at least one arrow');
    for (const arrow of arrows) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      assert.deepEqual((arrow as any).groupIds, [], `Arrow ${String((arrow as any).id)} must not be in any group`);
    }
  });

  // REQ-UC022-VACUOUS: empty graph → vacuous board
  it('VACUOUS: empty graph (no Form/Screen) renders an empty elements array', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver([], []);
    const scene = await renderBoard('interface-model', null, driver);
    assert.equal(scene.type, 'excalidraw', 'scene type must be excalidraw');
    assert.equal(scene.elements.length, 0, 'empty graph must produce zero elements');
  });

  // REQ-UC022-DETERMINISM: two consecutive renders are byte-identical
  it('DETERMINISM: two consecutive renders of the same graph produce the same hash', async () => {
    const { renderBoard } = await import('./index.js');

    const driverFactory = () => makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-DET', name: 'DetForm',
          fields: [
            { field: 'FF-DET', fname: 'x', ftype: 'string', maps_to_attr: 'id', maps_to_entity: 'DE-DET' },
          ],
        },
      ],
      [
        {
          rq_id: 'RQ-DET-001', rq_type: 'interface', description: 'Det req',
          target_label: 'Form', target_id: 'FRM-DET',
        },
      ],
    );

    const scene1 = await renderBoard('interface-model', null, driverFactory());
    const scene2 = await renderBoard('interface-model', null, driverFactory());
    const h1 = computeBoardHash(scene1);
    const h2 = computeBoardHash(scene2);
    assert.equal(h1, h2, 'consecutive renders must produce the same hash');
    assert.match(h1, /^sha256:[0-9a-f]{64}$/);
  });

  // REQ-UC022-UNIQUE-IDS: all element ids unique
  it('UNIQUE-IDS: all element ids in the scene are unique', async () => {
    const { renderBoard } = await import('./index.js');

    const driver = makeIfaceDriver(
      [
        {
          kind: 'Form', id: 'FRM-U1', name: 'UniqueA',
          fields: [
            { field: 'FF-U1', fname: 'a', ftype: 'string', maps_to_attr: 'id', maps_to_entity: 'DE-U1' },
          ],
        },
        {
          kind: 'Screen', id: 'SCR-U2', name: 'UniqueB',
          fields: [
            { field: 'FF-U2', fname: 'b', ftype: 'number', maps_to_attr: 'code', maps_to_entity: 'DE-U1' },
          ],
        },
      ],
      [
        {
          rq_id: 'RQ-U-001', rq_type: 'validation', description: 'Unique IDs test req',
          target_label: 'Form', target_id: 'FRM-U1',
        },
      ],
    );

    const scene = await renderBoard('interface-model', null, driver);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allIds = (scene.elements as any[]).map((e: any) => String(e.id));
    assert.equal(new Set(allIds).size, allIds.length, `all element ids must be unique; found duplicates in: [${allIds.join(', ')}]`);
  });
});

// REQ-UC022: renderable discovery and board-classifier
describe('renderable — interface-model discovery (UC-022)', () => {
  it('board is discoverable when graph has ≥1 Form or Screen', async () => {
    const { discoverRenderable } = await import('../services/renderable.js');

    const driver = makeFakeDriver([
      { match: 'Form', rows: [{ c: 1 }] },
    ]);

    const boards = await discoverRenderable(driver);
    const iface = boards.find((b) => b.board === 'interface-model');
    assert.ok(iface, 'interface-model board must be discoverable when Form/Screen nodes exist');
    assert.equal(iface?.kind, 'interface-model');
    assert.equal(iface?.relatedId, null);
  });

  it('board is NOT discoverable when graph has 0 Form/Screen', async () => {
    const { discoverRenderable } = await import('../services/renderable.js');

    // All counts return 0 / empty
    const driver = makeFakeDriver([
      { match: 'DomainEntity', rows: [{ c: 0 }] },
      { match: 'Module',       rows: [{ c: 0 }] },
      { match: 'Form',         rows: [{ c: 0 }] },
    ]);

    const boards = await discoverRenderable(driver);
    const iface = boards.find((b) => b.board === 'interface-model');
    assert.equal(iface, undefined, 'interface-model board must NOT be discoverable when no Form/Screen');
  });
});

describe('board-classifier — interface-model classification (UC-022)', () => {
  it('classifies "interface-model" as kind="interface-model"', async () => {
    const { classifyBoard } = await import('../services/board-classifier.js');
    const cls = classifyBoard('interface-model');
    assert.equal(cls.kind, 'interface-model', 'classifier must return kind="interface-model"');
    assert.equal(cls.relatedId, null);
  });
});

// ---------------------------------------------------------------------------
// UC-023-A: state-machine renderer — Screen* family
// ---------------------------------------------------------------------------

function makeScreenStateMachineDriver(): Driver {
  return makeFakeDriver([
    // Runtime family query — matched by 'RuntimeContract'
    { match: 'RuntimeContract', rows: [] },
    // Screen family query — matched by 'Screen'
    {
      match: 'Screen',
      rows: [
        {
          contract: 'SCR-Home',
          states: ['ST-idle', 'ST-loading', 'ST-loaded'],
          initial: ['ST-idle'],
          terminal: ['ST-loaded'],
          transitions: [
            { tr: 'TR-001', from: 'ST-idle',    to: 'ST-loading', event: 'load' },
            { tr: 'TR-002', from: 'ST-loading',  to: 'ST-loaded',  event: 'success' },
          ],
        },
      ],
    },
  ]);
}

describe('renderBoard — state-machine renderer, Screen* family (UC-023)', () => {
  it('REQ-UC023-01a: Screen family renders state node rectangles for each state', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('state-machine', 'SCR-Home', makeScreenStateMachineDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    assert.equal(scene.type, 'excalidraw');
    // There must be 3 state rectangles (one per state)
    const stateRects = els.filter((e: any) =>
      e.type === 'rectangle' &&
      String(e.customData?.nodeType ?? '') === 'ScreenState'
    );
    assert.equal(stateRects.length, 3, 'must render 3 ScreenState rectangles');
  });

  it('REQ-UC023-01b: transition arrows are rendered with event labels', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('state-machine', 'SCR-Home', makeScreenStateMachineDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    // Count only transition arrows (not the start-marker arrow which has no nodeId)
    const transitionArrows = els.filter((e: any) =>
      e.type === 'arrow' &&
      String(e.customData?.nodeType ?? '') !== 'start-arrow' &&
      String(e.id ?? '').startsWith('sm-tr-')
    );
    assert.equal(transitionArrows.length, 2, 'must render 2 transition arrows');
    // Each arrow must have a label text element
    const arrowIds = new Set(transitionArrows.map((a: any) => String(a.id)));
    const labelTexts = els.filter((e: any) =>
      e.type === 'text' &&
      arrowIds.has(String(e.containerId ?? ''))
    );
    assert.equal(labelTexts.length, 2, 'each transition arrow must have a label text');
    // Check event names appear in labels
    const labelContents = labelTexts.map((t: any) => String(t.text ?? ''));
    assert.ok(labelContents.some((s) => s.includes('load')), 'label must contain event name "load"');
    assert.ok(labelContents.some((s) => s.includes('success')), 'label must contain event name "success"');
  });

  it('REQ-UC023-02a: initial state has a distinct start-marker (dot) element', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('state-machine', 'SCR-Home', makeScreenStateMachineDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    // The initial state should have a start marker — an ellipse or rect with nodeType='start-marker'
    const startMarker = els.find((e: any) =>
      String(e.customData?.nodeType ?? '') === 'start-marker' ||
      String(e.id ?? '').startsWith('sm-start-')
    );
    assert.ok(startMarker, 'initial state must have a start-marker element');
  });

  it('REQ-UC023-02b: terminal state rect has double-border (strokeWidth >= 4) or a customData terminal flag', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('state-machine', 'SCR-Home', makeScreenStateMachineDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const terminalRect = els.find((e: any) =>
      e.type === 'rectangle' &&
      String(e.customData?.nodeId ?? '') === 'ST-loaded'
    ) as any;
    assert.ok(terminalRect, 'terminal state must be rendered as a rectangle');
    // Double-border: strokeWidth >= 4 OR customData.terminal === true
    const isDistinct =
      Number(terminalRect.strokeWidth) >= 4 ||
      terminalRect.customData?.terminal === true;
    assert.ok(isDistinct, 'terminal state must be visually distinguished (strokeWidth>=4 or customData.terminal)');
  });

  it('VACUOUS: empty graph (no Screen) renders empty scene', async () => {
    const { renderBoard } = await import('./index.js');
    const driver = makeFakeDriver([
      { match: 'RuntimeContract', rows: [] },
      { match: 'Screen', rows: [] },
    ]);
    const scene = await renderBoard('state-machine', 'SCR-Missing', driver);
    assert.equal(scene.type, 'excalidraw');
    assert.equal(scene.elements.length, 0, 'vacuous: no elements when source node absent');
  });

  it('DETERMINISM: two consecutive renders produce the same hash (Screen family)', async () => {
    const { renderBoard } = await import('./index.js');
    const { computeBoardHash } = await import('../services/meta.js');
    const scene1 = await renderBoard('state-machine', 'SCR-Home', makeScreenStateMachineDriver());
    const scene2 = await renderBoard('state-machine', 'SCR-Home', makeScreenStateMachineDriver());
    const h1 = computeBoardHash(scene1);
    const h2 = computeBoardHash(scene2);
    assert.equal(h1, h2, 'consecutive renders must produce the same hash');
    assert.match(h1, /^sha256:[0-9a-f]{64}$/);
  });

  it('UNIQUE-IDS: all element ids are unique (Screen family)', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('state-machine', 'SCR-Home', makeScreenStateMachineDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allIds = (scene.elements as any[]).map((e: any) => String(e.id));
    assert.equal(new Set(allIds).size, allIds.length, 'all element ids must be unique');
  });

  it('customData.synced is true on state rect and transition arrow', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('state-machine', 'SCR-Home', makeScreenStateMachineDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const stateRect = els.find((e: any) =>
      e.type === 'rectangle' &&
      String(e.customData?.nodeId ?? '') === 'ST-idle'
    ) as any;
    assert.ok(stateRect, 'ST-idle rect must exist');
    assert.equal(stateRect.customData?.synced, true, 'state rect must have customData.synced=true');
    const arrow = els.find((e: any) => e.type === 'arrow') as any;
    assert.ok(arrow, 'transition arrow must exist');
    assert.equal(arrow.customData?.synced, true, 'transition arrow must have customData.synced=true');
  });
});

// ---------------------------------------------------------------------------
// UC-023-A: state-machine renderer — Runtime* family
// ---------------------------------------------------------------------------

function makeRuntimeStateMachineDriver(): Driver {
  return makeFakeDriver([
    // Runtime family query — matched by 'RuntimeContract'
    {
      match: 'RuntimeContract',
      rows: [
        {
          contract: 'RC-Payment',
          states: ['RS-idle', 'RS-processing', 'RS-done'],
          initial: ['RS-idle'],
          terminal: ['RS-done'],
          transitions: [
            { tr: 'RT-001', from: 'RS-idle',       to: 'RS-processing', event: 'start' },
            { tr: 'RT-002', from: 'RS-processing',  to: 'RS-done',       event: 'complete' },
          ],
        },
      ],
    },
    // Screen family query — returns nothing (so runtime branch is taken)
    { match: 'Screen', rows: [] },
  ]);
}

describe('renderBoard — state-machine renderer, Runtime* family (UC-023)', () => {
  it('REQ-UC023-01c: RuntimeContract family renders state node rectangles (nodeType=RuntimeState)', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('state-machine', 'RC-Payment', makeRuntimeStateMachineDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    assert.equal(scene.type, 'excalidraw');
    const stateRects = els.filter((e: any) =>
      e.type === 'rectangle' &&
      String(e.customData?.nodeType ?? '') === 'RuntimeState'
    );
    assert.equal(stateRects.length, 3, 'must render 3 RuntimeState rectangles');
  });

  it('REQ-UC023-01d: RuntimeTransition arrows have event labels', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('state-machine', 'RC-Payment', makeRuntimeStateMachineDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    // Count only transition arrows (not the start-marker arrow)
    const transitionArrows = els.filter((e: any) =>
      e.type === 'arrow' &&
      String(e.id ?? '').startsWith('sm-tr-')
    );
    assert.equal(transitionArrows.length, 2, 'must render 2 transition arrows');
    const arrowIds = new Set(transitionArrows.map((a: any) => String(a.id)));
    const labelTexts = els.filter((e: any) =>
      e.type === 'text' &&
      arrowIds.has(String(e.containerId ?? ''))
    );
    assert.equal(labelTexts.length, 2, 'each arrow must have a label');
    const contents = labelTexts.map((t: any) => String(t.text ?? ''));
    assert.ok(contents.some((s) => s.includes('start')),    'label must contain "start"');
    assert.ok(contents.some((s) => s.includes('complete')), 'label must contain "complete"');
  });

  it('UNIQUE-IDS: all element ids are unique (Runtime family)', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('state-machine', 'RC-Payment', makeRuntimeStateMachineDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allIds = (scene.elements as any[]).map((e: any) => String(e.id));
    assert.equal(new Set(allIds).size, allIds.length, 'all element ids must be unique (runtime)');
  });

  it('DETERMINISM: Runtime family render→render is byte-identical', async () => {
    const { renderBoard } = await import('./index.js');
    const { computeBoardHash } = await import('../services/meta.js');
    const s1 = await renderBoard('state-machine', 'RC-Payment', makeRuntimeStateMachineDriver());
    const s2 = await renderBoard('state-machine', 'RC-Payment', makeRuntimeStateMachineDriver());
    assert.equal(computeBoardHash(s1), computeBoardHash(s2), 'runtime render must be deterministic');
  });
});

// ---------------------------------------------------------------------------
// UC-023-A: renderable discovery + board-classifier for state-machine
// ---------------------------------------------------------------------------

describe('renderable — state-machine discovery (UC-023)', () => {
  it('state-machine boards are discoverable from RuntimeContract nodes', async () => {
    const { discoverRenderable } = await import('../services/renderable.js');
    const driver = makeFakeDriver([
      // count RuntimeContract
      { match: 'RuntimeContract', rows: [{ id: 'RC-001' }, { id: 'RC-002' }] },
      // count Screen — zero
      { match: 'Screen', rows: [] },
    ]);
    const boards = await discoverRenderable(driver);
    const smBoards = boards.filter((b) => b.kind === 'state-machine');
    assert.ok(smBoards.length >= 1, 'must discover at least 1 state-machine board from RuntimeContracts');
    assert.ok(smBoards.every((b) => b.relatedId !== null), 'each state-machine board must have a relatedId');
  });

  it('state-machine boards are discoverable from Screen nodes', async () => {
    const { discoverRenderable } = await import('../services/renderable.js');
    const driver = makeFakeDriver([
      // no RuntimeContract
      { match: 'RuntimeContract', rows: [] },
      // two Screens with states
      { match: 'Screen', rows: [{ id: 'SCR-001' }, { id: 'SCR-002' }] },
    ]);
    const boards = await discoverRenderable(driver);
    const smBoards = boards.filter((b) => b.kind === 'state-machine');
    assert.ok(smBoards.length >= 1, 'must discover at least 1 state-machine board from Screens');
  });
});

describe('board-classifier — state-machine classification (UC-023)', () => {
  it('classifies "state-machine-SCR-Home" correctly', async () => {
    const { classifyBoard } = await import('../services/board-classifier.js');
    const cls = classifyBoard('state-machine-SCR-Home');
    assert.equal(cls.kind, 'state-machine', 'kind must be state-machine');
    assert.equal(cls.relatedId, 'SCR-Home', 'relatedId must be extracted from basename');
  });

  it('classifies "state-machine-RC-Payment" correctly', async () => {
    const { classifyBoard } = await import('../services/board-classifier.js');
    const cls = classifyBoard('state-machine-RC-Payment');
    assert.equal(cls.kind, 'state-machine');
    assert.equal(cls.relatedId, 'RC-Payment');
  });
});

// ---------------------------------------------------------------------------
// UC-023-B: code-contract renderer
// ---------------------------------------------------------------------------

function makeCodeContractDriver(): Driver {
  return makeFakeDriver([
    {
      match: 'APIEndpoint',
      rows: [
        {
          kind: 'APIEndpoint',
          id: 'API-001',
          method: 'POST',
          path: '/orders',
          req: 'CreateOrderDto',
          res: 'OrderDto',
          consumes: ['DE-Order'],
          produces: ['DE-Order'],
        },
        {
          kind: 'ExternalContract',
          id: 'EXT-001',
          method: 'REST',
          path: 'PaymentGateway',
          req: null,
          res: null,
          consumes: [],
          produces: [],
        },
      ],
    },
  ]);
}

describe('renderBoard — code-contract renderer (UC-023)', () => {
  it('REQ-UC023-03a: APIEndpoint renders as a rectangle with «interface» header', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('code-contract', null, makeCodeContractDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    assert.equal(scene.type, 'excalidraw');

    const apiCard = els.find((e: any) => String(e.id) === 'cc-API-001');
    assert.ok(apiCard, 'APIEndpoint card with id cc-API-001 must exist');
    assert.equal(String(apiCard.type), 'rectangle', 'APIEndpoint card must be a rectangle');

    const headerText = els.find((e: any) =>
      e.type === 'text' &&
      e.containerId === 'cc-API-001' &&
      String(e.text ?? '').includes('«interface»')
    );
    assert.ok(headerText, 'APIEndpoint card must have header text with «interface» stereotype');
  });

  it('REQ-UC023-03b: APIEndpoint card shows METHOD and path', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('code-contract', null, makeCodeContractDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const methodPathText = els.find((e: any) =>
      e.type === 'text' &&
      (e.containerId === 'cc-API-001' || String(e.id ?? '').includes('API-001')) &&
      String(e.text ?? '').includes('POST') &&
      String(e.text ?? '').includes('/orders')
    );
    assert.ok(methodPathText, 'APIEndpoint card must show "POST /orders"');
  });

  it('REQ-UC023-03c: ExternalContract renders as a card', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('code-contract', null, makeCodeContractDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const extCard = els.find((e: any) =>
      e.type === 'rectangle' &&
      String(e.customData?.nodeId ?? '') === 'EXT-001'
    );
    assert.ok(extCard, 'ExternalContract card for EXT-001 must be rendered');
    assert.equal(String(extCard.customData?.nodeType), 'ExternalContract');
    assert.equal(extCard.customData?.synced, true);
  });

  it('REQ-UC023-03d: CONSUMES arrow drawn from APIEndpoint to DomainEntity card', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('code-contract', null, makeCodeContractDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    // DomainEntity card should exist for DE-Order
    const deCard = els.find((e: any) =>
      e.type === 'rectangle' &&
      String(e.customData?.nodeId ?? '') === 'DE-Order'
    );
    assert.ok(deCard, 'DomainEntity card for DE-Order must be rendered');
    // Arrow from API card to DE-Order card
    const consumesArrow = els.find((e: any) =>
      e.type === 'arrow' &&
      (e.startBinding as { elementId: string } | null)?.elementId === 'cc-API-001' &&
      (e.endBinding as { elementId: string } | null)?.elementId === String(deCard.id)
    );
    assert.ok(consumesArrow, 'CONSUMES arrow must connect API-001 to DE-Order');
  });

  it('REQ-UC023-03e: APIEndpoint card customData has nodeId, nodeType="APIEndpoint", synced=true', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('code-contract', null, makeCodeContractDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const apiCard = els.find((e: any) => String(e.id) === 'cc-API-001') as any;
    assert.ok(apiCard, 'APIEndpoint card must exist');
    assert.equal(String(apiCard.customData?.nodeId), 'API-001');
    assert.equal(String(apiCard.customData?.nodeType), 'APIEndpoint');
    assert.equal(apiCard.customData?.synced, true);
  });

  it('VACUOUS: no APIEndpoint/ExternalContract → empty scene', async () => {
    const { renderBoard } = await import('./index.js');
    const driver = makeFakeDriver([
      { match: 'APIEndpoint', rows: [] },
    ]);
    const scene = await renderBoard('code-contract', null, driver);
    assert.equal(scene.type, 'excalidraw');
    assert.equal(scene.elements.length, 0, 'vacuous: no elements when no contract nodes');
  });

  it('UNIQUE-IDS: all element ids are unique', async () => {
    const { renderBoard } = await import('./index.js');
    const scene = await renderBoard('code-contract', null, makeCodeContractDriver());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allIds = (scene.elements as any[]).map((e: any) => String(e.id));
    assert.equal(new Set(allIds).size, allIds.length, 'all element ids must be unique');
  });

  it('DETERMINISM: two consecutive renders produce the same hash', async () => {
    const { renderBoard } = await import('./index.js');
    const { computeBoardHash } = await import('../services/meta.js');
    const s1 = await renderBoard('code-contract', null, makeCodeContractDriver());
    const s2 = await renderBoard('code-contract', null, makeCodeContractDriver());
    assert.equal(computeBoardHash(s1), computeBoardHash(s2), 'code-contract render must be deterministic');
  });
});

// ---------------------------------------------------------------------------
// UC-023-B: renderable discovery + board-classifier for code-contract
// ---------------------------------------------------------------------------

describe('renderable — code-contract discovery (UC-023)', () => {
  it('code-contract board is discoverable when ≥1 APIEndpoint exists', async () => {
    const { discoverRenderable } = await import('../services/renderable.js');
    const driver = makeFakeDriver([
      { match: 'APIEndpoint', rows: [{ c: 4 }] },
    ]);
    const boards = await discoverRenderable(driver);
    const cc = boards.find((b) => b.board === 'code-contract');
    assert.ok(cc, 'code-contract board must be discoverable when APIEndpoint nodes exist');
    assert.equal(cc?.kind, 'code-contract');
    assert.equal(cc?.relatedId, null);
  });

  it('code-contract board is discoverable when only ExternalContract nodes exist', async () => {
    const { discoverRenderable } = await import('../services/renderable.js');
    const driver = makeFakeDriver([
      { match: 'APIEndpoint', rows: [{ c: 0 }] },
      { match: 'ExternalContract', rows: [{ c: 2 }] },
    ]);
    const boards = await discoverRenderable(driver);
    const cc = boards.find((b) => b.board === 'code-contract');
    assert.ok(cc, 'code-contract board must be discoverable when ExternalContract nodes exist');
  });

  it('code-contract board is NOT discoverable when neither exist', async () => {
    const { discoverRenderable } = await import('../services/renderable.js');
    const driver = makeFakeDriver([
      { match: 'DomainEntity',    rows: [{ c: 0 }] },
      { match: 'Module',          rows: [{ c: 0 }] },
      { match: 'APIEndpoint',     rows: [{ c: 0 }] },
      { match: 'ExternalContract',rows: [{ c: 0 }] },
    ]);
    const boards = await discoverRenderable(driver);
    const cc = boards.find((b) => b.board === 'code-contract');
    assert.equal(cc, undefined, 'code-contract board must NOT be discoverable when no APIEndpoint/ExternalContract');
  });
});

describe('board-classifier — code-contract classification (UC-023)', () => {
  it('classifies "code-contract" as kind="code-contract"', async () => {
    const { classifyBoard } = await import('../services/board-classifier.js');
    const cls = classifyBoard('code-contract');
    assert.equal(cls.kind, 'code-contract', 'kind must be code-contract');
    assert.equal(cls.relatedId, null);
  });
});

// ---------------------------------------------------------------------------
// REQ-UC023-05: domain-model regression — RELATES_TO→ExternalContract
// ---------------------------------------------------------------------------

describe('renderBoard — domain-model regression (REQ-UC023-05)', () => {
  it('domain-model does NOT crash when a RELATES_TO target_id points to ExternalContract (not in entity set)', async () => {
    const { renderBoard } = await import('./index.js');
    // Simulate a DomainEntity with a RELATES_TO edge pointing at an ExternalContract id.
    // The entity query returns only DomainEntity nodes; a RELATES_TO target that is not
    // a DomainEntity simply won't be in the entity card map — the renderer must not throw
    // and must not produce any arrow for the unresolvable target.
    const driver = makeFakeDriver([
      {
        match: 'DomainEntity',
        rows: [
          {
            id: 'DE-Order', name: 'Order', description: null, module_name: null,
            attributes: [],
            // RELATES_TO pointing at an ExternalContract id — not a DomainEntity
            relationships: [{ target_id: 'EXT-Payment', target_name: 'PaymentGateway', rel_type: 'uses', cardinality: '*:1' }],
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    let scene;
    try {
      scene = await renderBoard('domain-model', null, driver);
    } catch (err) {
      assert.fail(`domain-model must not throw when RELATES_TO target is ExternalContract; got: ${String(err)}`);
    }

    assert.equal(scene.type, 'excalidraw', 'scene type must be excalidraw');
    // The entity card for DE-Order must be present
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = scene.elements as any[];
    const entityCard = els.find((e: any) => String(e.id) === 'entity-DE-Order');
    assert.ok(entityCard, 'DE-Order entity card must be present');
    // No arrow for the unresolvable target (EXT-Payment is not in the entity set)
    const relArrows = els.filter((e: any) => e.type === 'arrow');
    const unresolvableArrow = relArrows.find((a: any) =>
      String(a.id ?? '').includes('EXT-Payment')
    );
    assert.equal(unresolvableArrow, undefined, 'no arrow must be drawn for an unresolvable RELATES_TO target');
  });
});
