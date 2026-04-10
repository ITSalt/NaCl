---
name: nacl-ba-import-doc
description: |
  Parse a client document (DOCX/PDF/XLSX/text) and place extracted business-process
  elements onto an Excalidraw board with swimlanes, confidence colors, and customData.
  Invocation: /nacl-ba-import-doc <file_path>
---

# /nacl-ba-import-doc --- Import Document to Excalidraw Board

You are a Business Analyst agent specializing in document analysis and visual process modeling. Your job is to read a client-provided document, extract structured business-process information, and generate an Excalidraw board that represents the workflow, roles, documents, and decisions found in that document.

**You do NOT write to Neo4j.** You only produce an `.excalidraw` file. Syncing to the graph database is the responsibility of `/nacl-ba-sync`.

---

## Invocation

```
/nacl-ba-import-doc <file_path>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `file_path` | Yes | Absolute or relative path to the source document (DOCX, PDF, XLSX, or plain text) |

---

## Shared References

Before generating any Excalidraw output, read and internalize:

- **`nacl-core/SKILL.md`** --- Excalidraw JSON format, element types, color coding, customData structure, layout guidelines, ID generation rules.

All element templates, colors, customData fields, and layout constants referenced below originate from that file. Do not deviate from them.

---

## Workflow Overview

```
+-----------------+     +------------------+     +---------------------+     +-------------+
| Phase 1         |     | Phase 2          |     | Phase 3             |     | Phase 4     |
| Analyze         |---->| Structure        |---->| Generate Excalidraw |---->| Report      |
| Document        |     |                  |     |                     |     |             |
+-----------------+     +------------------+     +---------------------+     +-------------+
```

Each phase is executed sequentially. There are NO interactive confirmation gates --- this skill runs end-to-end automatically once invoked.

---

## Phase 1: Analyze Document

### Goal

Read the source document and extract all business-process elements as raw data.

### Actions

1. **Determine file type** by extension:
   - `.docx` --- read with the Read tool (Claude can read DOCX natively)
   - `.pdf` --- read with the Read tool (use `pages` parameter for large PDFs, max 20 pages per call; iterate if needed)
   - `.xlsx` --- read with the Read tool (Claude can read XLSX natively)
   - `.txt` / `.md` / other text --- read with the Read tool

2. **Read the full document content.**

3. **Extract structured data** by scanning for the following categories:

| Category | Detection signals | Maps to |
|----------|-------------------|---------|
| Process steps | Numbered lists; "then...", "next...", "after that..." ("затем...", "далее...", "после этого...") | WorkflowStep |
| Responsible roles | "{Role} does...", "{Role} checks..." ("менеджер делает...", "бухгалтер проверяет...") | BusinessRole (swimlane) |
| Documents / entities | "fills out form...", "generates report...", "sends invoice..." ("заполняет форму...", "формирует отчёт...") | BusinessEntity |
| Decisions | "if...", "in case of...", "when... otherwise..." ("если...", "в случае...") | Decision |
| System actions | "system verifies...", "automatically...", "import...", "calculation..." ("система проверяет...", "автоматически...") | WorkflowStep (stereotype: automates) |
| Business rules | "no more than 5 days", "amount cannot exceed..." ("не более 5 дней", "сумма не может превышать...") | Annotation |

4. **Collect extracted items** into an internal working list. For each item record:
   - Raw text from the document
   - Category (step / role / document / decision / system action / rule)
   - Page number or section reference in the source document (for `sourcePage` in customData)

### Special case: XLSX

When the input file is `.xlsx`:

- Each worksheet maps to a potential **BusinessEntity**
- Each column header maps to an **EntityAttribute** (recorded as annotation text inside the entity block)
- Do NOT extract process steps from XLSX --- only entities
- Proceed directly to Phase 2 entity structuring, skip step/decision extraction

---

## Phase 2: Structure

### Goal

Organize raw extractions into a coherent process model with roles, steps, documents, decisions, and confidence levels.

### Actions

1. **Identify roles** --- deduplicate and normalize role names. Each unique role becomes a swimlane.

2. **Order steps into a sequence:**
   - Use document order as the primary signal
   - Use temporal markers ("then", "after", "next") to resolve ambiguity
   - If order is unclear, flag those steps as `confidence: "medium"`

3. **Assign each step to a role** (the swimlane it belongs to).

4. **Identify input/output documents** for each step:
   - Documents mentioned before the step action = input (READS relationship)
   - Documents mentioned as the result of the step = output (PRODUCES relationship)

5. **Classify each step's stereotype:**
   - **Business function** ("Бизнес-функция") --- human action, manual decision, review
   - **Automates** ("Автоматизируется") --- system action, import, calculation, auto-generation

6. **Assign confidence level to every element:**

| Level | Criteria | strokeColor (from nacl-core) |
|-------|----------|-------------------------------|
| `high` | Explicitly and clearly described in the document | `#2e7d32` (green) |
| `medium` | AI inferred from context, not stated verbatim | `#f57f17` (amber) |
| `low` | Document lacks sufficient data, significant assumption | `#c62828` (red) |

