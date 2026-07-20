# Neo4j Community image provenance

- Image: `docker.io/library/neo4j:5.24.2-community`
- Immutable OCI index digest: `sha256:2e7e4eea5bc1eec581a3097c018dfeb3747f3638e67a963c10554825c31c1425`
- Registry: Docker Hub official `library/neo4j` repository
- Verification date: 2026-07-20
- Verification command: `docker buildx imagetools inspect neo4j:5.24.2-community --raw`
- Raw OCI index SHA-256: `2e7e4eea5bc1eec581a3097c018dfeb3747f3638e67a963c10554825c31c1425`
- Verified platforms in the OCI index: `linux/amd64` and `linux/arm64/v8`
- Embedded APOC core path: `/var/lib/neo4j/labs/apoc-5.24.2-core.jar`
- Embedded APOC core SHA-256 on both `linux/amd64` and `linux/arm64/v8`: `39092c89df1cb80f4f3d8799821e74c7f1d10503f92625be32882b70b13002fa`
- Entrypoint SHA-256: `10ac049a5f6efbd9e0383c56f3ce050f947c4e4c67f5f0734ca13f9a8b82a6ec`
- Plugin map SHA-256: `d240d9daaeda5c840b0a184a24abc2c4b7a4b535be24e41cd0121503b1008a7c`

The Skills-only Compose template names both the approved exact tag and this
immutable digest. Runtime pulls therefore cannot float to another manifest.
That image's `/startup/neo4j-plugins.json` maps `apoc` to the embedded
`/var/lib/neo4j/labs/apoc-*-core.jar`; its entrypoint copies the embedded JAR
instead of using the network download branch. Bootstrap verifies the copied
JAR digest inside the running container, and the schema gate verifies exact
`apoc.version()` plus `apoc.meta.schema()` before declaring success.
