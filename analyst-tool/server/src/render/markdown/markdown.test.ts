/**
 * markdown.test.ts — unit tests for the deterministic Markdown renderer pipeline.
 *
 * Tests cover:
 *  1. mermaid.ts: sanitizeMermaidId, mapCardinality, buildClassDiagram,
 *     buildActivityFlowchart, buildFormMappingFlowchart.
 *  2. Each renderer (entity, uc, form, domain-model, uc-index, traceability)
 *     with a mock driver returning fixture records.
 *  3. Decision-branch tests (entity-no-enums, UC-no-roles, etc.).
 *  4. Structural equivalence checks on output.
 *
 * Mock driver pattern mirrors render.test.ts / render.test.ts.
 * Does NOT hit live Neo4j.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Text normalisation helpers (for structural-equivalence checks)
// ---------------------------------------------------------------------------

/**
 * Normalise Markdown for comparison:
 *  - trim trailing spaces per line
 *  - collapse 3+ consecutive blank lines into 2
 *  - replace date: YYYY-MM-DD with a fixed placeholder
 *  - trim leading/trailing whitespace
 */
function normalise(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/^date: \d{4}-\d{2}-\d{2}$/gm, 'date: 2000-01-01')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Fake Driver (mirrors render.test.ts pattern)
// ---------------------------------------------------------------------------

type FakeRow = Record<string, unknown>;