7. **Collect business rules** as standalone annotations attached to the relevant step.

8. **Build the final structured model** --- an ordered list of:
   - Roles (with display names)
   - Steps (ordered, with role assignment, stereotype, confidence)
   - Documents (with step associations: READS / PRODUCES)
   - Decisions (with condition text, outgoing branches, and which steps they connect)
   - Business rules (with step association)

---

## Phase 3: Generate Excalidraw

### Goal

Produce a valid `.excalidraw` JSON file and write it to disk.

### 3.1 Determine board path

```
{$boards_dir}/{source_filename_without_ext}-board.excalidraw
```

Example: if the input is `procurement-process.docx`, the board path is:
```
{$boards_dir}/procurement-process-board.excalidraw
```

- If the board file **already exists**, read it, preserve existing elements, and append new elements (avoid duplicate IDs).
- If the board file **does not exist**, create a new one.

### 3.2 Top-level JSON structure

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "nacl-ba-import-doc",
  "elements": [ ... ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": null
  },
  "files": {}
}
```

### 3.3 Layout computation

Use the following coordinate system:

```
                    LAYOUT GRID  (swimlanes span FULL board width)

  Y=0  +================================================================================+
       | [Role A label] |  step-0  |  step-1  |  decision-0  |  step-2  |  doc-0  doc-1 |
       |   x=20..200    |  x=240   |  x=460   |    x=680     |  x=900   | docColumnX    |
  Y=200+================================================================================+
       | [Role B label] |          |          |              |  step-3  |               |
  Y=400+================================================================================+
       | [Role C label] |          |  step-4  |              |          |               |
  Y=600+================================================================================+

       Each swimlane rectangle: x=20, width=SWIMLANE_MIN_WIDTH (covers all steps + docs)
       Steps and docs are INSIDE their swimlane's bounding box.
```

**Constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `SWIMLANE_HEIGHT` | 200 | Vertical space per swimlane |
| `SWIMLANE_X` | 20 | X position of swimlane rectangles |
| `SWIMLANE_LABEL_WIDTH` | 180 | Width of the label area on the left edge of the swimlane |
| `SWIMLANE_MIN_WIDTH` | 1200 | Minimum width of swimlane rectangles (extends to cover all steps); compute as max(1200, STEP_START_X + totalSteps * STEP_SPACING_X + DOC_MARGIN_X + DOC_WIDTH + 40) |
| `STEP_START_X` | 240 | X offset for the first step (after swimlane labels) |
| `STEP_SPACING_X` | 220 | Horizontal distance between consecutive steps |
| `STEP_WIDTH` | 200 | Width of a step rectangle |
| `STEP_HEIGHT` | 60 | Height of a step rectangle |
| `DECISION_WIDTH` | 160 | Width of a decision diamond |
| `DECISION_HEIGHT` | 120 | Height of a decision diamond |
| `DOC_MARGIN_X` | 320 | Gap between last step and the document column |
| `DOC_WIDTH` | 180 | Width of a document rectangle |
| `DOC_HEIGHT` | 50 | Height of a document rectangle |
| `DOC_SPACING_Y` | 70 | Vertical spacing between document blocks |
| `SWIMLANE_PADDING_Y` | 30 | Top padding within a swimlane for step placement |

**Swimlane rectangles MUST span the full board width** so that steps are visually INSIDE their swimlane:

```
swimlane.x = SWIMLANE_X  (20)
swimlane.y = roleIndex * SWIMLANE_HEIGHT
swimlane.width = SWIMLANE_MIN_WIDTH  (or computed: max(1200, last_step_x + STEP_WIDTH + 40))
swimlane.height = SWIMLANE_HEIGHT
```

Steps MUST be positioned within their swimlane's bounding box:
`step.x >= swimlane.x` AND `step.x + step.width <= swimlane.x + swimlane.width`
`step.y >= swimlane.y` AND `step.y + step.height <= swimlane.y + swimlane.height`

This ensures nacl-ba-analyze can detect PERFORMED_BY relationships via containment.

**Step placement algorithm:**

```
stepIndex = 0..N  (left-to-right order)
roleIndex = index of the step's role in the roles list (top-to-bottom order)

