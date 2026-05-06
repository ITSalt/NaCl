/**
 * mermaid.ts — shared Mermaid diagram builders for markdown renderers.
 *
 * Rules:
 *   - All output is deterministic: no Date, no Math.random, no unsorted iteration.
 *   - Mermaid IDs: graphId.replace(/-/g, '_') per SKILL.md lines 55-61.
 *   - Cardinality table: SKILL.md lines 122-129.
 */

// ---------------------------------------------------------------------------
// ID sanitisation (SKILL.md lines 55-61)
// ---------------------------------------------------------------------------

/**
 * Convert a graph id (e.g. "UC-101", "OBJ-001-A01") to a valid Mermaid node id.
 * Rule: replace every hyphen with underscore.
 */
export function sanitizeMermaidId(s: string): string {
  return s.replace(/-/g, '_');
}

// ---------------------------------------------------------------------------
// Cardinality helpers (SKILL.md lines 122-129)
// ---------------------------------------------------------------------------

/**
 * Map a graph cardinality string to [leftCard, rightCard] Mermaid labels.
 *
 * | Graph `cardinality` | Left side | Right side |
 * |---|---|---|
 * | `1:N` | `"1"` | `"*"` |
 * | `N:1` | `"*"` | `"1"` |
 * | `N:M` | `"*"` | `"*"` |
 * | `1:1` | `"1"` | `"1"` |
 */
export function mapCardinality(cardinality: string | null): [string, string] {
  switch (cardinality) {
    case '1:N': return ['"1"', '"*"'];
    case 'N:1': return ['"*"', '"1"'];
    case 'N:M': return ['"*"', '"*"'];
    case '1:1': return ['"1"', '"1"'];
    default:    return ['', ''];
  }
}

// ---------------------------------------------------------------------------
// Interfaces shared across builders
// ---------------------------------------------------------------------------

export interface AttrInput {
  name: string | null;
  data_type: string | null;
}

export interface RelInput {
  target_id: string | null;
  target_name: string | null;
  rel_type: string | null;
  cardinality: string | null;
}

export interface EnumInput {
  enum_id: string | null;
  enum_name: string | null;
  values: string[];
}

export interface StepInput {
  id: string;
  step_number: number;
  description: string | null;
  step_type: string | null;
  actor: string | null;
  branch_yes?: string | null;
  branch_no?: string | null;
}

export interface FieldMappingInput {
  field_name: string | null;
  field_id: string | null;
  field_type: string | null;
  field_label: string | null;
  attr_name: string | null;
  attr_id: string | null;
  attr_type: string | null;
  entity_name: string | null;
  entity_id: string | null;
}

// ---------------------------------------------------------------------------
// classDiagram builder (entity + domain-model)
// SKILL.md lines 99-120, 457-481
// ---------------------------------------------------------------------------

interface ClassDiagramEntity {
  name: string;
  attributes: AttrInput[];
  relationships: RelInput[];
  enumerations: EnumInput[];
}

/**
 * Build a Mermaid classDiagram string for one or more entities.
 *
 * Deduplication rule (domain-model, SKILL.md line 483):
 * For a pair A→B and B→A with the same rel_type, keep only the one where
 * A.name < B.name lexicographically.
 *
 * @param entities      List of entities (name, attrs, rels, enums)
 * @param deduplicate   When true, apply the A.name < B.name dedup rule.
 *                      Pass false for single-entity rendering (entity renderer).
 */