function makeFakeDriver(
  responses: { match: string; rows: FakeRow[] }[],
): import('neo4j-driver').Driver {
  return {
    session() {
      return {
        async run(cypher: string) {
          const resp = responses.find((r) => cypher.includes(r.match));
          const records = (resp?.rows ?? []).map((row) => ({
            get(key: string | number) {
              // Support numeric index (for traceability count queries `result.records[0].get(0)`)
              if (typeof key === 'number') {
                const firstVal = Object.values(row)[key];
                if (firstVal === undefined) return null;
                if (typeof firstVal === 'number') return { toNumber: () => firstVal, low: firstVal, high: 0 };
                return firstVal;
              }
              const val = row[key];
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
  } as unknown as import('neo4j-driver').Driver;
}

// ===========================================================================
// 1. mermaid.ts unit tests
// ===========================================================================

describe('sanitizeMermaidId', () => {
  it('replaces hyphens with underscores', async () => {
    const { sanitizeMermaidId } = await import('./mermaid.js');
    assert.equal(sanitizeMermaidId('UC-101'), 'UC_101');
    assert.equal(sanitizeMermaidId('OBJ-001-A01'), 'OBJ_001_A01');
    assert.equal(sanitizeMermaidId('DE-Order'), 'DE_Order');
  });

  it('leaves non-hyphen strings unchanged', async () => {
    const { sanitizeMermaidId } = await import('./mermaid.js');
    assert.equal(sanitizeMermaidId('SimpleId'), 'SimpleId');
    assert.equal(sanitizeMermaidId(''), '');
  });
});

describe('mapCardinality', () => {
  it('maps 1:N correctly', async () => {
    const { mapCardinality } = await import('./mermaid.js');
    assert.deepEqual(mapCardinality('1:N'), ['"1"', '"*"']);
  });

  it('maps N:1 correctly', async () => {
    const { mapCardinality } = await import('./mermaid.js');
    assert.deepEqual(mapCardinality('N:1'), ['"*"', '"1"']);
  });

  it('maps N:M correctly', async () => {
    const { mapCardinality } = await import('./mermaid.js');
    assert.deepEqual(mapCardinality('N:M'), ['"*"', '"*"']);
  });

  it('maps 1:1 correctly', async () => {
    const { mapCardinality } = await import('./mermaid.js');
    assert.deepEqual(mapCardinality('1:1'), ['"1"', '"1"']);
  });

  it('returns empty strings for unknown cardinality', async () => {
    const { mapCardinality } = await import('./mermaid.js');
    assert.deepEqual(mapCardinality('X:Y'), ['', '']);
    assert.deepEqual(mapCardinality(null), ['', '']);
  });
});

describe('buildClassDiagram', () => {
  it('emits class block with attributes', async () => {
    const { buildClassDiagram } = await import('./mermaid.js');
    const diagram = buildClassDiagram([{
      name: 'Order',
      attributes: [{ name: 'id', data_type: 'UUID' }, { name: 'total', data_type: 'Decimal' }],
      relationships: [],
      enumerations: [],
    }]);
    assert.ok(diagram.includes('classDiagram'));
    assert.ok(diagram.includes('class Order {'));
    assert.ok(diagram.includes('+UUID id'));
    assert.ok(diagram.includes('+Decimal total'));
  });

  it('emits relationship with cardinality', async () => {
    const { buildClassDiagram } = await import('./mermaid.js');
    const diagram = buildClassDiagram([{
      name: 'Order',
      attributes: [],
      relationships: [{ target_id: 'DE-Item', target_name: 'Item', rel_type: 'has', cardinality: '1:N' }],
      enumerations: [],
    }]);
    assert.ok(diagram.includes('"1" --> "*"'));
    assert.ok(diagram.includes(': has'));
  });

  it('emits enumeration block', async () => {
    const { buildClassDiagram } = await import('./mermaid.js');
    const diagram = buildClassDiagram([{
      name: 'Order',
      attributes: [],
      relationships: [],
      enumerations: [{ enum_id: 'EN-Status', enum_name: 'OrderStatus', values: ['PENDING', 'DONE'] }],
    }]);
    assert.ok(diagram.includes('class OrderStatus {'));
    assert.ok(diagram.includes('<<enumeration>>'));
    assert.ok(diagram.includes('PENDING'));
    assert.ok(diagram.includes('DONE'));
    assert.ok(diagram.includes('Order --> OrderStatus'));
  });

  it('deduplication: A→B and B→A with same rel_type keeps only one (A.name < B.name)', async () => {
    const { buildClassDiagram } = await import('./mermaid.js');
    const diagram = buildClassDiagram([
      {
        name: 'Alpha',
        attributes: [],
        relationships: [{ target_id: 'DE-Beta', target_name: 'Beta', rel_type: 'links', cardinality: '1:N' }],
        enumerations: [],
      },
      {
        name: 'Beta',
        attributes: [],
        relationships: [{ target_id: 'DE-Alpha', target_name: 'Alpha', rel_type: 'links', cardinality: 'N:1' }],
        enumerations: [],
      },
    ], true);

    // With deduplication: Alpha < Beta, so Alpha→Beta stays; Beta→Alpha is dropped.
    // Count occurrences of "links" relationship lines
    const relLines = diagram.split('\n').filter((l) => l.includes(': links'));
    assert.equal(relLines.length, 1, 'deduplication must keep exactly one relationship line');
  });
});

describe('buildActivityFlowchart', () => {
  it('returns minimal flowchart for empty steps', async () => {
    const { buildActivityFlowchart } = await import('./mermaid.js');
    const fc = buildActivityFlowchart([]);
    assert.ok(fc.includes('flowchart TD'));
    assert.ok(fc.includes('Начало'));
  });

  it('renders sequential steps with arrows', async () => {
    const { buildActivityFlowchart } = await import('./mermaid.js');
    const fc = buildActivityFlowchart([
      { id: 'AS-001', step_number: 1, description: 'Start', step_type: 'start', actor: null },
      { id: 'AS-002', step_number: 2, description: 'Do work', step_type: 'action', actor: 'User' },
      { id: 'AS-003', step_number: 3, description: 'End', step_type: 'end', actor: null },
    ]);
    assert.ok(fc.includes('AS_001 --> AS_002'));
    assert.ok(fc.includes('AS_002 --> AS_003'));
  });

  it('decision steps use diamond syntax', async () => {
    const { buildActivityFlowchart } = await import('./mermaid.js');
    const fc = buildActivityFlowchart([
      { id: 'AS-001', step_number: 1, description: 'Is valid?', step_type: 'decision', actor: null },
    ]);
    assert.ok(fc.includes('AS_001{"Is valid?"}'));
  });

  it('start/end steps use stadium syntax', async () => {
    const { buildActivityFlowchart } = await import('./mermaid.js');
    const fc = buildActivityFlowchart([
      { id: 'AS-001', step_number: 1, description: 'Begin', step_type: 'start', actor: null },
    ]);
    assert.ok(fc.includes('AS_001(["Begin"])'));
  });

  it('groups steps into subgraphs when actors are present', async () => {
    const { buildActivityFlowchart } = await import('./mermaid.js');
    const fc = buildActivityFlowchart([
      { id: 'AS-001', step_number: 1, description: 'Fill form', step_type: 'action', actor: 'User' },
      { id: 'AS-002', step_number: 2, description: 'Validate', step_type: 'action', actor: 'System' },
    ]);
    assert.ok(fc.includes('subgraph User["User"]'));
    assert.ok(fc.includes('subgraph System["System"]'));
  });
});

describe('buildFormMappingFlowchart', () => {
  it('emits form subgraph and domain subgraph', async () => {
    const { buildFormMappingFlowchart } = await import('./mermaid.js');
    const fc = buildFormMappingFlowchart('OrderForm', [
      {
        field_name: 'email',
        field_id: 'FF-001',
        field_type: 'text',
        field_label: 'Email',
        attr_name: 'email',
        attr_id: 'DA-001',
        attr_type: 'String',
        entity_name: 'User',
        entity_id: 'DE-User',
      },
    ]);
    assert.ok(fc.includes('subgraph Form["OrderForm"]'));
    assert.ok(fc.includes('subgraph Domain["Domain Model"]'));
    assert.ok(fc.includes('FF_001 --> DA_001'));
  });

  it('emits dashed arrow for unmapped fields', async () => {
    const { buildFormMappingFlowchart } = await import('./mermaid.js');
    const fc = buildFormMappingFlowchart('TestForm', [
      {
        field_name: 'note',
        field_id: 'FF-002',
        field_type: 'textarea',
        field_label: 'Note',
        attr_name: null,
        attr_id: null,
        attr_type: null,
        entity_name: null,
        entity_id: null,
      },
    ]);
    assert.ok(fc.includes('FF_002 -.-> Unmapped["unmapped"]'));
  });
});

// ===========================================================================
// 2. entity renderer
// ===========================================================================

describe('renderEntityMd', () => {
  it('renders entity with attributes, relationships, enumerations', async () => {
    const { renderEntityMd } = await import('./entity.js');

    const fixtureSourceFile = 'docs/12-domain/entities/order.md';

    const driver = makeFakeDriver([
      {
        // Main entity query (no enum join)
        match: 'REALIZED_AS',
        rows: [
          {
            de: { properties: { id: 'DE-Order', name: 'Order', description: 'An order entity' } },
            attributes: [{ name: 'id', data_type: 'UUID' }, { name: 'total', data_type: 'Decimal' }],
            relationships: [{ target_id: 'DE-Item', target_name: 'Item', rel_type: 'has', cardinality: '1:N' }],
            ba_source_id: 'OBJ-001',
            ba_source_name: 'Заказ',
            module_id: 'M-Sales',
            module_name: 'Sales',
            source_file: fixtureSourceFile,
          },
        ],
      },
      {
        // Separate enum query (SKILL.md fallback, lines 94-97)
        match: 'HAS_ENUM',
        rows: [
          { 'en.id': 'EN-Status', 'en.name': 'OrderStatus', values: ['PENDING', 'DONE'] },
        ],
      },
    ]);

    const result = await renderEntityMd(driver, 'DE-Order', '/project');
    const norm = normalise(result.content);

    assert.ok(norm.includes('title: "Order"'), 'frontmatter title');
    assert.ok(norm.includes('type: entity'), 'frontmatter type');
    assert.ok(norm.includes('# Order'), 'h1 header');
    assert.ok(norm.includes('## Описание'), 'description section');
    assert.ok(norm.includes('An order entity'), 'description content');
    assert.ok(norm.includes('## BA-источник'), 'ba source section');
    assert.ok(norm.includes('OBJ-001'), 'ba source id');
    assert.ok(norm.includes('## Диаграмма классов'), 'diagram section');
    assert.ok(norm.includes('classDiagram'), 'mermaid diagram');
    assert.ok(norm.includes('+UUID id'), 'attribute in diagram');
    assert.ok(norm.includes('## Атрибуты'), 'attributes table');
    assert.ok(norm.includes('## Связи'), 'relationships section');
    assert.ok(norm.includes('1:N'), 'cardinality in relationships');
    assert.ok(norm.includes('## Справочники'), 'enumerations section');
    assert.ok(norm.includes('OrderStatus'), 'enum name');
    assert.ok(norm.includes('PENDING'), 'enum value');

    // Path must come from source_file
    const { resolve } = await import('node:path');
    assert.equal(result.path, resolve('/project', fixtureSourceFile), `path must equal resolve(projectRoot, source_file)`);
  });

  it('omits BA-source section when ba_source_id is null', async () => {
    const { renderEntityMd } = await import('./entity.js');

    const driver = makeFakeDriver([
      {
        match: 'REALIZED_AS',
        rows: [
          {
            de: { properties: { id: 'DE-Foo', name: 'Foo', description: 'desc' } },
            attributes: [],
            relationships: [],
            ba_source_id: null,
            ba_source_name: null,
            module_id: null,
            module_name: null,
            source_file: 'docs/12-domain/entities/foo.md',
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    const result = await renderEntityMd(driver, 'DE-Foo', '/project');
    assert.ok(!result.content.includes('## BA-источник'), 'BA-source section must be omitted');
  });

  it('omits Справочники section when no enumerations', async () => {
    const { renderEntityMd } = await import('./entity.js');

    const driver = makeFakeDriver([
      {
        match: 'REALIZED_AS',
        rows: [
          {
            de: { properties: { id: 'DE-Bar', name: 'Bar', description: 'desc' } },
            attributes: [{ name: 'x', data_type: 'String' }],
            relationships: [],
            ba_source_id: null,
            ba_source_name: null,
            module_id: null,
            module_name: null,
            source_file: 'docs/12-domain/entities/bar.md',
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    const result = await renderEntityMd(driver, 'DE-Bar', '/project');
    assert.ok(!result.content.includes('## Справочники'), 'Справочники section must be omitted when no enums');
  });

  it('throws 404 when entity not found', async () => {
    const { renderEntityMd } = await import('./entity.js');
    const driver = makeFakeDriver([
      { match: 'REALIZED_AS', rows: [] },
      { match: 'HAS_ENUM', rows: [] },
    ]);
    await assert.rejects(
      () => renderEntityMd(driver, 'DE-Missing', '/project'),
      (err: { code?: string }) => err.code === 'entity_not_found',
    );
  });

  it('throws MissingSourceFileError when graph result has no source_file', async () => {
    const { renderEntityMd } = await import('./entity.js');
    const { MissingSourceFileError } = await import('./errors.js');

    const driver = makeFakeDriver([
      {
        match: 'REALIZED_AS',
        rows: [
          {
            de: { properties: { id: 'DE-NoSf', name: 'NoSf', description: null } },
            attributes: [],
            relationships: [],
            ba_source_id: null,
            ba_source_name: null,
            module_id: null,
            module_name: null,
            source_file: null,
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    await assert.rejects(
      () => renderEntityMd(driver, 'DE-NoSf', '/project'),
      MissingSourceFileError,
    );
  });

  it('is deterministic: two consecutive renders produce identical output', async () => {
    const { renderEntityMd } = await import('./entity.js');
    const makeDriver = () => makeFakeDriver([
      {
        match: 'REALIZED_AS',
        rows: [
          {
            de: { properties: { id: 'DE-X', name: 'X', description: null } },
            attributes: [{ name: 'a', data_type: 'Int' }],
            relationships: [],
            ba_source_id: null,
            ba_source_name: null,
            module_id: null,
            module_name: null,
            source_file: 'docs/12-domain/entities/x.md',
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    const r1 = await renderEntityMd(makeDriver(), 'DE-X', '/project');
    const r2 = await renderEntityMd(makeDriver(), 'DE-X', '/project');
    assert.equal(normalise(r1.content), normalise(r2.content), 'output must be deterministic');
  });
});

// ===========================================================================
// 3. uc renderer
// ===========================================================================

describe('renderUcMd', () => {
  it('renders use case with steps, roles, and requirements', async () => {
    const { renderUcMd } = await import('./uc.js');

    const fixtureSourceFile = 'docs/14-usecases/UC001-create-order.md';

    const driver = makeFakeDriver([
      {
        match: 'UseCase {id',
        rows: [
          {
            uc: { properties: { id: 'UC-001', name: 'Create Order', description: 'User creates order', goal: 'create order', benefit: 'manage orders', priority: 'primary' } },
            activity_steps: [
              { properties: { id: 'AS-001', step_number: 1, description: 'Fill form', step_type: 'action', actor: 'User' } },
              { properties: { id: 'AS-002', step_number: 2, description: 'Save', step_type: 'action', actor: 'System' } },
            ],
            forms: [{ properties: { id: 'FORM-001', name: 'OrderForm' } }],
            field_mappings: [
              { field: { properties: { id: 'FF-001', name: 'email' } }, attr: { properties: { id: 'DA-001', name: 'email' } }, entity: { properties: { id: 'DE-User', name: 'User' } } },
            ],
            requirements: [
              { properties: { id: 'RQ-001', description: 'Must validate input', type: 'functional', priority: 'high' } },
            ],
            roles: [{ properties: { id: 'SR-001', name: 'Customer' } }],
            module_id: 'M-Orders',
            module_name: 'Orders',
            dependencies: [{ properties: { id: 'UC-000', name: 'Login' } }],
            source_file: fixtureSourceFile,
          },
        ],
      },
    ]);

    const result = await renderUcMd(driver, 'UC-001', '/project');
    const norm = normalise(result.content);

    assert.ok(norm.includes('type: usecase'), 'frontmatter type');
    assert.ok(norm.includes('# UC-001. Create Order'), 'header');
    assert.ok(norm.includes('## User Story'), 'user story section');
    assert.ok(norm.includes('Customer'), 'role in user story');
    assert.ok(norm.includes('## Актор'), 'actor section');
    assert.ok(norm.includes('## Activity Diagram'), 'activity diagram section');
    assert.ok(norm.includes('flowchart TD'), 'mermaid flowchart');
    assert.ok(norm.includes('## Шаги сценария'), 'steps table');
    assert.ok(norm.includes('Fill form'), 'step description');
    assert.ok(norm.includes('## Формы'), 'forms section');
    assert.ok(norm.includes('## Требования'), 'requirements section');
    assert.ok(norm.includes('Must validate input'), 'requirement description');
    assert.ok(norm.includes('## Зависимости'), 'dependencies section');
    assert.ok(norm.includes('UC-000'), 'dependency id');

    // Path must come from source_file
    const { resolve } = await import('node:path');
    assert.equal(result.path, resolve('/project', fixtureSourceFile), 'path must equal resolve(projectRoot, source_file)');
  });

  it('omits Актор section when no roles', async () => {
    const { renderUcMd } = await import('./uc.js');

    const driver = makeFakeDriver([
      {
        match: 'UseCase {id',
        rows: [
          {
            uc: { properties: { id: 'UC-002', name: 'Simple UC', description: 'desc', goal: null, benefit: null, priority: null } },
            activity_steps: [],
            forms: [],
            field_mappings: [],
            requirements: [],
            roles: [],
            module_id: null,
            module_name: null,
            dependencies: [],
            source_file: 'docs/14-usecases/UC002-simple-uc.md',
          },
        ],
      },
    ]);

    const result = await renderUcMd(driver, 'UC-002', '/project');
    assert.ok(!result.content.includes('## Актор'), 'Актор section must be omitted when no roles');
  });

  it('omits empty sections (forms, requirements, dependencies)', async () => {
    const { renderUcMd } = await import('./uc.js');

    const driver = makeFakeDriver([
      {
        match: 'UseCase {id',
        rows: [
          {
            uc: { properties: { id: 'UC-003', name: 'Minimal UC', description: 'desc', goal: null, benefit: null, priority: null } },
            activity_steps: [],
            forms: [],
            field_mappings: [],
            requirements: [],
            roles: [],
            module_id: null,
            module_name: null,
            dependencies: [],
            source_file: 'docs/14-usecases/UC003-minimal-uc.md',
          },
        ],
      },
    ]);

    const result = await renderUcMd(driver, 'UC-003', '/project');
    assert.ok(!result.content.includes('## Формы'), 'empty forms section must be omitted');
    assert.ok(!result.content.includes('## Требования'), 'empty requirements section must be omitted');
    assert.ok(!result.content.includes('## Зависимости'), 'empty dependencies section must be omitted');
  });

  it('throws 404 when UC not found', async () => {
    const { renderUcMd } = await import('./uc.js');
    const driver = makeFakeDriver([{ match: 'UseCase {id', rows: [] }]);
    await assert.rejects(
      () => renderUcMd(driver, 'UC-999', '/project'),
      (err: { code?: string }) => err.code === 'uc_not_found',
    );
  });

  it('throws MissingSourceFileError when graph result has no source_file', async () => {
    const { renderUcMd } = await import('./uc.js');
    const { MissingSourceFileError } = await import('./errors.js');

    const driver = makeFakeDriver([
      {
        match: 'UseCase {id',
        rows: [
          {
            uc: { properties: { id: 'UC-035', name: 'New Feature', description: null, goal: null, benefit: null, priority: null } },
            activity_steps: [],
            forms: [],
            field_mappings: [],
            requirements: [],
            roles: [],
            module_id: null,
            module_name: null,
            dependencies: [],
            source_file: null,
          },
        ],
      },
    ]);

    await assert.rejects(
      () => renderUcMd(driver, 'UC-035', '/project'),
      MissingSourceFileError,
    );
  });
});

// ===========================================================================
// 4. form renderer
// ===========================================================================

describe('renderFormMd', () => {
  it('renders form with field mappings and coverage stats', async () => {
    const { renderFormMd } = await import('./form.js');

    const fixtureSourceFile = 'docs/15-interfaces/screens/SCR-001-landing.md';

    const driver = makeFakeDriver([
      {
        match: 'Form {id',
        rows: [
          {
            f: { properties: { id: 'SCR-001', name: 'Landing Form' } },
            field_mappings: [
              { field_name: 'email', field_id: 'FF-001', field_type: 'text', field_label: 'Email', attr_name: 'email', attr_id: 'DA-001', attr_type: 'String', entity_name: 'User', entity_id: 'DE-User' },
              { field_name: 'phone', field_id: 'FF-002', field_type: 'text', field_label: 'Phone', attr_name: null, attr_id: null, attr_type: null, entity_name: null, entity_id: null },
            ],
            use_cases: [{ properties: { id: 'UC-001', name: 'Create Account' } }],
            source_file: fixtureSourceFile,
          },
        ],
      },
    ]);

    const result = await renderFormMd(driver, 'SCR-001', '/project');
    const norm = normalise(result.content);

    assert.ok(norm.includes('type: form-mapping'), 'frontmatter type');
    assert.ok(norm.includes('# Форма: Landing Form'), 'header');
    assert.ok(norm.includes('## Связанные UC'), 'UC section');
    assert.ok(norm.includes('UC-001'), 'UC id');
    assert.ok(norm.includes('## Диаграмма маппинга'), 'diagram section');
    assert.ok(norm.includes('flowchart LR'), 'mermaid flowchart LR');
    assert.ok(norm.includes('## Таблица полей'), 'fields table');
    assert.ok(norm.includes('## Покрытие'), 'coverage section');
    assert.ok(norm.includes('Полей: 2'), 'total fields');
    assert.ok(norm.includes('Замаплено: 1 (50%)'), 'mapped count and percent');
    assert.ok(norm.includes('Незамаплено: 1'), 'unmapped count');

    // Path must come from source_file
    const { resolve } = await import('node:path');
    assert.equal(result.path, resolve('/project', fixtureSourceFile), 'path must equal resolve(projectRoot, source_file)');
  });

  it('shows 100% coverage when all fields are mapped', async () => {
    const { renderFormMd } = await import('./form.js');

    const driver = makeFakeDriver([
      {
        match: 'Form {id',
        rows: [
          {
            f: { properties: { id: 'SCR-002', name: 'Login Form' } },
            field_mappings: [
              { field_name: 'user', field_id: 'FF-001', field_type: 'text', field_label: 'Username', attr_name: 'username', attr_id: 'DA-001', attr_type: 'String', entity_name: 'User', entity_id: 'DE-User' },
            ],
            use_cases: [],
            source_file: 'docs/15-interfaces/screens/SCR-002-login.md',
          },
        ],
      },
    ]);

    const result = await renderFormMd(driver, 'SCR-002', '/project');
    assert.ok(result.content.includes('Замаплено: 1 (100%)'), '100% coverage');
    assert.ok(result.content.includes('Незамаплено: 0'), '0 unmapped');
  });

  it('throws 404 when form not found', async () => {
    const { renderFormMd } = await import('./form.js');
    const driver = makeFakeDriver([{ match: 'Form {id', rows: [] }]);
    await assert.rejects(
      () => renderFormMd(driver, 'SCR-999', '/project'),
      (err: { code?: string }) => err.code === 'form_not_found',
    );
  });

  it('throws MissingSourceFileError when graph result has no source_file', async () => {
    const { renderFormMd } = await import('./form.js');
    const { MissingSourceFileError } = await import('./errors.js');

    const driver = makeFakeDriver([
      {
        match: 'Form {id',
        rows: [
          {
            f: { properties: { id: 'FORM-scr-008-admin-pipelines-list', name: 'Admin Pipelines List' } },
            field_mappings: [],
            use_cases: [],
            source_file: null,
          },
        ],
      },
    ]);

    await assert.rejects(
      () => renderFormMd(driver, 'FORM-scr-008-admin-pipelines-list', '/project'),
      MissingSourceFileError,
    );
  });
});

// ===========================================================================
// 5. domain-model renderer
// ===========================================================================

describe('renderDomainModelMd', () => {
  it('renders full domain model with class diagram, entities table, relations', async () => {
    const { renderDomainModelMd } = await import('./domain-model.js');

    const driver = makeFakeDriver([
      {
        match: 'CONTAINS_ENTITY',
        rows: [
          {
            de: { properties: { id: 'DE-Order', name: 'Order', description: 'Order entity' } },
            attributes: [{ name: 'id', data_type: 'UUID' }],
            relationships: [{ target_id: 'DE-Item', target_name: 'Item', rel_type: 'has', cardinality: '1:N' }],
            module_name: 'Sales',
          },
          {
            de: { properties: { id: 'DE-Item', name: 'Item', description: 'Line item' } },
            attributes: [{ name: 'qty', data_type: 'Int' }],
            relationships: [{ target_id: 'DE-Order', target_name: 'Order', rel_type: 'has', cardinality: 'N:1' }],
            module_name: 'Sales',
          },
        ],
      },
      {
        match: 'HAS_ENUM',
        rows: [],
      },
    ]);

    const result = await renderDomainModelMd(driver, '/project');
    const norm = normalise(result.content);

    assert.ok(norm.includes('title: "Domain Model"'), 'title');
    assert.ok(norm.includes('type: domain-model'), 'type');
    assert.ok(norm.includes('# Domain Model'), 'h1');
    assert.ok(norm.includes('classDiagram'), 'class diagram');
    assert.ok(norm.includes('## Сущности'), 'entities table');
    assert.ok(norm.includes('Order'), 'entity name in table');
    assert.ok(norm.includes('## Ключевые связи'), 'key relations section');

    // Deduplication: Order→Item and Item→Order must produce 1 rel line.
    // The "Ключевые связи" table has rows like "| Item | Order | has | N:1 |"
    // The classDiagram has lines like "Item ... --> ... Order : has"
    // Combined: check that exactly 1 data row exists in the key-relations table
    // (skip the header row which also contains "has" if it happens to be there)
    const tableSection = norm.split('## Ключевые связи')[1] ?? '';
    const tableDataRows = tableSection
      .split('\n')
      .filter((l) => l.startsWith('|') && !l.includes('Источник') && !l.includes('---'));
    assert.equal(tableDataRows.length, 1, 'only one relationship row after dedup');

    assert.equal(result.path, '/project/docs/12-domain/_domain-model.md', 'output path');
  });

  it('omits Справочники and Ключевые связи when empty', async () => {
    const { renderDomainModelMd } = await import('./domain-model.js');

    const driver = makeFakeDriver([
      {
        match: 'CONTAINS_ENTITY',
        rows: [
          {
            de: { properties: { id: 'DE-Solo', name: 'Solo', description: null } },
            attributes: [],
            relationships: [],
            module_name: null,
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    const result = await renderDomainModelMd(driver, '/project');
    assert.ok(!result.content.includes('## Справочники'), 'no enums section');
    assert.ok(!result.content.includes('## Ключевые связи'), 'no key relations section');
  });
});

// ===========================================================================
// 6. uc-index renderer
// ===========================================================================

describe('renderUcIndexMd', () => {
  it('renders UC index with statistics', async () => {
    const { renderUcIndexMd } = await import('./uc-index.js');

    const driver = makeFakeDriver([
      {
        match: 'MATCH (uc:UseCase)',
        rows: [
          { id: 'UC-001', name: 'Create Order', priority: 'primary', status: 'done', module_name: 'Sales', actors: ['Customer'], depends_on: [] },
          { id: 'UC-002', name: 'View Order', priority: 'secondary', status: 'draft', module_name: 'Sales', actors: ['Customer', 'Admin'], depends_on: ['UC-001'] },
          { id: 'UC-003', name: 'Ship Order', priority: 'primary', status: 'draft', module_name: 'Logistics', actors: [], depends_on: ['UC-001', 'UC-002'] },
        ],
      },
    ]);

    const result = await renderUcIndexMd(driver, '/project');
    const norm = normalise(result.content);

    assert.ok(norm.includes('title: "UC Index"'), 'title');
    assert.ok(norm.includes('type: uc-index'), 'type');
    assert.ok(norm.includes('# Реестр Use Cases'), 'h1');
    assert.ok(norm.includes('UC-001'), 'first uc row');
    assert.ok(norm.includes('## Статистика'), 'statistics section');
    assert.ok(norm.includes('Всего UC: 3'), 'total count');
    assert.ok(norm.includes('Primary: 2'), 'primary count');
    assert.ok(norm.includes('Secondary: 1'), 'secondary count');
    assert.ok(norm.includes('Logistics'), 'module in breakdown');

    assert.equal(result.path, '/project/docs/14-usecases/_uc-index.md', 'output path');
  });

  it('handles empty UC list', async () => {
    const { renderUcIndexMd } = await import('./uc-index.js');
    const driver = makeFakeDriver([{ match: 'MATCH (uc:UseCase)', rows: [] }]);
    const result = await renderUcIndexMd(driver, '/project');
    assert.ok(result.content.includes('Всего UC: 0'), 'zero count');
  });
});

// ===========================================================================
// 7. traceability renderer
// ===========================================================================

describe('renderTraceabilityMd', () => {
  it('renders traceability matrix with coverage stats', async () => {
    const { renderTraceabilityMd } = await import('./traceability.js');

    const driver = makeFakeDriver([
      {
        match: 'WorkflowStep',
        rows: [
          { category: 'Step→UC', ba_id: 'WS-001', ba_name: 'Receive Order', sa_id: 'UC-001', sa_name: 'Create Order' },
        ],
      },
      {
        // Count queries — all match on different substrings
        match: 'MATCH (ws:WorkflowStep) RETURN count',
        rows: [{ 'count(ws)': 5 }],
      },
    ]);

    const result = await renderTraceabilityMd(driver, '/project');
    const norm = normalise(result.content);

    assert.ok(norm.includes('title: "BA→SA Traceability Matrix"'), 'title');
    assert.ok(norm.includes('type: traceability'), 'type');
    assert.ok(norm.includes('# Трассировочная матрица BA → SA'), 'h1');
    assert.ok(norm.includes('## Покрытие'), 'coverage section');
    assert.ok(norm.includes('Шаги → UC'), 'steps row in coverage');
    assert.ok(norm.includes('## 1. Бизнес-шаги → Use Cases'), 'section 1');
    assert.ok(norm.includes('## 2. Бизнес-сущности → Domain Entities'), 'section 2');
    assert.ok(norm.includes('## 3. Бизнес-роли → System Roles'), 'section 3');
    assert.ok(norm.includes('## 4. Бизнес-правила → Requirements'), 'section 4');

    assert.equal(result.path, '/project/docs/99-meta/traceability-matrix.md', 'output path');
  });

  it('shows empty-row placeholders when categories have no data', async () => {
    const { renderTraceabilityMd } = await import('./traceability.js');

    const driver = makeFakeDriver([
      {
        match: 'WorkflowStep',
        rows: [],
      },
    ]);

    const result = await renderTraceabilityMd(driver, '/project');
    // All four sections should show placeholder row
    const emptyRows = result.content.split('\n').filter((l) => l.includes('| — | — | — | — |'));
    assert.equal(emptyRows.length, 4, 'all four sections have placeholder row');
  });
});

// ===========================================================================
// 8. dispatcher (renderMarkdown)
// ===========================================================================

describe('renderMarkdown dispatcher', () => {
  it('throws 400 for unsupported kind', async () => {
    const { renderMarkdown } = await import('./index.js');
    const driver = makeFakeDriver([]);
    await assert.rejects(
      () => renderMarkdown('unknown-kind', null, driver, '/project'),
      (err: { code?: string }) => err.code === 'unsupported_render_md_kind',
    );
  });

  it('throws 400 when relatedId missing for entity kind', async () => {
    const { renderMarkdown } = await import('./index.js');
    const driver = makeFakeDriver([]);
    await assert.rejects(
      () => renderMarkdown('entity', null, driver, '/project'),
      (err: { code?: string }) => err.code === 'missing_related_id',
    );
  });

  it('throws 400 when relatedId missing for uc kind', async () => {
    const { renderMarkdown } = await import('./index.js');
    const driver = makeFakeDriver([]);
    await assert.rejects(
      () => renderMarkdown('uc', null, driver, '/project'),
      (err: { code?: string }) => err.code === 'missing_related_id',
    );
  });

  it('throws 400 when relatedId missing for form kind', async () => {
    const { renderMarkdown } = await import('./index.js');
    const driver = makeFakeDriver([]);
    await assert.rejects(
      () => renderMarkdown('form', null, driver, '/project'),
      (err: { code?: string }) => err.code === 'missing_related_id',
    );
  });

  it('routes domain-model to singleton renderer', async () => {
    const { renderMarkdown } = await import('./index.js');
    const driver = makeFakeDriver([
      {
        match: 'CONTAINS_ENTITY',
        rows: [
          {
            de: { properties: { id: 'DE-X', name: 'X', description: null } },
            attributes: [],
            relationships: [],
            module_name: null,
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);
    const result = await renderMarkdown('domain-model', null, driver, '/p');
    assert.ok(result.path.endsWith('_domain-model.md'), 'routed to domain-model renderer');
  });

  it('routes uc-index to singleton renderer', async () => {
    const { renderMarkdown } = await import('./index.js');
    const driver = makeFakeDriver([{ match: 'MATCH (uc:UseCase)', rows: [] }]);
    const result = await renderMarkdown('uc-index', null, driver, '/p');
    assert.ok(result.path.endsWith('_uc-index.md'), 'routed to uc-index renderer');
  });

  it('routes traceability to singleton renderer', async () => {
    const { renderMarkdown } = await import('./index.js');
    const driver = makeFakeDriver([
      { match: 'WorkflowStep', rows: [] },
    ]);
    const result = await renderMarkdown('traceability', null, driver, '/p');
    assert.ok(result.path.endsWith('traceability-matrix.md'), 'routed to traceability renderer');
  });

  it('throws MissingSourceFileError when entity has no source_file (dispatcher pass-through)', async () => {
    const { renderMarkdown, MissingSourceFileError } = await import('./index.js');

    const driver = makeFakeDriver([
      {
        match: 'REALIZED_AS',
        rows: [
          {
            de: { properties: { id: 'DE-foo', name: 'Foo', description: null } },
            attributes: [],
            relationships: [],
            ba_source_id: null,
            ba_source_name: null,
            module_id: null,
            module_name: null,
            source_file: null,
          },
        ],
      },
      { match: 'HAS_ENUM', rows: [] },
    ]);

    await assert.rejects(
      () => renderMarkdown('entity', 'DE-foo', driver, '/project'),
      MissingSourceFileError,
    );
  });
});
