/**
 * semantic-ids — one centralized place for Excalidraw element id schemes.
 *
 * All renderers import from here so that:
 *   1. Element ids are human-readable in the JSON (audit-friendly).
 *   2. Future readers can see the full scheme in one file.
 *   3. When LLM-produced boards are compared for byte parity, the ids match.
 *
 * Naming conventions (mirrors nacl-render SKILL.md LLM output):
 *
 *   activity:
 *     swim-{role}-bg                — swimlane background rect (role: 'user' | 'system')
 *     swim-{role}-header            — swimlane header rect
 *     text-swim-{role}-header       — text bound inside the header rect
 *     step-{fullStepId}             — workflow step rectangle (fullStepId = "UC-001-A01")
 *     text-step-{fullStepId}        — text bound inside the step rect
 *     arrow-{ucIdNoHyphens}-{fromSuffix}-{toSuffix}
 *                                   — sequential step arrow; UC hyphens stripped (UC-001 → UC001),
 *                                     step suffix = step_id with ucId- prefix removed (UC-001-A01 → A01)
 *
 *   ba-process:
 *     swim-bp-{roleId}-bg           — swimlane background rect (keyed on role id)
 *     swim-bp-{roleId}-label        — role label rect
 *     text-swim-bp-{roleId}-label   — text inside role label rect
 *     step-{bpId}-{stepId}          — workflow step rect
 *     text-step-{bpId}-{stepId}     — text inside step rect
 *     doc-{bpId}-{stepId}-{docIdx}  — document annotation rect
 *     text-doc-{bpId}-{stepId}-{docIdx} — text inside doc rect
 *     arrow-bp-{bpId}-{fromStepId}-{toStepId}  — sequential step arrow
 *     arrow-doc-{bpId}-{stepId}-{docIdx}        — step-to-doc dashed arrow
 *     title-{bpId}                  — process title text
 *
 *   domain-model:
 *     entity-{entityId}             — entity card rect
 *     text-entity-header-{entityId} — entity name text bound inside card
 *     text-entity-attr-{entityId}-{attrIdx}  — attribute text
 *     enum-{enumId}                 — enum card rect
 *     text-enum-header-{enumId}     — enum name text bound inside card
 *     text-enum-val-{enumId}-{valIdx} — enum value text
 *     arrow-relates-{fromId}-{toId} — RELATES_TO arrow (deduped: smaller id first)
 *     text-relates-{fromId}-{toId}  — arrow label
 *     arrow-hasenum-{entityId}-{enumId} — HAS_ENUM arrow
 *
 *   context-map:
 *     module-{moduleId}             — module box rect
 *     text-module-{moduleId}        — module title text bound inside rect
 *     text-module-stats-{moduleId}  — stats text (free, inside box)
 *     dep-{fromId}-{toId}           — dependency arrow (deduped)
 *     text-dep-{fromId}-{toId}      — dependency label
 */