export function buildClassDiagram(
  entities: ClassDiagramEntity[],
  deduplicate = false,
): string {
  const lines: string[] = ['classDiagram'];

  // Collect all enumerations globally (may be shared)
  const seenEnumIds = new Set<string>();
  const enumLines: string[] = [];
  const enumLinkLines: string[] = [];

  // For each entity, emit the class block
  for (const entity of entities) {
    lines.push('');
    lines.push(`    class ${entity.name} {`);
    for (const attr of entity.attributes) {
      if (!attr.name) continue;
      lines.push(`        +${attr.data_type ?? '?'} ${attr.name}`);
    }
    lines.push('    }');

    // Collect enum blocks
    for (const en of entity.enumerations) {
      if (!en.enum_id || !en.enum_name) continue;
      if (!seenEnumIds.has(en.enum_id)) {
        seenEnumIds.add(en.enum_id);
        enumLines.push('');
        enumLines.push(`    class ${en.enum_name} {`);
        enumLines.push('        <<enumeration>>');
        for (const val of en.values) {
          enumLines.push(`        ${val}`);
        }
        enumLines.push('    }');
        enumLinkLines.push(`    ${entity.name} --> ${en.enum_name}`);
      }
    }
  }

  // Relationships — with optional deduplication
  const relLines: string[] = [];
  const seenRels = new Set<string>();

  for (const entity of entities) {
    for (const rel of entity.relationships) {
      if (!rel.target_name || !rel.target_id) continue;

      if (deduplicate) {
        const [sortedFrom, sortedTo] = [entity.name, rel.target_name].sort();
        const key = `${sortedFrom}::${sortedTo}::${rel.rel_type ?? ''}`;
        if (seenRels.has(key)) continue;
        seenRels.add(key);
      }

      const [leftCard, rightCard] = mapCardinality(rel.cardinality);
      if (leftCard && rightCard) {
        relLines.push(
          `    ${entity.name} ${leftCard} --> ${rightCard} ${rel.target_name} : ${rel.rel_type ?? ''}`,
        );
      } else {
        relLines.push(
          `    ${entity.name} --> ${rel.target_name} : ${rel.rel_type ?? ''}`,
        );
      }
    }
  }

  // Assemble: enums first, then relationships, then enum links
  lines.push(...enumLines);
  lines.push(...relLines);
  lines.push(...enumLinkLines);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Activity flowchart builder (uc renderer)
// SKILL.md lines 236-268
// ---------------------------------------------------------------------------

/**
 * Build a Mermaid flowchart TD from ActivityStep records.
 *
 * Algorithm (SKILL.md lines 236-268):
 *   - Sort by step_number
 *   - nodeId = sanitizeMermaidId(step.id)
 *   - decision → {description}; start/end → (["description"]); action → ["actor: desc"]
 *   - Sequential arrows between consecutive steps
 *   - If any step has actor, group into subgraph User / subgraph System
 */
export function buildActivityFlowchart(steps: StepInput[]): string {
  if (steps.length === 0) {
    return 'flowchart TD\n    Start(["Начало"])';
  }

  // Sort by step_number
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);

  // Check if any step has an actor (for swimlane rendering)
  const hasActors = sorted.some((s) => s.actor && s.actor.trim().length > 0);

  const lines: string[] = ['flowchart TD'];

  if (hasActors) {
    // Group by actor
    const userSteps = sorted.filter(
      (s) => !s.actor || s.actor.trim().toLowerCase() !== 'system',
    );
    const systemSteps = sorted.filter(
      (s) => s.actor && s.actor.trim().toLowerCase() === 'system',
    );

    if (userSteps.length > 0) {
      lines.push('    subgraph User["User"]');
      for (const s of userSteps) {
        lines.push(`        ${nodeDecl(s)}`);
      }
      lines.push('    end');
    }

    if (systemSteps.length > 0) {
      lines.push('    subgraph System["System"]');
      for (const s of systemSteps) {
        lines.push(`        ${nodeDecl(s)}`);
      }
      lines.push('    end');
    }
  } else {
    // No actors — flat flow
    for (const s of sorted) {
      lines.push(`    ${nodeDecl(s)}`);
    }
  }

  // Sequential arrows between consecutive steps
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sanitizeMermaidId(sorted[i].id);
    const to = sanitizeMermaidId(sorted[i + 1].id);
    lines.push(`    ${from} --> ${to}`);
  }

  return lines.join('\n');
}

