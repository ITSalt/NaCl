# Secure local Compose asset

`local-neo4j.compose.yml` is instantiated only by the explicit local graph
lifecycle. Required substitutions are non-secret project Docker names, exact
ports, the pinned image, and a narrowly scoped `NACL_NEO4J_AUTH` child
environment value resolved from an opaque secret reference.

Security invariants:

- HTTP and Bolt publish only on `127.0.0.1`;
- the data volume is project-specific, named, labelled persistent, and never
  removed by lifecycle stop or plugin uninstall;
- the image is exact-patch pinned and never uses `latest`;
- no APOC or other plugin is installed;
- Linux capabilities are dropped except the image entrypoint's required
  ownership and UID/GID transition set (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`,
  `SETGID`, and `SETUID`);
- unrestricted and allowlisted procedure configuration is empty;
- no secret value is present in this file, process arguments, lifecycle JSON,
  or lifecycle audit output;
- automatic Docker start is disabled; start and stop are user-visible actions.