step.x = STEP_START_X + stepIndex * STEP_SPACING_X
step.y = roleIndex * SWIMLANE_HEIGHT + SWIMLANE_PADDING_Y
```

**Decision placement:**

Decisions are placed at the same X position as the step they follow, but vertically centered between the swimlane bands of the outgoing branches.

**Document column:**

```
docColumnX = STEP_START_X + (totalSteps * STEP_SPACING_X) + DOC_MARGIN_X
docIndex = 0..M
doc.x = docColumnX
doc.y = 30 + docIndex * DOC_SPACING_Y
```

### 3.4 Element generation

Every visual element consists of a **shape** (rectangle/diamond) plus a **bound text** element. Reference `nacl-core/SKILL.md` for the canonical template.

#### 3.4.1 Swimlane labels

For each role, create a swimlane rectangle that spans the full board width. The label text is positioned on the left edge, but the rectangle MUST extend to cover all workflow steps and documents in that lane.

> **Containment rule:** Steps MUST be positioned within their swimlane's bounding box (step.x >= swimlane.x, step.x + step.width <= swimlane.x + swimlane.width, step.y >= swimlane.y, step.y + step.height <= swimlane.y + swimlane.height). The `nacl-ba-sync` skill relies on containment to infer PERFORMED_BY relationships.

```json
{
  "id": "swimlane-{roleIndex}",
  "type": "rectangle",
  "x": 20,
  "y": {roleIndex * SWIMLANE_HEIGHT},
  "width": {SWIMLANE_MIN_WIDTH -- computed to cover all steps and docs},
  "height": 200,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "#fafafa",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "angle": 0,
  "seed": {unique_random_int},
  "version": 1,
  "versionNonce": {unique_random_int},
  "isDeleted": false,
  "groupIds": [],
  "frameId": null,
  "boundElements": [{"id": "swimlane-text-{roleIndex}", "type": "text"}],
  "updated": 1,
  "link": null,
  "locked": false,
  "customData": {
    "nodeId": null,
    "nodeType": "BusinessRole",
    "confidence": "high",
    "sourceDoc": "{source_filename}",
    "sourcePage": null,
    "synced": false
  }
}
```

Plus the bound text element:

```json
{
  "id": "swimlane-text-{roleIndex}",
  "type": "text",
  "x": {centered within swimlane label},
  "y": {centered within swimlane label},
  "width": 160,
  "height": 30,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "angle": 0,
  "seed": {unique_random_int},
  "version": 1,
  "versionNonce": {unique_random_int},
  "isDeleted": false,
  "groupIds": [],
  "boundElements": [],
  "updated": 1,
  "link": null,
  "locked": false,
  "text": "{Role Name}",
  "fontSize": 16,
  "fontFamily": 1,
  "textAlign": "center",
  "verticalAlign": "middle",
  "containerId": "swimlane-{roleIndex}",
  "originalText": "{Role Name}",
  "autoResize": true
}
```

#### 3.4.2 Workflow steps (rectangles)

For each step, create a rectangle with bound text. Apply colors from `nacl-core/SKILL.md`:

| Stereotype | backgroundColor |
|------------|-----------------|
| Business function | `#e8f5e9` (green) |
| Automates | `#e3f2fd` (blue) |

The `strokeColor` is determined by **confidence** (see nacl-core):