function nodeDecl(s: StepInput): string {
  const nodeId = sanitizeMermaidId(s.id);
  const desc = s.description ?? s.id;
  const type = s.step_type ?? 'action';

  if (type === 'decision') {
    return `${nodeId}{"${escMermaid(desc)}"}`;
  }
  if (type === 'start' || type === 'end') {
    return `${nodeId}(["${escMermaid(desc)}"])`;
  }
  // action or anything else
  const prefix = s.actor ? `${s.actor}: ` : '';
  return `${nodeId}["${escMermaid(prefix + desc)}"]`;
}

function escMermaid(s: string): string {
  // Mermaid requires escaping quotes inside node labels
  return s.replace(/"/g, "'");
}

// ---------------------------------------------------------------------------
// Form mapping flowchart builder (form renderer)
// SKILL.md lines 366-389
// ---------------------------------------------------------------------------

/**
 * Build a Mermaid flowchart LR showing field → attribute → entity mapping.
 *
 * Fields with no MAPS_TO get a dashed arrow to "Unmapped".
 */
export function buildFormMappingFlowchart(
  formName: string,
  fieldMappings: FieldMappingInput[],
): string {
  const lines: string[] = ['flowchart LR'];

  // Form subgraph
  lines.push(`    subgraph Form["${escMermaid(formName)}"]`);
  const seenFieldIds = new Set<string>();
  for (const fm of fieldMappings) {
    if (!fm.field_id) continue;
    if (seenFieldIds.has(fm.field_id)) continue;
    seenFieldIds.add(fm.field_id);
    const nodeId = sanitizeMermaidId(fm.field_id);
    const label = fm.field_label ?? fm.field_name ?? fm.field_id;
    const type = fm.field_type ?? '';
    lines.push(`        ${nodeId}["${escMermaid(label)}<br/><small>${escMermaid(type)}</small>"]`);
  }
  lines.push('    end');

  // Domain model subgraph: group by entity
  const entitiesMap = new Map<string, { entity_name: string; attrs: { id: string; name: string; type: string }[] }>();
  for (const fm of fieldMappings) {
    if (!fm.entity_id || !fm.attr_id) continue;
    let entry = entitiesMap.get(fm.entity_id);
    if (!entry) {
      entry = { entity_name: fm.entity_name ?? fm.entity_id, attrs: [] };
      entitiesMap.set(fm.entity_id, entry);
    }
    if (!entry.attrs.some((a) => a.id === fm.attr_id)) {
      entry.attrs.push({
        id: fm.attr_id,
        name: fm.attr_name ?? fm.attr_id,
        type: fm.attr_type ?? '?',
      });
    }
  }

  if (entitiesMap.size > 0) {
    lines.push('    subgraph Domain["Domain Model"]');
    // Sort entity IDs for determinism
    for (const [entityId, entry] of [...entitiesMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const entityNodeId = sanitizeMermaidId(entityId);
      lines.push(`        subgraph ${entityNodeId}["${escMermaid(entry.entity_name)}"]`);
      for (const attr of entry.attrs) {
        const attrNodeId = sanitizeMermaidId(attr.id);
        lines.push(`            ${attrNodeId}["${escMermaid(attr.name)} : ${escMermaid(attr.type)}"]`);
      }
      lines.push('        end');
    }
    lines.push('    end');
  }

  // Mapping arrows
  let hasUnmapped = false;
  for (const fm of fieldMappings) {
    if (!fm.field_id) continue;
    const ffId = sanitizeMermaidId(fm.field_id);
    if (fm.attr_id) {
      const daId = sanitizeMermaidId(fm.attr_id);
      lines.push(`    ${ffId} --> ${daId}`);
    } else {
      lines.push(`    ${ffId} -.-> Unmapped["unmapped"]`);
      hasUnmapped = true;
    }
  }

  // Deduplicate arrow lines (same field→attr may appear multiple times)
  const seen = new Set<string>();
  const deduped = lines.filter((l) => {
    if (!l.includes('-->') && !l.includes('-.->')) return true;
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  return deduped.join('\n');
}