export const ids = {
  // ---------------------------------------------------------------------------
  // activity
  // ---------------------------------------------------------------------------

  /** Swimlane background rect. role: 'user' | 'system' */
  activitySwimBg: (role: 'user' | 'system'): string => `swim-${role}-bg`,

  /** Swimlane header rect. */
  activitySwimHeader: (role: 'user' | 'system'): string => `swim-${role}-header`,

  /** Text element bound inside the swimlane header rect. */
  activitySwimHeaderText: (role: 'user' | 'system'): string => `text-swim-${role}-header`,

  /**
   * Step rectangle.
   * stepId is the full graph step id (e.g. "UC-001-A01") — id is "step-UC-001-A01".
   */
  activityStep: (stepId: string): string => `step-${stepId}`,

  /**
   * Text bound inside a step rectangle.
   * stepId is the full graph step id — id is "text-step-UC-001-A01".
   */
  activityStepText: (stepId: string): string => `text-step-${stepId}`,

  /**
   * Arrow between consecutive steps.
   * The UC id has hyphens stripped and is used as a namespace prefix.
   * Step ids have the UC prefix stripped to get the local step suffix.
   *
   * Example: ucId="UC-001", fromStepId="UC-001-A01", toStepId="UC-001-A02"
   *   → "arrow-UC001-A01-A02"
   */
  activityArrow: (ucId: string, fromStepId: string, toStepId: string): string => {
    const ucCompact = ucId.replace(/-/g, '');
    const fromSuffix = fromStepId.startsWith(ucId + '-')
      ? fromStepId.slice(ucId.length + 1)
      : fromStepId;
    const toSuffix = toStepId.startsWith(ucId + '-')
      ? toStepId.slice(ucId.length + 1)
      : toStepId;
    return `arrow-${ucCompact}-${fromSuffix}-${toSuffix}`;
  },

  // ---------------------------------------------------------------------------
  // ba-process
  // ---------------------------------------------------------------------------

  /** Swimlane background rect keyed on role id. */
  baSwimBg: (roleId: string): string => `swim-bp-${roleId}-bg`,

  /** Role label rect. */
  baSwimLabel: (roleId: string): string => `swim-bp-${roleId}-label`,

  /** Text inside role label rect. */
  baSwimLabelText: (roleId: string): string => `text-swim-bp-${roleId}-label`,

  /** Workflow step rect. */
  baStep: (bpId: string, stepId: string): string => `step-${bpId}-${stepId}`,

  /** Text bound inside step rect. */
  baStepText: (bpId: string, stepId: string): string => `text-step-${bpId}-${stepId}`,

  /** Document annotation rect. */
  baDoc: (bpId: string, stepId: string, docIdx: number): string =>
    `doc-${bpId}-${stepId}-${docIdx}`,

  /** Text inside document rect. */
  baDocText: (bpId: string, stepId: string, docIdx: number): string =>
    `text-doc-${bpId}-${stepId}-${docIdx}`,

  /** Sequential step arrow. */
  baArrow: (bpId: string, fromStepId: string, toStepId: string): string =>
    `arrow-bp-${bpId}-${fromStepId}-${toStepId}`,

  /** Step-to-document dashed arrow. */
  baDocArrow: (bpId: string, stepId: string, docIdx: number): string =>
    `arrow-doc-${bpId}-${stepId}-${docIdx}`,

  /** Process title text. */
  baTitle: (bpId: string): string => `title-${bpId}`,

  // ---------------------------------------------------------------------------
  // domain-model
  // ---------------------------------------------------------------------------

  /** Entity card rect. */
  entity: (entityId: string): string => `entity-${entityId}`,

  /** Entity name text bound inside the card rect. */
  entityHeaderText: (entityId: string): string => `text-entity-header-${entityId}`,

  /** Attribute row text. */
  entityAttrText: (entityId: string, attrIdx: number): string =>
    `text-entity-attr-${entityId}-${attrIdx}`,

  /** Enum card rect. */
  enum: (enumId: string): string => `enum-${enumId}`,

  /** Enum name text bound inside enum card. */
  enumHeaderText: (enumId: string): string => `text-enum-header-${enumId}`,

  /** Enum value row text. */
  enumValText: (enumId: string, valIdx: number): string =>
    `text-enum-val-${enumId}-${valIdx}`,

  /** RELATES_TO arrow. ids are sorted before passing (caller's responsibility). */
  relatesArrow: (fromId: string, toId: string): string =>
    `arrow-relates-${fromId}-${toId}`,

  /** RELATES_TO arrow label text. */
  relatesLabel: (fromId: string, toId: string): string =>
    `text-relates-${fromId}-${toId}`,

  /** HAS_ENUM arrow. */
  hasEnumArrow: (entityId: string, enumId: string): string =>
    `arrow-hasenum-${entityId}-${enumId}`,

  // ---------------------------------------------------------------------------
  // context-map
  // ---------------------------------------------------------------------------

  /** Module box rect. */
  module: (moduleId: string): string => `module-${moduleId}`,

  /** Module title text bound inside module rect. */
  moduleText: (moduleId: string): string => `text-module-${moduleId}`,

  /** Module stats text (free, inside box). */
  moduleStatsText: (moduleId: string): string => `text-module-stats-${moduleId}`,

  /** Dependency arrow between modules. ids are sorted before passing. */
  depArrow: (fromId: string, toId: string): string => `dep-${fromId}-${toId}`,

  /** Dependency arrow label. */
  depLabel: (fromId: string, toId: string): string => `text-dep-${fromId}-${toId}`,

  // ---------------------------------------------------------------------------
  // Generic helper — text element id for any container
  // ---------------------------------------------------------------------------

  /** text-of: text element id = "text-" + containerId */
  textOf: (containerId: string): string => `text-${containerId}`,
};