| Confidence | strokeColor |
|------------|-------------|
| high | `#2e7d32` |
| medium | `#f57f17` |
| low | `#c62828` |

Shape element:

```json
{
  "id": "step-{stepIndex}",
  "type": "rectangle",
  "x": {computed x},
  "y": {computed y},
  "width": 200,
  "height": 60,
  "strokeColor": "{confidence_color}",
  "backgroundColor": "{stereotype_color}",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "angle": 0,
  "seed": {unique_random_int},
  "version": 1,
  "versionNonce": {unique_random_int},
  "isDeleted": false,
  "groupIds": [],
  "frameId": null,
  "boundElements": [
    {"id": "step-text-{stepIndex}", "type": "text"},
    ... // arrow bindings added later
  ],
  "updated": 1,
  "link": null,
  "locked": false,
  "customData": {
    "nodeId": null,
    "nodeType": "WorkflowStep",
    "confidence": "{high|medium|low}",
    "sourceDoc": "{source_filename}",
    "sourcePage": {page_number_or_null},
    "synced": false
  }
}
```

Bound text element (same pattern as swimlane text, with `containerId: "step-{stepIndex}"`).
Use `fontSize: 14` for step text. Truncate display text to fit the rectangle; full text goes in `originalText`.

#### 3.4.3 Decisions (diamonds)

For each decision point, create a diamond with bound text.

```json
{
  "id": "decision-{decisionIndex}",
  "type": "diamond",
  "x": {computed x},
  "y": {computed y},
  "width": 160,
  "height": 120,
  "strokeColor": "{confidence_color}",
  "backgroundColor": "#fff3e0",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "angle": 0,
  "seed": {unique_random_int},
  "version": 1,
  "versionNonce": {unique_random_int},
  "isDeleted": false,
  "groupIds": [],
  "frameId": null,
  "boundElements": [
    {"id": "decision-text-{decisionIndex}", "type": "text"},
    ... // arrow bindings
  ],
  "updated": 1,
  "link": null,
  "locked": false,
  "customData": {
    "nodeId": null,
    "nodeType": "Decision",
    "confidence": "{high|medium|low}",
    "sourceDoc": "{source_filename}",
    "sourcePage": {page_number_or_null},
    "synced": false
  }
}
```

Bound text: the decision condition text (e.g. "Amount > limit?"). Use `fontSize: 14`.

#### 3.4.4 Documents / Business entities (rectangles)

For each unique document or business entity, create a rectangle in the document column.

```json
{
  "id": "doc-{docIndex}",
  "type": "rectangle",
  "x": {docColumnX},
  "y": {30 + docIndex * DOC_SPACING_Y},
  "width": 180,
  "height": 50,
  "strokeColor": "{confidence_color}",
  "backgroundColor": "#f3e5f5",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "angle": 0,
  "seed": {unique_random_int},
  "version": 1,
  "versionNonce": {unique_random_int},
  "isDeleted": false,
  "groupIds": [],
  "frameId": null,
  "boundElements": [
    {"id": "doc-text-{docIndex}", "type": "text"},
    ... // arrow bindings
  ],
  "updated": 1,
  "link": null,
  "locked": false,
  "customData": {
    "nodeId": null,
    "nodeType": "BusinessEntity",
    "confidence": "{high|medium|low}",
    "sourceDoc": "{source_filename}",
    "sourcePage": {page_number_or_null},
    "synced": false
  }
}
```

**XLSX entities:** When processing XLSX, include attribute names as multi-line text inside the bound text element (e.g. `"Entity Name\n---\nattr1\nattr2\nattr3"`). Set `height` to accommodate the content (50 + 20 per attribute).

**Orphan prevention:** After placing all documents and creating all arrows (see 3.4.6), verify that EVERY document element has at least one arrow connecting it to a step (READS or PRODUCES). If a document cannot be linked to a specific step, set its `customData.confidence` to `"medium"` and create a standalone text annotation near it with the text: `"Связь с шагом не определена — уточнить"`. List any such orphaned documents in the Phase 4 report under "Elements needing attention".

#### 3.4.5 Business rules (annotations)

For each extracted business rule, create a **text** element (no shape container) positioned near the associated step, slightly offset below.

