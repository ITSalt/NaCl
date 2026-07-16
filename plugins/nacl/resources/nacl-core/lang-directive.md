## Language Directive

This skill supports the `--lang` flag to control output language.

### Resolution order
1. Explicit `--lang=en` or `--lang=ru` flag on invocation
2. `project.lang` field in `config.yaml` (if present)
3. Default: `ru` (Russian) for BA/SA skills, `en` (English) for TL skills

### When `--lang=en` is active
- All artifact text (section headers, descriptions, labels) MUST be in English
- Node properties written to Neo4j (`name`, `description`, `type`, etc.) MUST be in English
- Cypher queries and technical identifiers are always in English regardless of flag
- ID patterns (BP-001, UC-001, etc.) are language-independent

### When `--lang=ru` is active (default for BA/SA)
- All artifact text in Russian
- This is the original behavior — no changes needed
