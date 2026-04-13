"""Mermaid parsers — stdlib only.

Targets two diagram shapes used by the old-methodology BA/SA skills:
  - stateDiagram-v2 (entity lifecycles)
  - flowchart TD / flowchart LR (workflows, activity diagrams)

Out of scope: everything else (sequence, class, ER diagrams are consumed as
markdown tables instead). If the parser cannot make sense of a block, it
returns an empty result and emits a warning — never raises.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


# ---------------------------------------------------------------------------
# stateDiagram-v2

@dataclass
class StateDiagramState:
    name: str                         # as written in Mermaid (node id OR display name)
    descriptions: List[str] = field(default_factory=list)


@dataclass
class StateDiagramTransition:
    from_name: str
    to_name: str
    condition: str = ""


@dataclass
class StateDiagram:
    states: List[StateDiagramState] = field(default_factory=list)
    transitions: List[StateDiagramTransition] = field(default_factory=list)


_STATE_DECL_RE = re.compile(r"^\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$")
_STATE_TRANS_RE = re.compile(
    r"^\s*([A-Za-z0-9_\[\]\*]+)\s*-->\s*([A-Za-z0-9_\[\]\*]+)"
    r"(?:\s*:\s*(.+))?\s*$"
)
_HTML_LINEBREAK_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_mermaid_html(s: str) -> str:
    """Clean Mermaid-embedded HTML from a description or condition.

    Mermaid diagrams frequently use `<br/>` for visual line breaks and
    occasionally other inline HTML. These markers are presentational and
    must not leak into Neo4j properties.
    """
    if not s:
        return s
    s = _HTML_LINEBREAK_RE.sub(" ", s)
    s = _HTML_TAG_RE.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_state_diagram(body: str) -> Optional[StateDiagram]:
    """Parse the body of a ```mermaid ... ``` block beginning with `stateDiagram-v2`."""
    lines = [ln for ln in body.splitlines() if ln.strip()]
    if not lines:
        return None
    first = lines[0].strip()
    if not first.lower().startswith("statediagram"):
        return None

    diagram = StateDiagram()
    states_by_name: dict[str, StateDiagramState] = {}
    for line in lines[1:]:
        stripped = line.strip()
        if not stripped or stripped.startswith("%%"):
            continue
        m = _STATE_TRANS_RE.match(stripped)
        if m:
            diagram.transitions.append(StateDiagramTransition(
                from_name=m.group(1).strip(),
                to_name=m.group(2).strip(),
                condition=_strip_mermaid_html((m.group(3) or "").strip()),
            ))
            continue
        m = _STATE_DECL_RE.match(stripped)
        if m:
            name = m.group(1).strip()
            desc = _strip_mermaid_html(m.group(2).strip())
            state = states_by_name.get(name)
            if state is None:
                state = StateDiagramState(name=name)
                states_by_name[name] = state
                diagram.states.append(state)
            state.descriptions.append(desc)
            continue
        # Unrecognised line — ignore silently (the renderer tolerates odd lines too)

    # Add states that appear only in transitions
    for t in diagram.transitions:
        for n in (t.from_name, t.to_name):
            if n in ("[*]",):
                continue
            if n not in states_by_name:
                st = StateDiagramState(name=n)
                states_by_name[n] = st
                diagram.states.append(st)

    return diagram


# ---------------------------------------------------------------------------
# flowchart

@dataclass
class FlowNode:
    id: str                 # mermaid node id (e.g. "S1", "D1", "START")
    label: str = ""         # extracted from [label] / {label} / ([label])
    shape: str = "rect"     # rect | round | diamond | stadium | circle

@dataclass
class FlowEdge:
    from_id: str
    to_id: str
    label: str = ""

@dataclass
class Flowchart:
    direction: str = "TD"   # TD | LR | BT | RL
    nodes: List[FlowNode] = field(default_factory=list)
    edges: List[FlowEdge] = field(default_factory=list)


_HEADER_RE = re.compile(r"^\s*(?:flowchart|graph)\s+(TD|LR|BT|RL)\b", re.IGNORECASE)

# Node declaration shapes:
#   ID[rect label]
#   ID(rect rounded)
#   ID([stadium])
#   ID{diamond}
#   ID((circle))
#   "ID<br/>multi-line" quoted
_NODE_SHAPES = [
    ("stadium", re.compile(r"([A-Za-z0-9_]+)\(\[(.+?)\]\)")),
    ("circle",  re.compile(r"([A-Za-z0-9_]+)\(\((.+?)\)\)")),
    ("diamond", re.compile(r"([A-Za-z0-9_]+)\{(.+?)\}")),
    ("round",   re.compile(r"([A-Za-z0-9_]+)\((.+?)\)")),
    ("rect",    re.compile(r"([A-Za-z0-9_]+)\[(.+?)\]")),
]

# Edge: A --> B   A -- label --> B   A -->|label| B
_EDGE_PLAIN = re.compile(r"([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)")
_EDGE_WITH_LABEL = re.compile(r"([A-Za-z0-9_]+)\s*--\s*(.+?)\s*-->\s*([A-Za-z0-9_]+)")
_EDGE_PIPED_LABEL = re.compile(r"([A-Za-z0-9_]+)\s*-->\s*\|(.+?)\|\s*([A-Za-z0-9_]+)")


def parse_flowchart(body: str) -> Optional[Flowchart]:
    """Parse a ```mermaid ... ``` block beginning with `flowchart` or `graph`."""
    lines = body.splitlines()
    first = next((ln.strip() for ln in lines if ln.strip()), "")
    header = _HEADER_RE.match(first)
    if not header:
        return None

    fc = Flowchart(direction=header.group(1).upper())
    seen_nodes: dict[str, FlowNode] = {}

    def _register_node(node_id: str, label: str = "", shape: str = "rect") -> None:
        existing = seen_nodes.get(node_id)
        if existing is None:
            node = FlowNode(id=node_id, label=_clean_label(label), shape=shape)
            seen_nodes[node_id] = node
            fc.nodes.append(node)
            return
        # Upgrade label / shape if more specific
        if label and not existing.label:
            existing.label = _clean_label(label)
        if shape != "rect" and existing.shape == "rect":
            existing.shape = shape

    for raw in lines[1:]:
        line = raw.strip()
        if not line or line.startswith("%%") or line.startswith("subgraph") or line == "end":
            continue

        # 1) Pull out node declarations ANYWHERE on the line.
        for shape, pat in _NODE_SHAPES:
            for m in pat.finditer(line):
                _register_node(m.group(1), m.group(2), shape)

        # 2) Edges (try label-variants first; otherwise plain)
        matched_edge = False
        for m in _EDGE_WITH_LABEL.finditer(line):
            _register_node(m.group(1))
            _register_node(m.group(3))
            fc.edges.append(FlowEdge(m.group(1), m.group(3), m.group(2).strip()))
            matched_edge = True
        for m in _EDGE_PIPED_LABEL.finditer(line):
            _register_node(m.group(1))
            _register_node(m.group(3))
            fc.edges.append(FlowEdge(m.group(1), m.group(3), m.group(2).strip()))
            matched_edge = True
        if not matched_edge:
            for m in _EDGE_PLAIN.finditer(line):
                if _is_inside_label(line, m.start()):
                    continue
                _register_node(m.group(1))
                _register_node(m.group(2))
                fc.edges.append(FlowEdge(m.group(1), m.group(2)))

    return fc


def _clean_label(raw: str) -> str:
    # Strip surrounding quotes, then run the shared HTML cleaner
    s = raw.strip()
    if len(s) >= 2 and s[0] == s[-1] == '"':
        s = s[1:-1]
    return _strip_mermaid_html(s)


def _is_inside_label(line: str, pos: int) -> bool:
    # Quick heuristic: if pos is between [ and ] or { and } on the same line, it's a label
    opens = {"[": "]", "(": ")", "{": "}"}
    depth = 0
    i = 0
    while i < pos:
        ch = line[i]
        if ch in opens:
            depth += 1
        elif ch in opens.values():
            depth = max(0, depth - 1)
        i += 1
    return depth > 0


# ---------------------------------------------------------------------------
# Convenience

def classify(body: str) -> str:
    """Return "stateDiagram" | "flowchart" | "other" for a mermaid block body."""
    first = next((ln.strip() for ln in body.splitlines() if ln.strip()), "")
    if first.lower().startswith("statediagram"):
        return "stateDiagram"
    if _HEADER_RE.match(first):
        return "flowchart"
    return "other"