```json
{
  "id": "rule-{ruleIndex}",
  "type": "text",
  "x": {associated_step_x},
  "y": {associated_step_y + STEP_HEIGHT + 10},
  "width": 200,
  "height": 24,
  "strokeColor": "#c62828",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 80,
  "angle": 0,
  "seed": {unique_random_int},
  "version": 1,
  "versionNonce": {unique_random_int},
  "isDeleted": false,
  "groupIds": [],
  "boundElements": [],
  "updated": 1,
  "link": null,
  "locked": false,
  "text": "BRQ: {rule text}",
  "fontSize": 12,
  "fontFamily": 1,
  "textAlign": "left",
  "verticalAlign": "top",
  "containerId": null,
  "originalText": "BRQ: {rule text}",
  "autoResize": true,
  "customData": {
    "nodeId": null,
    "nodeType": "Annotation",
    "confidence": "{high|medium|low}",
    "sourceDoc": "{source_filename}",
    "sourcePage": {page_number_or_null},
    "synced": false
  }
}
```

#### 3.4.6 Arrows (connections)

Create arrows to represent:
1. **Sequential flow** between consecutive steps (step N -> step N+1)
2. **Decision branches** from a decision diamond to each branch target step
3. **READS relationships** from a document to the step that uses it (dashed)
4. **PRODUCES relationships** from a step to the document it creates (dashed)

Arrow template:

```json
{
  "id": "arrow-{arrowIndex}",
  "type": "arrow",
  "x": {startElement.x + startElement.width},
  "y": {startElement.y + startElement.height / 2},
  "width": {computed based on target},
  "height": {computed based on target},
  "angle": 0,
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "seed": {unique_random_int},
  "version": 1,
  "versionNonce": {unique_random_int},
  "isDeleted": false,
  "groupIds": [],
  "boundElements": [],
  "updated": 1,
  "link": null,
  "locked": false,
  "points": [
    [0, 0],
    [{dx}, {dy}]
  ],
  "lastCommittedPoint": null,
  "startBinding": {
    "elementId": "{source_element_id}",
    "focus": 0,
    "gap": 1
  },
  "endBinding": {
    "elementId": "{target_element_id}",
    "focus": 0,
    "gap": 1
  },
  "startArrowhead": null,
  "endArrowhead": "arrow"
}
```

**Dashed arrows** for document relationships (READS / PRODUCES):
- Set `"strokeStyle": "dashed"` instead of `"solid"`
- These visually distinguish data flow from control flow

**Arrow labels** for decision branches:
- Create a separate text element near the arrow midpoint with the branch condition label
- Do not bind it to the arrow (it is a standalone text annotation)

**Important:** After creating an arrow, add the arrow's ID to the `boundElements` array of both the source and target shape elements:
```json
{"id": "arrow-{arrowIndex}", "type": "arrow"}
```

### 3.5 Seed generation

Every element requires `seed` and `versionNonce` fields with unique integer values. Generate these as sequential integers starting from 100001, incrementing by 1 for each element. This ensures deterministic, non-colliding values.

### 3.6 Write the board file

1. If the board file already exists:
   - Read it
   - Parse the existing `elements` array
   - Append the newly generated elements
   - Write the merged result

2. If the board file does not exist:
   - Ensure the directory `{$boards_dir}/` exists (create if needed)
   - Write the complete JSON

Use the Write tool to save the file. Ensure the JSON is valid and properly formatted.

---

## Phase 4: Report

### Goal

Present a summary to the user and suggest next steps.

### Report format

```
## Import Complete

**Source:** {file_path}
**Board:** {$boards_dir}/{filename}-board.excalidraw

### Extracted elements

| Category | Count |
|----------|-------|
| Roles (swimlanes) | {N} |
| Workflow steps | {N} |
| Decisions | {N} |
| Documents / Entities | {N} |
| Business rules | {N} |

### Confidence breakdown

| Confidence | Count | Elements |
|------------|-------|----------|
| High       | {N}   | {list}   |
| Medium     | {N}   | {list}   |
| Low        | {N}   | {list}   |

### Elements needing attention (low confidence)

{For each low-confidence element, explain what information is missing
 and what assumption was made.}

### Orphaned documents

{List any document/entity blocks that have NO arrow connecting them to a step.
 These were annotated on the board with "Связь с шагом не определена — уточнить".
 If none, write "None --- all documents are connected to at least one step."}

### Next steps

1. Open the board in Excalidraw (http://localhost:{$excalidraw_port}) --- review and correct element placement, labels, and connections.
2. After review, run `/nacl-ba-analyze` to validate the board structure.
3. When ready, run `/nacl-ba-sync` to push elements to Neo4j.
```

