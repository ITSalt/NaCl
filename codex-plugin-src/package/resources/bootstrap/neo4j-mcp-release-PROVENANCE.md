# neo4j-mcp release pin provenance

- Upstream: `https://github.com/neo4j/mcp`
- Release: `v1.5.3`
- Release URL: `https://github.com/neo4j/mcp/releases/tag/v1.5.3`
- Archive checksums: exact values already pinned by NaCl's reviewed
  `neo4j-mcp.pin` and upstream `neo4j-mcp_1.5.3_checksums.txt`.
- Binary checksums: calculated on 2026-07-20 after downloading each supported
  release archive, verifying its pinned archive SHA-256, extracting into an
  empty temporary directory, locating the single `neo4j-mcp` executable, and
  hashing its exact bytes.
- Supported public Skills-only targets: Darwin arm64/x86_64, Linux
  arm64/x86_64, and Windows arm64/x86_64.

The public bootstrap rejects runtime version overrides other than the exact
pin, never consumes a persistent download cache, verifies both archive and
binary digests, and binds both digests into the local reuse receipt.
