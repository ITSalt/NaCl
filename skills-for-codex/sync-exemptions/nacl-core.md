Source root: fix/validation-skills-v2.15-integration (skill routing table: nacl-sa-validate "L1-L6" → "L1-L13")
Intentional divergence: The Codex variant carries no skill-routing table with per-skill validation-level spans — it covers shared conventions (IDs, schema, Excalidraw) only, and its ID/label sections already include the 2.15 extension labels. The stale "L1-L6" text existed in the root file only.
Next review: next NaCl release that touches nacl-core