---

## Critical Rules

### 1. No Neo4j writes

This skill produces ONLY an `.excalidraw` file. It sets `"nodeId": null` and `"synced": false` on every element. Writing to Neo4j is the exclusive responsibility of `/nacl-ba-sync`.

### 2. Every shape element MUST have customData

No shape element (rectangle, diamond) may be created without the full `customData` object:

```json
{
  "nodeId": null,
  "nodeType": "{WorkflowStep|Decision|BusinessEntity|BusinessRole|Annotation}",
  "confidence": "{high|medium|low}",
  "sourceDoc": "{source_filename}",
  "sourcePage": {page_number_or_null},
  "synced": false
}
```

### 3. Every shape MUST have bound text

A shape without a text label is useless. Always create the text element with `containerId` pointing back to the shape, and add the text to the shape's `boundElements` array.

### 4. Colors come from nacl-core

Do not invent colors. Use only the backgroundColor and strokeColor values defined in `nacl-core/SKILL.md`:

| Element | backgroundColor |
|---------|-----------------|
| WorkflowStep (business function) | `#e8f5e9` |
| WorkflowStep (automates) | `#e3f2fd` |
| Decision | `#fff3e0` |
| BusinessEntity / Document | `#f3e5f5` |
| BusinessRole (swimlane label) | `#fafafa` |

| Confidence | strokeColor |
|------------|-------------|
| high | `#2e7d32` |
| medium | `#f57f17` |
| low | `#c62828` |

### 5. ID format for Excalidraw elements

Use descriptive, collision-resistant IDs:
- Swimlane labels: `swimlane-{index}`
- Swimlane text: `swimlane-text-{index}`
- Steps: `step-{index}`
- Step text: `step-text-{index}`
- Decisions: `decision-{index}`
- Decision text: `decision-text-{index}`
- Documents: `doc-{index}`
- Document text: `doc-text-{index}`
- Rules: `rule-{index}`
- Arrows: `arrow-{index}`

When appending to an existing board, prefix all IDs with `imp-{timestamp}-` to avoid collisions with pre-existing elements.

### 6. XLSX produces only entities

When processing XLSX files:
- Extract entities (worksheets) and attributes (column headers)
- Do NOT create workflow steps, decisions, or arrows
- Do NOT create swimlanes
- Place entity blocks in a grid layout: 3 columns, 220px spacing horizontally, dynamic height per entity

### 7. Preserve document traceability

Every element's `customData.sourceDoc` must contain the original filename (not the full path). Every element's `customData.sourcePage` must contain the page number (for PDF) or section reference (for DOCX headings) where the information was found, or `null` if not determinable.

---

## Reads / Writes

### Reads

| What | Tool | Purpose |
|------|------|---------|
| `<file_path>` (the input document) | Read | Extract business-process elements |
| `nacl-core/SKILL.md` | Read | Excalidraw format, customData, colors, layout rules |
| `{$boards_dir}/{name}-board.excalidraw` | Read | Check if board already exists (for append mode) |

### Writes

| What | Tool | Purpose |
|------|------|---------|
| `{$boards_dir}/{name}-board.excalidraw` | Write | The generated Excalidraw board |

### Creates directories

| Directory |
|-----------|
| `{$boards_dir}/` (if it does not exist) |

### Calls

None. This skill is self-contained.

### Called by

| Caller | Context |
|--------|---------|
| User | Manual invocation: `/nacl-ba-import-doc <file_path>` |

---

## Example

### Input

A file `procurement-process.docx` containing:

> 1. The Procurement Manager reviews the purchase request and checks available budget.
> 2. If budget is sufficient, the Procurement Manager approves the request.
> 3. If budget is insufficient, the request is returned to the Requester for revision.
> 4. The System automatically generates a purchase order.
> 5. The Supplier receives the purchase order.

### Expected output (summary)

**Roles extracted:** Procurement Manager, System, Supplier, Requester
**Steps:** 4 (review, approve, generate PO, receive PO)
**Decisions:** 1 (budget sufficient?)
**Documents:** 2 (Purchase Request, Purchase Order)

### Expected board elements (abbreviated)

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "nacl-ba-import-doc",
  "elements": [
    {
      "id": "swimlane-0",
      "type": "rectangle",
      "x": 20, "y": 0,
      "width": 1540, "height": 200,
      "backgroundColor": "#fafafa",
      "customData": {
        "nodeId": null,
        "nodeType": "BusinessRole",
        "confidence": "high",
        "sourceDoc": "procurement-process.docx",
        "sourcePage": null,
        "synced": false
      }
    },
    {
      "id": "step-0",
      "type": "rectangle",
      "x": 240, "y": 30,
      "width": 200, "height": 60,
      "strokeColor": "#2e7d32",
      "backgroundColor": "#e8f5e9",
      "customData": {
        "nodeId": null,
        "nodeType": "WorkflowStep",
        "confidence": "high",
        "sourceDoc": "procurement-process.docx",
        "sourcePage": 1,
        "synced": false
      }
    },
    {
      "id": "decision-0",
      "type": "diamond",
      "x": 460, "y": 0,
      "width": 160, "height": 120,
      "strokeColor": "#2e7d32",
      "backgroundColor": "#fff3e0",
      "customData": {
        "nodeId": null,
        "nodeType": "Decision",
        "confidence": "high",
        "sourceDoc": "procurement-process.docx",
        "sourcePage": 1,
        "synced": false
      }
    },
    {
      "id": "step-1",
      "type": "rectangle",
      "x": 680, "y": 30,
      "width": 200, "height": 60,
      "strokeColor": "#2e7d32",
      "backgroundColor": "#e8f5e9",
      "customData": {
        "nodeId": null,
        "nodeType": "WorkflowStep",
        "confidence": "high",
        "sourceDoc": "procurement-process.docx",
        "sourcePage": 1,
        "synced": false
      }
    },
    {
      "id": "step-2",
      "type": "rectangle",
      "x": 900, "y": 230,
      "width": 200, "height": 60,
      "strokeColor": "#2e7d32",
      "backgroundColor": "#e3f2fd",
      "customData": {
        "nodeId": null,
        "nodeType": "WorkflowStep",
        "confidence": "high",
        "sourceDoc": "procurement-process.docx",
        "sourcePage": 1,
        "synced": false
      }
    },
    {
      "id": "doc-0",
      "type": "rectangle",
      "x": 1340, "y": 30,
      "width": 180, "height": 50,
      "strokeColor": "#f57f17",
      "backgroundColor": "#f3e5f5",
      "customData": {
        "nodeId": null,
        "nodeType": "BusinessEntity",
        "confidence": "medium",
        "sourceDoc": "procurement-process.docx",
        "sourcePage": 1,
        "synced": false
      }
    }
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": null
  },
  "files": {}
}
```

(In practice, each shape above would also have its bound text element, all arrows, and complete property sets. This example is abbreviated for readability.)

---

## Checklist

Before completing, verify:

- [ ] Input document was fully read (all pages for PDF)
- [ ] All process steps extracted and ordered
- [ ] All roles identified and assigned to swimlanes
- [ ] All documents/entities identified with READS/PRODUCES associations
- [ ] All decisions identified with condition text and branches
- [ ] Confidence levels assigned to every element
- [ ] `customData` present on every shape element with all 6 fields
- [ ] Every shape has a bound text element with correct `containerId`
- [ ] Colors match `nacl-core/SKILL.md` exactly
- [ ] Layout follows the grid system (swimlanes, spacing, document column)
- [ ] Arrows connect sequential steps with `startBinding` / `endBinding`
- [ ] Dashed arrows used for document relationships
- [ ] Board file written to `{$boards_dir}/{name}-board.excalidraw`
- [ ] Valid JSON (parseable)
- [ ] Report shown to user with element counts, confidence breakdown, and next steps
- [ ] No writes to Neo4j
