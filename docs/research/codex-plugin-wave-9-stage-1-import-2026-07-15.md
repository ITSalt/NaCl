# Wave 9 Stage 1: exact donor import manifest

Date: 2026-07-15
Status: PARTIALLY_VERIFIED — EXACT IMPORT COMPLETE, STAGE 2 REFRESH REQUIRED

This evidence covers only the path-scoped Stage 1 import. It does not declare
the provisional Codex package current, production-ready, or release-ready. It
does not authorize a merge, push, tag, release, external deployment, credential
mutation, or portal action.

## Provenance and commit boundary

| Field | Exact value |
|---|---|
| Fresh-main successor base | 1c05ec78d681f19573d47731ba6830c242a9308e |
| Accepted old-Codex donor | c959879c2b6270d41da0c5d4bc4eb0b00bf9bbc7 |
| Support/tests/scripts import | b37dd79b9e42c31f98bb708efde07bd45082451c |
| Provisional plugin-seed import | b20ad464dd84d893e464170925a45b582afd0d8d |
| Absent Codex-only docs/evidence import | 09db0c8f845a8394aef45a0f2cb1e47971b28e72 |
| Pre-evidence Stage 1 head | 09db0c8f845a8394aef45a0f2cb1e47971b28e72 |

No merge, rebase, whole-tree restore, mass cherry-pick, or old shared-file
replacement was used. Every imported blob below is byte-identical to the exact
donor object recorded in the full manifest.

## Imported classes and counts

| Class | Files | Classification |
|---|---:|---|
| support-tests-scripts | 46 | Exact donor support seed: repo marketplace, dedicated Codex workflow, 35 test/vendor files, and 9 named Codex scripts |
| provisional-plugin-seed | 357 | Exact donor runtime/package seed; deliberately stale against current main and not a source of shared truth |
| codex-docs-evidence | 17 | Exact donor Codex-only ADR, user docs, legacy/install docs, and Wave 0-8 historical evidence absent from the successor base |
| Total imported donor paths | 420 | Full path and donor blob list below |
| This authored evidence file | 1 | New Stage 1 evidence, not a donor import |

The donor-only docs/configuration.ru.md was deliberately excluded. Despite
being absent in the base, it is shared framework documentation from an older
snapshot and must be rebuilt compositionally from current main in the later
documentation stage. Existing ADR-004, the reconciliation plan, the
orchestrator runbook, shared README files, shared setup pages, and all other
current-main files were not overwritten. No skills-for-codex path was changed
during this mechanical stage.

## Provisional seed: blocking non-truth contracts

The 357-file plugin tree is an addressable seed, not an accepted Wave 9 package.
The following donor contracts are stale and block Stage 2 completion:

1. plugins/nacl/resources/workflows/nacl-init/SKILL.md still says remote
   create/connect is outside the local pilot, while current main implements the
   local, create, and connect modes.
2. The gateway runtime and migrations still model independent
   ProjectMembership records scoped by project. Wave 9 instead requires an
   authoritative server principal set, derived membership for every project on
   that server, positive same-server project selection, and cross-server
   denial without inventory leakage.
3. The imported graph-unit suite passes its old per-project-membership contract.
   Its 89/89 result is donor regression evidence only and is not evidence for
   the accepted server authorization boundary.
4. The packaged remote create/connect scripts write URI, database user/name,
   and project scope but do not yet prove full host, unique gateway port,
   sidecar port, certificate/key/CA, TLS, and secret-source round-trip parity.
5. Current-main shared-source drift, package hashes, workflow parity counts,
   bundled docs, and legacy fallback contracts have not been refreshed.
6. The imported dedicated CI script still has old repository-wide selection
   behavior. CI ownership and exclusions remain Stage 5 work.
7. Ten absolute temporary-path references remain in the provisional plugin
   seed. Four are container-internal schema paths; the host-workflow and
   migration-log references require explicit Stage 2 classification or
   replacement. No concrete personal home path is present in the plugin tree.
8. The existing certificate, Neo4j route password, and future OAuth token have
   separate roles. The donor seed must not collapse them into one credential or
   expose the route secret as client input.

Stage 2 must rebuild the package from current main, process all 17 direct
counterparts and 7 explicit dispositions, regenerate inventories/hashes, and
replace the stale contracts above. Changing expected hashes without semantic
comparison is forbidden.

## Verification results

| Gate | Result | Evidence |
|---|---|---|
| Exact base, branch, and clean pre-import status | PASS | Base and branch matched the requested exact values before the first import |
| Donor content and file-mode identity | PASS | All 420 imported files matched their donor blob and mode before commit |
| Import allowlist | PASS | Machine comparison found exactly 420 allowed donor paths and no additional path |
| Negative deletion relative to base | PASS | Empty deletion set |
| Shared/current-main paths | PASS | No existing base path was modified |
| Claude generated plugin tree | PASS | Base and Stage 1 tree object both 3af70561ecc7c8d0494f411c5b89218a02826a1b |
| Claude generated parity | PASS | scripts/build-plugin.mjs --check exited 0 |
| Claude builder tests | PASS | 31 passed, 0 failed |
| Provisional plugin manifest validator | PASS | Status VERIFIED |
| Provisional public skill validator | PASS | 10 checked, Status VERIFIED |
| Provisional package closure | PASS | 357 files, 10 public skills, 60 workflows, Status VERIFIED |
| Imported JavaScript/shell/Python syntax | PASS | node --check, bash -n, and Python AST parsing exited 0 |
| Donor graph-unit regression | PASS WITH STALE CONTRACT | 89 passed, 0 failed; not server-boundary acceptance |
| Current legacy Codex skill validator | FAIL / STAGE 2 BLOCKER | 60 checked; nacl-postmortem description contains forbidden angle brackets |
| Plugin-package suite | FAIL / EXPECTED STALE SEED | 76 passed, 7 failed: legacy catalog, fallback/preflight, and current-main source mismatches |
| Workflow-integration suite | FAIL / EXPECTED STALE SEED | 35 passed, 3 failed: legacy catalog and old workflow parity assumptions |
| Plugin documentation suite | FAIL / EXPECTED RECONCILIATION WORK | Shared main docs, EN/RU parity, generated inventory, anchors, configuration RU source, and bundled runbook mirror require later composition |
| Secret-pattern scan | PASS | No private-key header or common live-token signature in the 420 imported paths |
| Personal-path scan: distributable/public docs | PASS | No concrete personal home path in plugins/nacl or imported public Codex docs |
| Historical/test path scan | REVIEWED, NON-DISTRIBUTABLE | Eleven synthetic host-path fixture lines in one test; three imported historical evidence files contain old host paths; three contain temporary paths |
| Node 20 exact runner | NOT_RUN | Local runner is Node v24.13.1 |
| PowerShell parser | NOT_RUN / HOSTED GATE | pwsh is unavailable locally |
| Docker E2E | NOT_RUN | Stage 1 is a mechanical import; server/topology behavior is not claimed |
| CLI/Desktop/Git-release portability | NOT_RUN | Deferred to rebuilt/frozen candidate and separately authorized release sequence |
| Hosted CI, SBOM, dependency/vulnerability and license scans | NOT_RUN | Later successor gates |
| External VPS, DNS, certificates, credentials, deployment, portal and Git remote mutations | NOT_RUN | Not authorized |

The documentation failure was executed after the six missing Codex-only user
documents had been imported. It still failed, as expected, on the shared
current-main reconciliation work; the failure was not suppressed or converted
to success.

## Stage 2 mandatory blockers

Stage 2 must, at minimum:

1. Introduce and verify a deterministic Codex source-to-package manifest and
   builder rooted in current main, then rebuild twice and compare byte-for-byte.
2. Refresh all 17 direct shared counterparts and record dispositions for the 7
   non-direct drift paths from the accepted reconciliation plan.
3. Preserve local/create/connect and the complete persisted remote endpoint
   contract across root, legacy Codex, packaged resources, shell and PowerShell.
4. Replace independent per-project authorization with derived projection from
   the authoritative server trusted-principal set. Add explicit union
   migration, new-project inheritance, unique gateway-port allocation,
   server-wide issue/rotation/revoke, fail-closed partial failure, stale-session
   invalidation, positive same-server access, and negative cross-server tests.
5. Parameterize every Cypher value and strictly validate/catalog any identifier
   that cannot be parameterized.
6. Reconcile legacy fallback/preflight, package hashes, exact workflow parity,
   bundled docs and generated inventories with current main.
7. Neutralize personal-name test literals before a merge-ready diff and
   classify/replace host absolute temporary paths before a distributable
   archive.
8. Repair the current legacy Codex validator failure without modifying frozen
   Claude source merely to satisfy Codex packaging.
9. Preserve the current Claude plugin byte-for-byte unless a separately
   reviewed shared-source change requires regeneration through its own builder.
10. Re-run the failing package, workflow, documentation, Node 20, PowerShell,
    Docker, hosted CI and security/reproducibility gates. None may be marked
    passed from the donor's historical evidence.

## Full imported path and donor blob manifest

Format: class, donor Git blob object, repository-relative path.

~~~text
support-tests-scripts 920a66384d2cbc1f6c7a1d90d258b18a96a101d0 .agents/plugins/marketplace.json
support-tests-scripts 4855a7da9c62a88e0711aa7a361d75f1eb05a6b6 .github/workflows/test-codex-plugin.yml
codex-docs-evidence abd645854fa8282998bb992939cbccd230062b28 docs/adr/003-codex-plugin-pilot-decision-set.md
codex-docs-evidence f1c7bb5b4666751f2e5d736519aa9b1b69a84283 docs/codex-plugin.md
codex-docs-evidence 3dfdd237290bd791b3b9648d100b6883ddddd4b9 docs/codex-plugin.ru.md
codex-docs-evidence 3f7aee60fac0bccd99a5a22f793e063071d1364b docs/research/codex-plugin-wave-0-baseline-2026-07-14.md
codex-docs-evidence ea995ca36948ad6ea2fee87dc3d66e22376fa7bf docs/research/codex-plugin-wave-1-desktop-lifecycle-2026-07-14.md
codex-docs-evidence dacddd16c4f5d07e02c080510dd19df106c3d7e6 docs/research/codex-plugin-wave-1-runtime-spike-2026-07-14.md
codex-docs-evidence 1ca784c7c09d2201e10c6f77f344d53405854b68 docs/research/codex-plugin-wave-2-package-cli-2026-07-14.md
codex-docs-evidence cbf3b77adf97a4a20392e0eae0eb06a261a07bb7 docs/research/codex-plugin-wave-3-local-graph-2026-07-14.md
codex-docs-evidence 8d83a71f47055b03219c874525deb10bbcd20938 docs/research/codex-plugin-wave-4-multi-project-2026-07-14.md
codex-docs-evidence c36f08292ab60503554e5e97f18beabb18f7b722 docs/research/codex-plugin-wave-5-concurrency-2026-07-14.md
codex-docs-evidence 72e03578443521e2396becf56c5c14eae0de1998 docs/research/codex-plugin-wave-6-workflow-integration-2026-07-14.md
codex-docs-evidence c4c4ba5817d456019d9567071101505f41d27e7a docs/research/codex-plugin-wave-7-candidate-2026-07-15.md
codex-docs-evidence 3b660cb29fcf54c57e39e3ecb6d513224ead8f01 docs/research/codex-plugin-wave-8-documentation-2026-07-15.md
codex-docs-evidence 3489c30f548906baa78f25b960a28f0cbead9cfc docs/setup/codex-legacy-compatibility.md
codex-docs-evidence 71750b4ba2c0807ba5f7eba37a66852963080ef9 docs/setup/codex-legacy-compatibility.ru.md
codex-docs-evidence 92959c9dcc68ffe80338389debf572567e51dc6a docs/setup/install-codex-plugin.md
codex-docs-evidence 9e015a16f96d3c7d31f987f306eb427d425206f2 docs/setup/install-codex-plugin.ru.md
provisional-plugin-seed 57a793ca2b6a0c5b04dfa11198be10566d0f0cc2 plugins/nacl/.codex-plugin/plugin.json
provisional-plugin-seed 7c5b5535ccdc71295135258b8700f79df04fdab9 plugins/nacl/.mcp.json
provisional-plugin-seed 01b98b013129cbb54782809ddde2eb7dd2a5fd93 plugins/nacl/graph/compose/README.md
provisional-plugin-seed 8755e90d0eec3d17606f2f1d477a32c43b9cd2ac plugins/nacl/graph/compose/local-neo4j.compose.yml
provisional-plugin-seed da2f88f23a0f50cbb0009ef2e9d802e76ac4c84d plugins/nacl/graph/migrations/001-gateway-foundation.json
provisional-plugin-seed 0884190b8928d7a11fe5b23bb6fa60a4d2f08cb0 plugins/nacl/graph/migrations/002-concurrency-foundation.json
provisional-plugin-seed c46a3d698ca4c046103831c2a9a51fddd453c9a7 plugins/nacl/graph/migrations/003-schema-resource-identity.json
provisional-plugin-seed b98c440f2758c16b53f4b6b32315a49e07ed820e plugins/nacl/graph/queries/catalog.json
provisional-plugin-seed c2f1d1b13fae05e46701f4d11f7b0b3685a8582b plugins/nacl/resources/docs/guides/goal-command.md
provisional-plugin-seed 2b80ab4c7c94b6660351c83e41d89f7196f75c23 plugins/nacl/resources/docs/guides/goal-permissions.md
provisional-plugin-seed 94928d233666ff524371b6cd5fc21870236438c7 plugins/nacl/resources/docs/guides/goal-proof-protocol.md
provisional-plugin-seed 133f41fe7966e4599d4676d52a690d644543f4dc plugins/nacl/resources/docs/guides/goal-run-schema.md
provisional-plugin-seed 03c98a96ffd5b658301bdaf83ad4ea5b20ebf4b2 plugins/nacl/resources/docs/runbooks/connect-to-existing-remote-project.md
provisional-plugin-seed 2635d0e273c78ae91f49d9ec8bbfd3c346e9bb96 plugins/nacl/resources/docs/runbooks/provision-shared-graph-vps.md
provisional-plugin-seed 0ea498a6959bc8257818585515b254cb8d56047f plugins/nacl/resources/docs/runbooks/requirement-anchoring-upgrade.md
provisional-plugin-seed 5f79f568bbb05cb7a1de8dafec4c2f8f8869b1f6 plugins/nacl/resources/docs/runbooks/upgrade-graph-extensions.md
provisional-plugin-seed 6e91ad561f8b882be286f7eb30e6e6606ab6705a plugins/nacl/resources/docs/skill-modifiers.md
provisional-plugin-seed ae0baed8e34603bc98c83ffef81e7902af968a12 plugins/nacl/resources/docs/skill-modifiers.ru.md
provisional-plugin-seed 7f555a9b61ee923b02e86d564283dda4ac8d5716 plugins/nacl/resources/graph-infra/queries/ba-queries.cypher
provisional-plugin-seed 6c4ba132e8344d3f9ea69a8558eddb26fd8297fc plugins/nacl/resources/graph-infra/queries/handoff-queries.cypher
provisional-plugin-seed 789b923aba52bd00391f9e9cc9f0b6d6c215e741 plugins/nacl/resources/graph-infra/queries/sa-queries.cypher
provisional-plugin-seed 015b7510b639136329a0c84ae05142f88b52d462 plugins/nacl/resources/graph-infra/queries/tl-queries.cypher
provisional-plugin-seed 7ac9896a9fe3f9a54bb19e2f8b78bf8b71017364 plugins/nacl/resources/graph-infra/queries/validation-queries.cypher
provisional-plugin-seed 4e78cf16ea5756024c88e40c97d8cdc048b3fd62 plugins/nacl/resources/graph-infra/schema/ba-schema.cypher
provisional-plugin-seed d59b5b8e912e7673330c1210d36ad71188e40833 plugins/nacl/resources/graph-infra/schema/sa-schema.cypher
provisional-plugin-seed aed801acc475562673ac65bcdc245bd24de9636c plugins/nacl/resources/graph-infra/schema/seed-data.cypher
provisional-plugin-seed 5b8e3034d61a602a0f3ffd51ac1a41a078ca0e0e plugins/nacl/resources/graph-infra/schema/tl-schema.cypher
provisional-plugin-seed 6d3568e3ca1cfda701b798aa72362b4dc73bf44f plugins/nacl/resources/nacl-ba-analyze/SKILL.md
provisional-plugin-seed bab4a2dba63ba512896a8b8c9de6946767bc6b1f plugins/nacl/resources/nacl-ba-context/SKILL.md
provisional-plugin-seed 3669e2a129986c0eb2639f0bb2b3bb14245181f9 plugins/nacl/resources/nacl-ba-entities/SKILL.md
provisional-plugin-seed fe8c3b15f2928a4231c5003c1fa3ccf525db22a2 plugins/nacl/resources/nacl-ba-from-board/SKILL.md
provisional-plugin-seed 9eb8d9a50fcbe26094d59b1c2c74719ba19967c7 plugins/nacl/resources/nacl-ba-full/SKILL.md
provisional-plugin-seed 1fbe9a5d88c12d9a1ced9d21a5b8022f57dfbe7d plugins/nacl/resources/nacl-ba-glossary/SKILL.md
provisional-plugin-seed ae7126a961e769d7e578a61732aaaec754bf9e73 plugins/nacl/resources/nacl-ba-handoff/SKILL.md
provisional-plugin-seed 35e197326c753f9d91974184173de2097f2c2df7 plugins/nacl/resources/nacl-ba-import-doc/SKILL.md
provisional-plugin-seed b9d2ebc424050b32ff39499f517297dbb141f576 plugins/nacl/resources/nacl-ba-process/SKILL.md
provisional-plugin-seed 1cc7fe0e501f884880b112fd8b83a61f45b9dad8 plugins/nacl/resources/nacl-ba-roles/SKILL.md
provisional-plugin-seed e33565030c92e547bf1f821404c34d2edeabb2b8 plugins/nacl/resources/nacl-ba-rules/SKILL.md
provisional-plugin-seed 5c599d7e811b39824e47a93bfa6783bae2992f58 plugins/nacl/resources/nacl-ba-sync/SKILL.md
provisional-plugin-seed 2063bbc3e97cd031e3e2f267174e08fad80a6c72 plugins/nacl/resources/nacl-ba-validate/SKILL.md
provisional-plugin-seed 38e82b94cbcdd469767e0b65ecefa776bbbca71a plugins/nacl/resources/nacl-ba-workflow/SKILL.md
provisional-plugin-seed 08d277c99bc6ae0bac0acac3cf57383fd849f532 plugins/nacl/resources/nacl-core/SKILL.md
provisional-plugin-seed 9ba99602a000e1920e1ded259fd3031b943fe8d0 plugins/nacl/resources/nacl-core/lang-directive.md
provisional-plugin-seed 0438665a2c5da3b11f67d5b5497e7a069542d1e4 plugins/nacl/resources/nacl-core/scripts/branch.sh
provisional-plugin-seed d9c3a0ddeb24b27dbf97186fbfa9e8aa30aa2c75 plugins/nacl/resources/nacl-core/scripts/claim-task.mjs
provisional-plugin-seed 8a4fe775964f15a5727d4203369a5967a0fbeb6c plugins/nacl/resources/nacl-core/scripts/classify-findings.mjs
provisional-plugin-seed fa18636471b29eaf47b9e965189d6433c3705362 plugins/nacl/resources/nacl-core/scripts/classify-pr-merge.mjs
provisional-plugin-seed 05fe4f752e2ee2c35346d3a01fadec282827841b plugins/nacl/resources/nacl-core/scripts/health-check.sh
provisional-plugin-seed 902f0e3d4a5f92f7100b5ed37c19f642e84d7998 plugins/nacl/resources/nacl-core/scripts/nacl-ids.mjs
provisional-plugin-seed d54194d0d3f058ceb309cc13012c642125f68c06 plugins/nacl/resources/nacl-core/scripts/nacl-installation-fallback.mjs
provisional-plugin-seed 678163e787caea860f3ea5de729a1c8dfeccb545 plugins/nacl/resources/nacl-core/scripts/resolve-developer-id.mjs
provisional-plugin-seed a9993ed784a98b2092edb075a400075cade6651b plugins/nacl/resources/nacl-core/scripts/wait-for-ci.sh
provisional-plugin-seed 223920649b7b615249602e25cf9cf6fedefd6b91 plugins/nacl/resources/nacl-goal/SKILL.md
provisional-plugin-seed 2506bc3f513ef6e9ed797f38e40ea67d6df23af8 plugins/nacl/resources/nacl-goal/aliases.md
provisional-plugin-seed 03df73f4829ce88ef41edbc94828d93511b095be plugins/nacl/resources/nacl-goal/checks/conduct.sh
provisional-plugin-seed b356f3d682484dcfc1fe62577951aa47626d3e89 plugins/nacl/resources/nacl-goal/checks/feature.sh
provisional-plugin-seed 6529a957829b33b98ed70ea85389191b50c14f28 plugins/nacl/resources/nacl-goal/checks/fix.sh
provisional-plugin-seed f5c8acf6d23a97eb9b3716410d1f63216454ff8f plugins/nacl/resources/nacl-goal/checks/intake.sh
provisional-plugin-seed 62d71cad73735f3bc79a11690b7de2c8551f3638 plugins/nacl/resources/nacl-goal/checks/migrate-canary.sh
provisional-plugin-seed 01a7b2f5a95626aac728334c71215f64449e1f9c plugins/nacl/resources/nacl-goal/checks/probe-stop-signals.sh
provisional-plugin-seed 224fdc25852b686934d7856b29472e41cebd5c5f plugins/nacl/resources/nacl-goal/checks/reopened-drain.sh
provisional-plugin-seed f6088d170ea0bd61e536b1b01f9a0493e388557e plugins/nacl/resources/nacl-goal/checks/stubs-cleanup.sh
provisional-plugin-seed 42fbde03eb69d415455af74620f1d6fe106b6c2c plugins/nacl/resources/nacl-goal/checks/validate.sh
provisional-plugin-seed 57cb48a367deabc25335b387148833e797548485 plugins/nacl/resources/nacl-goal/checks/wave.sh
provisional-plugin-seed a9639fb7fe3aa8437e1c84d258376f8a88fe065f plugins/nacl/resources/nacl-goal/envelope.md
provisional-plugin-seed c12cb67b01411cb4fb677e96443eb3cd8a197dde plugins/nacl/resources/nacl-goal/gate-fire-detector.md
provisional-plugin-seed 2402954b7f12dc6e3a95d398e51f0647abd8e7d5 plugins/nacl/resources/nacl-goal/gate-prediction.md
provisional-plugin-seed f07b2669ced936a6939952a4eba9541d6fddf7dd plugins/nacl/resources/nacl-goal/plan-lock-schema.md
provisional-plugin-seed a1179efb05fae8ba5e57957d392501058b26d1e5 plugins/nacl/resources/nacl-goal/pr-body-template.md
provisional-plugin-seed eddd73d48844dd5adf45b07507f6e93d414ee814 plugins/nacl/resources/nacl-goal/pricing.json
provisional-plugin-seed af3201fd529e070da35aa25285142f938f02d9f8 plugins/nacl/resources/nacl-goal/refusal-catalog.md
provisional-plugin-seed ecd86c58cf63e0812a1a0c4deeca5cb068b33e7c plugins/nacl/resources/nacl-goal/regression-schema.md
provisional-plugin-seed 32483caca96fc82a53d4efdb44f61960d31985b5 plugins/nacl/resources/nacl-goal/retry-policy.md
provisional-plugin-seed e8a02fdb8587613e0fd874c95ea80104609322f3 plugins/nacl/resources/nacl-goal/run-artifacts.md
provisional-plugin-seed ccc29c94d4c67e56cb4eba6ef51102bd5c0b8a39 plugins/nacl/resources/nacl-init/SKILL.md
provisional-plugin-seed 12e38afc954b7b10d43f0fee0cb4107f69a271ca plugins/nacl/resources/nacl-migrate-ba/SKILL.md
provisional-plugin-seed d00a8372d5226f35a326495210050d8530aa14fa plugins/nacl/resources/nacl-migrate-ba/scripts/audit_ba.py
provisional-plugin-seed fc83098251c25ccd9a0e5b7c1ab92c379bba9bdb plugins/nacl/resources/nacl-migrate-ba/scripts/detect_ba.py
provisional-plugin-seed 115470e92d9e0b4ecb36e1d32499922f91c73ecd plugins/nacl/resources/nacl-migrate-ba/scripts/generate_ba_cypher.py
provisional-plugin-seed b81aa486179ccab6e9335a587dc7d4a59495b9e3 plugins/nacl/resources/nacl-migrate-ba/scripts/parse_ba.py
provisional-plugin-seed 85beea262b15122d02c5e8dd251393270dbc0bf8 plugins/nacl/resources/nacl-migrate-ba/scripts/preflight_ids.py
provisional-plugin-seed 347778c281127590dc5a32c41f66c7dc6c0f9da7 plugins/nacl/resources/nacl-migrate-ba/scripts/validate_ba_ir.py
provisional-plugin-seed ce9035a3640fd244991d093ee79cd77507be54c0 plugins/nacl/resources/nacl-migrate-core/README.md
provisional-plugin-seed 81b7a2b7a66005a36cce7f39629360ab0e6a28f2 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/__init__.py
provisional-plugin-seed f21ab37361b60d731514540fda481fc5db4596c7 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/adapters/__init__.py
provisional-plugin-seed d1edf28f50fdb0e4d763507248c10f8c920b997d plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/adapters/base.py
provisional-plugin-seed 9a187a706665f45e920bb823e6670af216efda2f plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/adapters/detect.py
provisional-plugin-seed 48585b36e5d920790552dad307d990f2924eb33e plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/adapters/frontmatter_v1.py
provisional-plugin-seed 60bba179140b4d8f379a4db37c7e502bbf79dc34 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/adapters/frontmatter_v1_sa.py
provisional-plugin-seed 8142c9b6e3e24871a83bda1affcd9859959ddd2c plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/adapters/inline_table_v1.py
provisional-plugin-seed 8d7211f14a445b0bd626c1509dd992456ff3df36 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/adapters/inline_table_v1_sa.py
provisional-plugin-seed 39384fec3e76eb45eba83507b01eea9db1c675b9 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/frontmatter.py
provisional-plugin-seed cec3fbc83ad4a300535cf69e529aa893b594c9cf plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/ir_ba.py
provisional-plugin-seed 824179a445ef4d88cf644b4515d42918921a81f6 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/ir_handoff.py
provisional-plugin-seed 439beb952bcbca20540df415f38b8a2a12a80d20 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/ir_sa.py
provisional-plugin-seed ca7aecb07b4f1b1044f7230e457c49ca36d7a291 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/markdown.py
provisional-plugin-seed 3d2d0de26494cae0f3e688963e8758c8a5069593 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/mermaid.py
provisional-plugin-seed b44d9cecb3b0c26588c50e5685d5d587a2392875 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/preflight.py
provisional-plugin-seed 2da9fe048fd484b691bec8cf44a6a0028280d374 plugins/nacl/resources/nacl-migrate-core/nacl_migrate_core/slugify.py
provisional-plugin-seed 93b6e0b6f8fdc543c41bcfe2e13d5595d5b4160b plugins/nacl/resources/nacl-migrate-sa/SKILL.md
provisional-plugin-seed c0c8a3c10098527a010582a287e6326103332ba3 plugins/nacl/resources/nacl-migrate-sa/scripts/audit_sa.py
provisional-plugin-seed bb26228b1c6a7ad7a3c6af4d42ff7d21c100af9d plugins/nacl/resources/nacl-migrate-sa/scripts/generate_sa_cypher.py
provisional-plugin-seed 928b0363d20a09e8140b97ccade2aaac4eaf4056 plugins/nacl/resources/nacl-migrate-sa/scripts/parse_sa.py
provisional-plugin-seed d4fc7a6014257426dc27165becc98a2ead0d9921 plugins/nacl/resources/nacl-migrate-sa/scripts/validate_sa_ir.py
provisional-plugin-seed 32ad7cf9b37e90629dfbdace0edb11f7973a8066 plugins/nacl/resources/nacl-migrate/SKILL.md
provisional-plugin-seed d9970ed4fa59457fa27ad28d72699fe63e37b88b plugins/nacl/resources/nacl-postmortem/SKILL.md
provisional-plugin-seed 0228ac626da3c98395c1d46c7e826b02046ca53e plugins/nacl/resources/nacl-publish/SKILL.md
provisional-plugin-seed 8469e52dbe2a71ed2037a782edb47679bb272c78 plugins/nacl/resources/nacl-render/SKILL.md
provisional-plugin-seed c3a317e59f40739c2e20f48e3ab7acc7cd1b0b75 plugins/nacl/resources/nacl-sa-architect/SKILL.md
provisional-plugin-seed bd0e2373368e6fa543d119f0e4c79853ae45c189 plugins/nacl/resources/nacl-sa-domain/SKILL.md
provisional-plugin-seed 8b27265a0ff730d6f4250cbe7a7a71f5f848efe1 plugins/nacl/resources/nacl-sa-feature/SKILL.md
provisional-plugin-seed 105c906f0aaaaebd95e8bf4499402a205a6b1b05 plugins/nacl/resources/nacl-sa-finalize/SKILL.md
provisional-plugin-seed 745f463809c627238685019bc01e5976f76acaf5 plugins/nacl/resources/nacl-sa-flags/SKILL.md
provisional-plugin-seed 993bda53dbaa37c33cff864a7c47c57c383b8c2b plugins/nacl/resources/nacl-sa-full/SKILL.md
provisional-plugin-seed 65e182095492f308e89c6787795054b7aea1189b plugins/nacl/resources/nacl-sa-roles/SKILL.md
provisional-plugin-seed 28158a876bef556d460ed910571f97a161c78bcd plugins/nacl/resources/nacl-sa-uc/SKILL.md
provisional-plugin-seed a531ab4c80082674cddc21220832c42abc05dff7 plugins/nacl/resources/nacl-sa-uc/references/runtime-contract.cypher
provisional-plugin-seed 8f5033610be658eed10b00c9efbc8aa0593fb1a0 plugins/nacl/resources/nacl-sa-ui/SKILL.md
provisional-plugin-seed c98f93186329c03d30a34a7994de63600312e16d plugins/nacl/resources/nacl-sa-ui/references/reachability.cypher
provisional-plugin-seed 592f2e9d0afd4ccec5b4a462624cdccd4eb0e147 plugins/nacl/resources/nacl-sa-validate/SKILL.md
provisional-plugin-seed 16ebe0bfafe9125fcdb1e93c55957802b209d76e plugins/nacl/resources/nacl-tl-conductor/SKILL.md
provisional-plugin-seed 16a099c20a6ee845ea0a8c1eb6a410c51dfcbe5b plugins/nacl/resources/nacl-tl-core/examples/api-contract-example.md
provisional-plugin-seed 06211ddd4914581b3d3069d80728f1c8c9812f05 plugins/nacl/resources/nacl-tl-core/examples/fe-tdd-cycle-example.md
provisional-plugin-seed f2e149cbc66943070f9edc4fe41182e331a1a09f plugins/nacl/resources/nacl-tl-core/examples/full-workflow-be-fe-example.md
provisional-plugin-seed 85420a8afd2fe3a0847252db79b19c3f09c39c3d plugins/nacl/resources/nacl-tl-core/examples/full-workflow-example.md
provisional-plugin-seed 6ba94dbaa809fe7f4731404f4d0472668b36b07a plugins/nacl/resources/nacl-tl-core/examples/sync-report-example.md
provisional-plugin-seed ac94394ba0ffe182808c453313f9b13d25a67453 plugins/nacl/resources/nacl-tl-core/examples/task-example.md
provisional-plugin-seed 309ade1230cc8d6d33ca241f90bd1bfec77b4777 plugins/nacl/resources/nacl-tl-core/examples/tdd-cycle-example.md
provisional-plugin-seed 2e1213052b0309c02e586582ee1200d5e1508126 plugins/nacl/resources/nacl-tl-core/references/api-contract-rules.md
provisional-plugin-seed d5f39ed5c7f4f953ea5f2606c48837b134a1f5b3 plugins/nacl/resources/nacl-tl-core/references/changelog-format.md
provisional-plugin-seed 11653c2b9afa9d01053d6bf2ded77fc741577c0e plugins/nacl/resources/nacl-tl-core/references/code-style.md
provisional-plugin-seed 910cd35ccd54ee50b98727fb44ddc0a1f1a913c5 plugins/nacl/resources/nacl-tl-core/references/commit-conventions.md
provisional-plugin-seed 87d6dcb8a4c78314769dd3b11a804a54fd97e4b8 plugins/nacl/resources/nacl-tl-core/references/config-schema.md
provisional-plugin-seed 3e8787a900afb43de872f21f32ca99844354a979 plugins/nacl/resources/nacl-tl-core/references/dev-environment.md
provisional-plugin-seed ed09e6b16ba53a5ccb7bc5808ee758f303665e61 plugins/nacl/resources/nacl-tl-core/references/emergency-mode.md
provisional-plugin-seed a6caf1dcb63ecd4a42bf72ea1de309a5ca627e3d plugins/nacl/resources/nacl-tl-core/references/fe-code-style.md
provisional-plugin-seed ce6ec30934d26b8211c7d4d3cffd91c858226f85 plugins/nacl/resources/nacl-tl-core/references/fe-review-checklist.md
provisional-plugin-seed 51533fb942e215b216b00e5045c2c22646851853 plugins/nacl/resources/nacl-tl-core/references/fix-classification-rules.md
provisional-plugin-seed 0de879bf3890f07cd8061eb8c2216e6ce537bcfd plugins/nacl/resources/nacl-tl-core/references/frontend-rules.md
provisional-plugin-seed 029ff5848c01ff175a8af8e549afbd46c9131443 plugins/nacl/resources/nacl-tl-core/references/gate-fire-catalog.md
provisional-plugin-seed 94877133fdc4c2b95622323ad698492ff90adbd0 plugins/nacl/resources/nacl-tl-core/references/intake-scoring.md
provisional-plugin-seed 07fb670a6caec0d21a1638c5ee743d5f711b13b5 plugins/nacl/resources/nacl-tl-core/references/project-gap-closure.md
provisional-plugin-seed 18a8d94a07367c6c364a56290ffc371027553159 plugins/nacl/resources/nacl-tl-core/references/provenance-gap-closure.md
provisional-plugin-seed 251077c3fd80cb257ba7ceccf420ac8ca22ad3ed plugins/nacl/resources/nacl-tl-core/references/qa-rules.md
provisional-plugin-seed 15e479bb881e9cfb86f3a3b34f7c2705879eb967 plugins/nacl/resources/nacl-tl-core/references/remote-mode-coordination.md
provisional-plugin-seed ad82ba1026ce270869ac718fbc4512314918c00b plugins/nacl/resources/nacl-tl-core/references/review-checklist.md
provisional-plugin-seed 585587fa41ec76e65cd2ec343d019670206e2fda plugins/nacl/resources/nacl-tl-core/references/sa-doc-update-matrix.md
provisional-plugin-seed 0d10bc5085be7c85ec9debdb92184257fa3d6386 plugins/nacl/resources/nacl-tl-core/references/sa-integration.md
provisional-plugin-seed 3e60a563a28b1444a15e524dbc25bbc2564cebed plugins/nacl/resources/nacl-tl-core/references/strict-mode-changes.md
provisional-plugin-seed ed550a15164ff1c5bffbd793dfa7e55364bdc90b plugins/nacl/resources/nacl-tl-core/references/stub-tracking-rules.md
provisional-plugin-seed 12fb468ab6950e0655a69ba32a4ef132dfed5494 plugins/nacl/resources/nacl-tl-core/references/sync-rules.md
provisional-plugin-seed abde784c18db86f2d413240695913d4bd59f6554 plugins/nacl/resources/nacl-tl-core/references/task-file-format.md
provisional-plugin-seed 3b1e78d262218dd339fa56c91d8ba7eb3aad7728 plugins/nacl/resources/nacl-tl-core/references/tdd-workflow.md
provisional-plugin-seed 4e0c6103f98d7c16d15c3813e2b3b6516e344d48 plugins/nacl/resources/nacl-tl-core/references/tl-protocol.md
provisional-plugin-seed 6f172d829b33f72b1654624bc6e1d5ecbcb063b8 plugins/nacl/resources/nacl-tl-core/scripts/connect-remote.ps1
provisional-plugin-seed cb32d1292d7b8e97154ad292c3ba3563e36f9f08 plugins/nacl/resources/nacl-tl-core/scripts/connect-remote.sh
provisional-plugin-seed a8cb763c9fc87ae6c2351faeab920a93a4cec521 plugins/nacl/resources/nacl-tl-core/scripts/create-remote.ps1
provisional-plugin-seed ff0d15f48f6d056ff7b8ad296a3cd5c9acc45e7c plugins/nacl/resources/nacl-tl-core/scripts/create-remote.sh
provisional-plugin-seed 7125a80ed994f1e0c97b5d7e9c9c595ca637eaa4 plugins/nacl/resources/nacl-tl-core/scripts/lib-neo4j-mcp.ps1
provisional-plugin-seed 67a93c8553f42e7e6d1614d9722f3f17035e98a4 plugins/nacl/resources/nacl-tl-core/scripts/lib-neo4j-mcp.sh
provisional-plugin-seed 186993325a4a89ff3d71bf8237b69c5d9852c472 plugins/nacl/resources/nacl-tl-core/scripts/mcp-cypher.mjs
provisional-plugin-seed b4a905c47b8cb82b2ca2d1891aeae69fae9c6c0c plugins/nacl/resources/nacl-tl-core/scripts/register-project.mjs
provisional-plugin-seed 5bd6312f5e6f620b3400297eafe745688a284b3c plugins/nacl/resources/nacl-tl-core/scripts/resolve-graph-mode.mjs
provisional-plugin-seed 403e0611e668f1fc63604fe621217fa888437e42 plugins/nacl/resources/nacl-tl-core/scripts/setup-graph.ps1
provisional-plugin-seed 65cace4b1dc59538514444bcae9b32d6edfa82f7 plugins/nacl/resources/nacl-tl-core/scripts/setup-graph.sh
provisional-plugin-seed cddda20f6861758b479eedf12a94efc137b626c1 plugins/nacl/resources/nacl-tl-core/scripts/write-graph-config.mjs
provisional-plugin-seed 4be026c0886a140f3de54e2513d4e302b395145a plugins/nacl/resources/nacl-tl-core/scripts/write-mcp-config.mjs
provisional-plugin-seed 64cd6ae8d8063ecd775fccd94304d795c3faf9e2 plugins/nacl/resources/nacl-tl-core/templates/acceptance-template.md
provisional-plugin-seed 96e2f1ee0eed7f3b27fca90bf2b6558accdb766c plugins/nacl/resources/nacl-tl-core/templates/api-contract-template.md
provisional-plugin-seed fce8f39f455d2e848dc09342be0bc6c8529f8170 plugins/nacl/resources/nacl-tl-core/templates/changelog-entry.md
provisional-plugin-seed 9a3b247a9eeba39ec5728556bf841b1e4d6760c4 plugins/nacl/resources/nacl-tl-core/templates/claude-md-template.md
provisional-plugin-seed 7aa8ef8a9c73b5062d4bdf3a62a4e3bf970afd37 plugins/nacl/resources/nacl-tl-core/templates/config-yaml-template.yaml
provisional-plugin-seed 945dc8b0df8d8469bff2716f734db2e6a2a095ac plugins/nacl/resources/nacl-tl-core/templates/deploy-backend.yml
provisional-plugin-seed 43cb3d95cc16dfe7280850ccb1e9a8a4fc65bd44 plugins/nacl/resources/nacl-tl-core/templates/deploy-frontend.yml
provisional-plugin-seed 162a868fd7aed17abf2aca55e67029b6118d30e1 plugins/nacl/resources/nacl-tl-core/templates/docker-compose-dev-template.yml
provisional-plugin-seed 8086458be94e27d1a3b75f3847961009fd23b831 plugins/nacl/resources/nacl-tl-core/templates/graph-docker-compose.vps.yml
provisional-plugin-seed 44bd5342a0c849025cb2beef61e185b5479d2ba0 plugins/nacl/resources/nacl-tl-core/templates/graph-docker-compose.yml
provisional-plugin-seed 261edb0cde48e2ebfa2288ce475bc1dee98f4dcd plugins/nacl/resources/nacl-tl-core/templates/impl-brief-fe-template.md
provisional-plugin-seed 813010adf3ff40e4caf0852e30fcd54e32d9f585 plugins/nacl/resources/nacl-tl-core/templates/impl-brief-template.md
provisional-plugin-seed 53e7858b5fa5f078c05dfea7a7f4823c512b7106 plugins/nacl/resources/nacl-tl-core/templates/qa-report-template.md
provisional-plugin-seed 7090e766040bcb39190229035f0190789fcfb821 plugins/nacl/resources/nacl-tl-core/templates/result-template.md
provisional-plugin-seed 890f1ac0ca435057f99d60cc9f40cbabe21bb923 plugins/nacl/resources/nacl-tl-core/templates/review-template.md
provisional-plugin-seed 31b5c1210b28ecf3eb50045be25692d6004edee6 plugins/nacl/resources/nacl-tl-core/templates/stub-report-template.md
provisional-plugin-seed c91a2915c4b4b256a7a638936912f1c6278dd2e6 plugins/nacl/resources/nacl-tl-core/templates/sync-report-template.md
provisional-plugin-seed ba08fd7283ae3dab6af1983fa90f20f84e286a30 plugins/nacl/resources/nacl-tl-core/templates/task-be-template.md
provisional-plugin-seed 01d26042f80c4d853e2910ee4e450e0dec67ee16 plugins/nacl/resources/nacl-tl-core/templates/task-fe-template.md
provisional-plugin-seed 38a07342e24d4f3539d6445d9a766dc5b171a3b2 plugins/nacl/resources/nacl-tl-core/templates/task-template.md
provisional-plugin-seed 4fde617d45cd31c57bbae664e7fec68237b7717b plugins/nacl/resources/nacl-tl-core/templates/tech-task-template.md
provisional-plugin-seed 985dd0919584116569cdfc1e347d8edba5eef8b8 plugins/nacl/resources/nacl-tl-core/templates/test-spec-fe-template.md
provisional-plugin-seed 96343a3a0cd93b304a58eb092175700b6ca785de plugins/nacl/resources/nacl-tl-core/templates/test-spec-template.md
provisional-plugin-seed 2cfa26c91248fa98e3179dc80e06644ca5a270de plugins/nacl/resources/nacl-tl-deliver/SKILL.md
provisional-plugin-seed 4393b5ba00cc4115e8b89b24b73c89ceb4fdfef5 plugins/nacl/resources/nacl-tl-deploy/SKILL.md
provisional-plugin-seed 9f9b434d1a2c0f8f6b517ccd82bd68a723e07cc0 plugins/nacl/resources/nacl-tl-dev-be/SKILL.md
provisional-plugin-seed 44b2e471e05a814b0d262e201d5b5d35de156aa5 plugins/nacl/resources/nacl-tl-dev-fe/SKILL.md
provisional-plugin-seed e82f9626fff675ed252aa818cb99bae33fa34ad9 plugins/nacl/resources/nacl-tl-dev/SKILL.md
provisional-plugin-seed 939e248a3858c5e2bf71efadcbcfe0df327f2f3d plugins/nacl/resources/nacl-tl-diagnose/SKILL.md
provisional-plugin-seed b742d694c2fbdbcd509ab398ece23127fecb599b plugins/nacl/resources/nacl-tl-docs/SKILL.md
provisional-plugin-seed 210f365bfa777ad4ff9e8a029344dbb74da6ed57 plugins/nacl/resources/nacl-tl-fix/SKILL.md
provisional-plugin-seed 1f32b4e50627aac22c5fbeedee90fb6c9ec27df7 plugins/nacl/resources/nacl-tl-full/SKILL.md
provisional-plugin-seed 3f00be688907e5888828acfbc57ab64897e0d9cc plugins/nacl/resources/nacl-tl-hotfix/SKILL.md
provisional-plugin-seed cc531f89ad25c0a81159b5fe150761f586c1f17a plugins/nacl/resources/nacl-tl-intake/SKILL.md
provisional-plugin-seed e7613a410084aba2efcbdc96bd429a2d2f821369 plugins/nacl/resources/nacl-tl-next/SKILL.md
provisional-plugin-seed 79555f75c73849fc3cba2745c202bf46e1ed5fbc plugins/nacl/resources/nacl-tl-plan/SKILL.md
provisional-plugin-seed 1dcaa7d481a365baeb234c2479af866515da29b5 plugins/nacl/resources/nacl-tl-plan/scripts/wave-plan.mjs
provisional-plugin-seed 8c28faef6fcddea46e34f0a4cc0aa55c49dda142 plugins/nacl/resources/nacl-tl-qa/SKILL.md
provisional-plugin-seed 5e35e4c7b135ab335f18ed75c0e2b30330e462fa plugins/nacl/resources/nacl-tl-reconcile/SKILL.md
provisional-plugin-seed 16c46ae5670adfee1347b60bed1e2d5170cc3b25 plugins/nacl/resources/nacl-tl-regression-test/SKILL.md
provisional-plugin-seed e469b59b1044b9401eec880be2e31aca6df3c165 plugins/nacl/resources/nacl-tl-release/SKILL.md
provisional-plugin-seed 18ed90d043896c6114eb1ece3a4b7f70df2e5d49 plugins/nacl/resources/nacl-tl-reopened/SKILL.md
provisional-plugin-seed 20ed6d9422f32166c6032d7e9a04b0456525a650 plugins/nacl/resources/nacl-tl-review/SKILL.md
provisional-plugin-seed 8321eaa56367c0fcd7c4a59553980031e6837edd plugins/nacl/resources/nacl-tl-ship/SKILL.md
provisional-plugin-seed a502c6521df594ea269c98d218cd7d6b8901ad02 plugins/nacl/resources/nacl-tl-status/SKILL.md
provisional-plugin-seed bf23cde5b0266d43281d4ffc8af6cbb8eea1e2d4 plugins/nacl/resources/nacl-tl-stubs/SKILL.md
provisional-plugin-seed cd656534bf720e54dd099b912954213dacfd597d plugins/nacl/resources/nacl-tl-sync/SKILL.md
provisional-plugin-seed f6e562f62611cc0da1dd99a22a8ed7ef50db2838 plugins/nacl/resources/nacl-tl-verify-code/SKILL.md
provisional-plugin-seed 468de79d0321db49de9884396cc1b4fddfc70735 plugins/nacl/resources/nacl-tl-verify-code/scripts/classify-status.mjs
provisional-plugin-seed 131e4eb3986e9deb3a804d4e4fb7b2431680fc18 plugins/nacl/resources/nacl-tl-verify/SKILL.md
provisional-plugin-seed 5d9bee9642c8a19d28dd2bc54c60bb8ead1027b3 plugins/nacl/resources/package-index.json
provisional-plugin-seed 4cb589c3daca31412ee0964677b4d617103f0923 plugins/nacl/resources/references/graph-gateway-contract.md
provisional-plugin-seed 78b0386f2c39f567e833f9e849c9b2ab0b7e25e3 plugins/nacl/resources/references/package-boundary.md
provisional-plugin-seed 948bdd778b7a362f2aacd09a20f6f1d674653415 plugins/nacl/resources/references/routing-prompts.json
provisional-plugin-seed 8185e15ba0a1b7641c0fa4c74ecb50817a243452 plugins/nacl/resources/references/workflow-gateway-contract.md
provisional-plugin-seed 4615763936206b3852a18e554afc3723d0546ed2 plugins/nacl/resources/references/workflow-gateway-map.json
provisional-plugin-seed 56cdc8d6f5b72a1dbf7e72d836c9c7f5557f00e2 plugins/nacl/resources/references/workflow-parity-baseline.json
provisional-plugin-seed 6dfba94e5272a11211b847a65d9e4e26f5f8a762 plugins/nacl/resources/templates/agents/nacl-business-analyst.toml
provisional-plugin-seed 661369eff8d3c6612ccabb9a2a8cfccb2e142167 plugins/nacl/resources/templates/agents/nacl-developer.toml
provisional-plugin-seed 647f49aa98bbcf67e7064df623c6ca16a9799468 plugins/nacl/resources/templates/agents/nacl-system-architect.toml
provisional-plugin-seed 073462c01a97f12193be4ceaa90688286a95e2f3 plugins/nacl/resources/templates/agents/nacl-team-lead.toml
provisional-plugin-seed b50e6852f5f2f442312be5f93e2163e379ebf405 plugins/nacl/resources/templates/agents/nacl-verifier.toml
provisional-plugin-seed 2e8685d1f6e60b2f37a46ccf400e8719f2e918f4 plugins/nacl/resources/workflows/MIGRATION.md
provisional-plugin-seed bcd5bf097c3b1c2f8bfd09194363246308ecad14 plugins/nacl/resources/workflows/README.md
provisional-plugin-seed 52d691513046b126325188d25412da127a0910c1 plugins/nacl/resources/workflows/nacl-ba-analyze/SKILL.md
provisional-plugin-seed d5b98de66c66651e920fbc77b414c722808aacdf plugins/nacl/resources/workflows/nacl-ba-context/SKILL.md
provisional-plugin-seed e8b203cfe594e14fec61a9f8cf2ecfc60e2a7d33 plugins/nacl/resources/workflows/nacl-ba-entities/SKILL.md
provisional-plugin-seed fc9fbacb96d8fc63e67aa7616423923406957c33 plugins/nacl/resources/workflows/nacl-ba-from-board/SKILL.md
provisional-plugin-seed 53d03790d78c64571ebdf63e7c3f52c83c0a846e plugins/nacl/resources/workflows/nacl-ba-full/SKILL.md
provisional-plugin-seed e22b7199ad567f79703f8848aa45f90e68ec386a plugins/nacl/resources/workflows/nacl-ba-glossary/SKILL.md
provisional-plugin-seed f6c3205beb56bc53ae21918b212d8bf1c00035c0 plugins/nacl/resources/workflows/nacl-ba-handoff/SKILL.md
provisional-plugin-seed 8fa9ba68da95dbccefd3f1ab43a0cd066ab6fed4 plugins/nacl/resources/workflows/nacl-ba-import-doc/SKILL.md
provisional-plugin-seed 8732bea23dd4ad22ca85a24e3e8fb7d181491fd5 plugins/nacl/resources/workflows/nacl-ba-process/SKILL.md
provisional-plugin-seed 86e609318c2e78a4f528ba79b57b2fa0953d29f6 plugins/nacl/resources/workflows/nacl-ba-roles/SKILL.md
provisional-plugin-seed 561d4ddc389b46101b8a519610d3d6fe0e63f5b1 plugins/nacl/resources/workflows/nacl-ba-rules/SKILL.md
provisional-plugin-seed daa2572f9cc4c879b5d7f40d5b9a6d4259fe2a0f plugins/nacl/resources/workflows/nacl-ba-sync/SKILL.md
provisional-plugin-seed 49f6af569ea8553e38aaeea314d4988fd022a7cf plugins/nacl/resources/workflows/nacl-ba-validate/SKILL.md
provisional-plugin-seed 527ad2a06398cd0670ed86a555f310a5d51a0737 plugins/nacl/resources/workflows/nacl-ba-workflow/SKILL.md
provisional-plugin-seed 0d16e881044002a044dca7cd762a7a73114fe4f6 plugins/nacl/resources/workflows/nacl-core/SKILL.md
provisional-plugin-seed 4eb2f0c01d05fe1a5daaa0ae31e3f9f1a1f43de1 plugins/nacl/resources/workflows/nacl-goal/SKILL.md
provisional-plugin-seed def4297cc9991c8c47f0b4201d80bdb920e5d361 plugins/nacl/resources/workflows/nacl-init/SKILL.md
provisional-plugin-seed f70479bd7f86e1f7259325a1a80039bfed34433a plugins/nacl/resources/workflows/nacl-migrate-ba/SKILL.md
provisional-plugin-seed 7ac2cbd39fe293ed689982e8d1b04e74546678a9 plugins/nacl/resources/workflows/nacl-migrate-sa/SKILL.md
provisional-plugin-seed 3e050f034614f474ec187fa5cdfbf11091f129b1 plugins/nacl/resources/workflows/nacl-migrate/SKILL.md
provisional-plugin-seed 460828a9ed195db075a342b2c8fda1e96ae8319a plugins/nacl/resources/workflows/nacl-postmortem/SKILL.md
provisional-plugin-seed cb37113467bc8acf616037a7f9c50bfd44043cbf plugins/nacl/resources/workflows/nacl-publish/SKILL.md
provisional-plugin-seed 68854829693df282a164312e339be0c9f2cdb777 plugins/nacl/resources/workflows/nacl-render/SKILL.md
provisional-plugin-seed beac033084642ac552954f37ea6fc9c40a666304 plugins/nacl/resources/workflows/nacl-sa-architect/SKILL.md
provisional-plugin-seed 8ae0d32f19dcea568296828fadcb37a6f366f8c6 plugins/nacl/resources/workflows/nacl-sa-domain/SKILL.md
provisional-plugin-seed a5cf72d655db42875155a13eadef51906cad1d34 plugins/nacl/resources/workflows/nacl-sa-feature/SKILL.md
provisional-plugin-seed 7a398d7a54640b2aed50604c50140c4688070415 plugins/nacl/resources/workflows/nacl-sa-finalize/SKILL.md
provisional-plugin-seed aba48797aaf8016111fbeec93a29fc118685cd9e plugins/nacl/resources/workflows/nacl-sa-flags/SKILL.md
provisional-plugin-seed 5ebab7eb0e635a4ca65955597e0dc2b7a9e388ef plugins/nacl/resources/workflows/nacl-sa-full/SKILL.md
provisional-plugin-seed 2da81e3a0db7b7da92845e48a3acf1f41caba4ef plugins/nacl/resources/workflows/nacl-sa-roles/SKILL.md
provisional-plugin-seed 0196cc0e06d02aba9e828d5637da09628531001f plugins/nacl/resources/workflows/nacl-sa-uc/SKILL.md
provisional-plugin-seed 76efc1c376c025f6061e522ab4345fd1deda6b62 plugins/nacl/resources/workflows/nacl-sa-ui/SKILL.md
provisional-plugin-seed 34791a9a2151f63ea6a6283ce9257957b2bb2dbc plugins/nacl/resources/workflows/nacl-sa-validate/SKILL.md
provisional-plugin-seed 4f3e9e33c62dd1d776b528f369a83771720f8d62 plugins/nacl/resources/workflows/nacl-tl-conductor/SKILL.md
provisional-plugin-seed 3d6101a80601f78dc68cd606f3d23afd506d7052 plugins/nacl/resources/workflows/nacl-tl-core/SKILL.md
provisional-plugin-seed d5f39ed5c7f4f953ea5f2606c48837b134a1f5b3 plugins/nacl/resources/workflows/nacl-tl-core/references/changelog-format.md
provisional-plugin-seed 51533fb942e215b216b00e5045c2c22646851853 plugins/nacl/resources/workflows/nacl-tl-core/references/fix-classification-rules.md
provisional-plugin-seed ad82ba1026ce270869ac718fbc4512314918c00b plugins/nacl/resources/workflows/nacl-tl-core/references/review-checklist.md
provisional-plugin-seed 585587fa41ec76e65cd2ec343d019670206e2fda plugins/nacl/resources/workflows/nacl-tl-core/references/sa-doc-update-matrix.md
provisional-plugin-seed ed550a15164ff1c5bffbd793dfa7e55364bdc90b plugins/nacl/resources/workflows/nacl-tl-core/references/stub-tracking-rules.md
provisional-plugin-seed 3b1e78d262218dd339fa56c91d8ba7eb3aad7728 plugins/nacl/resources/workflows/nacl-tl-core/references/tdd-workflow.md
provisional-plugin-seed 72efa2817f01f693281156c27bc3795d5ee42806 plugins/nacl/resources/workflows/nacl-tl-core/references/tl-codex-contract.md
provisional-plugin-seed c2fb3f07bfc4a3b6b29836aafd1f6e80cb895855 plugins/nacl/resources/workflows/nacl-tl-core/templates/config-yaml-template.yaml
provisional-plugin-seed 124900103d9d403c4dff908fcc78c642deced2a4 plugins/nacl/resources/workflows/nacl-tl-deliver/SKILL.md
provisional-plugin-seed b97bc7763df7790210f03b717b80c4c28d29b3a1 plugins/nacl/resources/workflows/nacl-tl-deploy/SKILL.md
provisional-plugin-seed c092e1e444817f5eb3539cc24ac59f353555fcdd plugins/nacl/resources/workflows/nacl-tl-dev-be/SKILL.md
provisional-plugin-seed 818b37babae59b75c587561c4fe3058159314061 plugins/nacl/resources/workflows/nacl-tl-dev-fe/SKILL.md
provisional-plugin-seed f67b646427de6440289d68360557538e48745567 plugins/nacl/resources/workflows/nacl-tl-dev/SKILL.md
provisional-plugin-seed eb3fc31a23ad1102269af2af9d532bcfc1702315 plugins/nacl/resources/workflows/nacl-tl-diagnose/SKILL.md
provisional-plugin-seed bf19233b78624a426fe1cc0cd3fb633b126d47bc plugins/nacl/resources/workflows/nacl-tl-docs/SKILL.md
provisional-plugin-seed 59802c6ab5436498661db29995166545871cb540 plugins/nacl/resources/workflows/nacl-tl-fix/SKILL.md
provisional-plugin-seed d368fdba6ded4e0e9f6fef4791507b76896f58b8 plugins/nacl/resources/workflows/nacl-tl-full/SKILL.md
provisional-plugin-seed f3809a27f45bc8899a7049992e27e6c1bdcbef3c plugins/nacl/resources/workflows/nacl-tl-hotfix/SKILL.md
provisional-plugin-seed 33d8662c7cb58d58db6d7d3ca5c5a0dc81f47e91 plugins/nacl/resources/workflows/nacl-tl-intake/SKILL.md
provisional-plugin-seed 88f63ef798b73600e7fe01b30308fe2326f2b45a plugins/nacl/resources/workflows/nacl-tl-next/SKILL.md
provisional-plugin-seed 424f0bfdd6cf00b195a7f2eb485793908770af2e plugins/nacl/resources/workflows/nacl-tl-plan/SKILL.md
provisional-plugin-seed 9625519516a511eae7da2b07bd9af80dbd41b96e plugins/nacl/resources/workflows/nacl-tl-qa/SKILL.md
provisional-plugin-seed b3009469251c569158fa97c3b0f8ba91edce346f plugins/nacl/resources/workflows/nacl-tl-reconcile/SKILL.md
provisional-plugin-seed 21932db2e6154a901cc07b81d8897bc59bdcab8b plugins/nacl/resources/workflows/nacl-tl-regression-test/SKILL.md
provisional-plugin-seed b1f7167d8c5762a9ea48c0d32fcad170e05afd67 plugins/nacl/resources/workflows/nacl-tl-release/SKILL.md
provisional-plugin-seed c7fad629009a87568d4dd297174e1ca1f6acf538 plugins/nacl/resources/workflows/nacl-tl-reopened/SKILL.md
provisional-plugin-seed d567f40e3d3f29047dca331b5c4970d541fb555c plugins/nacl/resources/workflows/nacl-tl-review/SKILL.md
provisional-plugin-seed 3fd191f906fc0b62b0b5181f3e63c0036e34bc1c plugins/nacl/resources/workflows/nacl-tl-ship/SKILL.md
provisional-plugin-seed c9fc3df8ed2fee340c41abd4e6c21845aa5e4fdd plugins/nacl/resources/workflows/nacl-tl-status/SKILL.md
provisional-plugin-seed c0ec8dc53626489e1b4bd9cf59385389ee4ebed5 plugins/nacl/resources/workflows/nacl-tl-stubs/SKILL.md
provisional-plugin-seed 9bf14e0fc9b2f9558c25ccf351b6aea332eca0f7 plugins/nacl/resources/workflows/nacl-tl-sync/SKILL.md
provisional-plugin-seed b938f1910939fc029c5aac742a4bc31df7222705 plugins/nacl/resources/workflows/nacl-tl-verify-code/SKILL.md
provisional-plugin-seed 25102b7f36057587c9f283de8dc7ac74deae8ef9 plugins/nacl/resources/workflows/nacl-tl-verify/SKILL.md
provisional-plugin-seed 6373d255c9cd13c20580360a2b1fd363e6bb9e33 plugins/nacl/resources/workflows/references/ba-codex-contract.md
provisional-plugin-seed 7b42b0f2bf7d855516fe5c2c16e69b4d6f8288b5 plugins/nacl/resources/workflows/references/goal-codex-contract.md
provisional-plugin-seed 9d3674869de05c5de72f17da0d7bd5c47d25545a plugins/nacl/resources/workflows/references/migration-rules.md
provisional-plugin-seed 4ab91261175ebce3352629733acd2da8a5571366 plugins/nacl/resources/workflows/references/orchestration-model.md
provisional-plugin-seed cf29d9062f98133b9b53097f3bf6e03007b9bc4a plugins/nacl/resources/workflows/references/verification-evidence.md
provisional-plugin-seed 0a45182a1e8a6463b90f7d73f52fb85f19899337 plugins/nacl/resources/workflows/references/verification-vocabulary.md
provisional-plugin-seed 404fbe01dbee6ed0209ae9b1b3bd78c8f21e21d4 plugins/nacl/runtime/graph-cli/README.md
provisional-plugin-seed 5ec80c8ee5a2804941563be9e5b9eb14e842d548 plugins/nacl/runtime/graph-cli/backup-contract.mjs
provisional-plugin-seed 727764b372b304d3e92a6541a7baf0af1858faf8 plugins/nacl/runtime/graph-cli/cli.mjs
provisional-plugin-seed 1ca16acd6a4b576faaaf4ed7190acb7f407c889b plugins/nacl/runtime/graph-cli/contracts.mjs
provisional-plugin-seed 5a9a5ed6527fbce66999568446460785302876b5 plugins/nacl/runtime/graph-cli/graph-probe.mjs
provisional-plugin-seed 145379a2551f491c8d46f5bc22c73d60aa881c66 plugins/nacl/runtime/graph-cli/instance-store.mjs
provisional-plugin-seed 2750559edd6ffc94674339059bbe29274723351b plugins/nacl/runtime/graph-cli/lifecycle.mjs
provisional-plugin-seed befe883d0231651e7b780882dcc75c1e80d22cdd plugins/nacl/runtime/graph-cli/ports.mjs
provisional-plugin-seed d435f219236c5df7c356e45b19f572314a92957e plugins/nacl/runtime/graph-cli/process-runner.mjs
provisional-plugin-seed 0df8e49ed4a2da740fa14edc6c7deb1faa942439 plugins/nacl/runtime/graph-cli/project-registry.mjs
provisional-plugin-seed 3ef11f1d2fcb480c46b1782032839a5704dc8525 plugins/nacl/runtime/graph-cli/redaction.mjs
provisional-plugin-seed 30b1b4a317a3d5a510d6ea170e1d5a375c99b645 plugins/nacl/runtime/graph-cli/secret-provider.mjs
provisional-plugin-seed c6804a815c8d84f1d6d2a29971a02d9479e77044 plugins/nacl/runtime/graph-cli/verification-snapshot.mjs
provisional-plugin-seed 6b5c191afb928d815e0e555322144317614acf23 plugins/nacl/runtime/graph-gateway/audit.mjs
provisional-plugin-seed 882089fec002baedfdcfa92c81faa456aeaacb67 plugins/nacl/runtime/graph-gateway/authorization.mjs
provisional-plugin-seed ab34aeaaa4adcaad329a9813bbd512c7337f5d13 plugins/nacl/runtime/graph-gateway/catalog.mjs
provisional-plugin-seed b161064d78bc0db54a0d56079fe43137099e8940 plugins/nacl/runtime/graph-gateway/concurrency-cypher.mjs
provisional-plugin-seed f7220cbe7a2d02a47522b0477fded31994d2b170 plugins/nacl/runtime/graph-gateway/concurrency-engine.mjs
provisional-plugin-seed ab26800014265e9897f7a63a469760af56c6a1f9 plugins/nacl/runtime/graph-gateway/concurrency.mjs
provisional-plugin-seed 28de1cd67bc8002d9a0a5db873fa658c82c03615 plugins/nacl/runtime/graph-gateway/errors.mjs
provisional-plugin-seed 6ebb3321a59f02a6eb42ef8ea67e6cd8adb1f9c2 plugins/nacl/runtime/graph-gateway/gateway.mjs
provisional-plugin-seed 1a365ed92df8f45845bf37598e08a6ea8c21ab24 plugins/nacl/runtime/graph-gateway/identity.mjs
provisional-plugin-seed e7398b4f90872af03cb42bb5fb3aaead7220bca9 plugins/nacl/runtime/graph-gateway/lifecycle-adapter.mjs
provisional-plugin-seed 635fadfb5b5f8d214850c6ce0d1dbba94b900dcd plugins/nacl/runtime/graph-gateway/migrations.mjs
provisional-plugin-seed 238ee94e9b5ca6fa1f5fc43ce398b50d9237bc4b plugins/nacl/runtime/graph-gateway/neo4j-http.mjs
provisional-plugin-seed 9f4bc1e8dc407886491541dd91bd92d3e0498a57 plugins/nacl/runtime/graph-gateway/principal.mjs
provisional-plugin-seed eeb970149db1c4d890fe6fb6cf1391329f10d25f plugins/nacl/runtime/graph-gateway/project-tools.mjs
provisional-plugin-seed e34df83629dc7dcdc7d30500c3933d6b4e7ea5a6 plugins/nacl/runtime/graph-gateway/project-transport-pool.mjs
provisional-plugin-seed e15ce0368f1886ed8b22368e155d009371c29375 plugins/nacl/runtime/graph-gateway/provenance.mjs
provisional-plugin-seed 093c428a43629b6aac2795116bfcd158fc9a88c0 plugins/nacl/runtime/graph-gateway/rbac-cypher.mjs
provisional-plugin-seed 8c31b3e7fe02c4bef9d8365681c8270364846823 plugins/nacl/runtime/graph-gateway/secret-provider.mjs
provisional-plugin-seed 96bf908986e80835688728ff63f7f55e52441f51 plugins/nacl/runtime/graph-gateway/tool-schemas.mjs
provisional-plugin-seed 3e7244a95a6430022c83cacb9f2224a1cb4bd125 plugins/nacl/runtime/graph-gateway/validation.mjs
provisional-plugin-seed 25f1b6afc2fef3b4a9febc92832513805b72acd8 plugins/nacl/runtime/workflow-cli/README.md
provisional-plugin-seed 8a4942b9af13eef93fc427948571bfd86a4c5b9a plugins/nacl/runtime/workflow-cli/agent-profiles.mjs
provisional-plugin-seed f1a92678b0634a5fdee376998dcd4d30dbc69209 plugins/nacl/runtime/workflow-cli/cli.mjs
provisional-plugin-seed d347722d886ab8e11ae5ae35c8e9f0143f2ae61f plugins/nacl/runtime/workflow-cli/legacy-symlinks.mjs
provisional-plugin-seed f7c57c882873d4cc67bc19f0f142e908088f64ba plugins/nacl/runtime/workflow-cli/release-policy.mjs
provisional-plugin-seed 58d411dc4f2cf23498e2fd1aea04367b76955f1b plugins/nacl/runtime/workflow-cli/workflow-tools.mjs
provisional-plugin-seed 32ca2745bdce88009d6c7424b920702f542d706b plugins/nacl/scripts/installation-doctor-lib.mjs
provisional-plugin-seed 17fe4db124dc81da3aed524ccf2fac6ff1b2e604 plugins/nacl/scripts/nacl-installation-doctor.mjs
provisional-plugin-seed 44b1948c23cd4637ee9350e0216cdb1185769d60 plugins/nacl/scripts/nacl-package-mcp.mjs
provisional-plugin-seed 1b865c90df70c571524b070794bfc2de60c18e4b plugins/nacl/skills/nacl-ba/SKILL.md
provisional-plugin-seed aacc6ff99d715a1768febf23964c834bea8d0037 plugins/nacl/skills/nacl-diagnose/SKILL.md
provisional-plugin-seed 88e06accc263002883e9c0ec3643d6fd78c67e7d plugins/nacl/skills/nacl-fix/SKILL.md
provisional-plugin-seed 1eb93dd641393b4c45536791086c7c33d5be891d plugins/nacl/skills/nacl-goal/SKILL.md
provisional-plugin-seed daa670e020c8d592b493395558425809cc9fe883 plugins/nacl/skills/nacl-init/SKILL.md
provisional-plugin-seed 82f1de39a682f30257e05185643adf17d9e3c02b plugins/nacl/skills/nacl-migrate/SKILL.md
provisional-plugin-seed 5433042cf916e5f54d7eefb209c3ca7c0b1bd9a6 plugins/nacl/skills/nacl-publish/SKILL.md
provisional-plugin-seed cf15e6885b37f7c25ccdecf70260d450e2d71dd6 plugins/nacl/skills/nacl-sa/SKILL.md
provisional-plugin-seed b535656e84c061a7d87c3bee3263c8c969b60f7b plugins/nacl/skills/nacl-tl/SKILL.md
provisional-plugin-seed cec2f23f055f060fb8866454ec6e5ee87f3ca28a plugins/nacl/skills/nacl-verify/SKILL.md
support-tests-scripts e62b524ec86d8e2232c737952f89da506c284da5 scripts/check-plugin-closure.mjs
support-tests-scripts 082f6db50d6fbd6304ae4784179027927f8032ab scripts/check-plugin-docs.mjs
support-tests-scripts a0829ae02a2d0d0f35c8b88194d4f99f81faf0ca scripts/codex-plugin-ci.sh
support-tests-scripts 19b6b0e02e7e7fbd4c3cb225d0728bca0eb30778 scripts/codex-plugin-wave1-matrix.mjs
support-tests-scripts 1accd21075351f7c3afa9063f7e681146e1c92c4 scripts/codex-plugin-wave1-report.mjs
support-tests-scripts 5c92cce2e24d378e8494b8273dbb0bf391608350 scripts/codex-plugin-wave2-cli-e2e.mjs
support-tests-scripts 7cc00093c801a9b0ee243b8eb46f2eccbca4bf26 scripts/codex-plugin-wave7-candidate.mjs
support-tests-scripts b627cc656413544999edb6c2168ade7a60ebca71 scripts/validate-codex-plugin.sh
support-tests-scripts 1a570babaa3b2e25451af18069cbc8042b6a64e3 scripts/validate-codex-skills.py
support-tests-scripts e398451b2b50b45a1c9d6a5085481bf5bcbd558c tests/codex-plugin/README.md
support-tests-scripts 2a7301719c1b423dd38c77cfc21811648316ed16 tests/codex-plugin/claude-frozen-base.txt
support-tests-scripts fdacd752145570ce116aa10d6fd8bf5b25da0fe1 tests/codex-plugin/requirements-validator.txt
support-tests-scripts 7f0fa267f855472d9eef45d7de5ff454754ddb2e tests/codex-plugin/scripts/check-claude-runtime-unchanged.test.sh
support-tests-scripts 76917db42c152939f73eefaa4b42925bc43e793e tests/codex-plugin/scripts/codex-plugin-wave1-report.test.mjs
support-tests-scripts 7c04524954155150e97ac6639a2c3e5221eb161e tests/codex-plugin/scripts/legacy-installer-isolated.test.sh
support-tests-scripts ec6160e87ed6bfee92cf862db24dd64d2a9a0b71 tests/codex-plugin/scripts/nacl-agent-profiles.test.mjs
support-tests-scripts 7e24904c1bf9f92d1b24853d7170fb123306e0fa tests/codex-plugin/scripts/nacl-authorization.test.mjs
support-tests-scripts 110ccb93048c3f6f506518d596540c07b7fed1b3 tests/codex-plugin/scripts/nacl-concurrency-docker-e2e.test.mjs
support-tests-scripts 387d8db0764e2006dc5b91d624dbc9772febe3d5 tests/codex-plugin/scripts/nacl-concurrency-model.test.mjs
support-tests-scripts a606a44a9ebb5df9a571b5d8fc2dc8e459d8aeda tests/codex-plugin/scripts/nacl-graph-cli-process-harness.mjs
support-tests-scripts fb5ec878af8dae998b8fed2f4888a4674fe23778 tests/codex-plugin/scripts/nacl-graph-gateway-docker-e2e.test.mjs
support-tests-scripts bb9322428e3c3d2b872e472664479843703b7220 tests/codex-plugin/scripts/nacl-graph-gateway.test.mjs
support-tests-scripts 3b6f1b3d69fd2222ff5f899d632ea34b4b9183c3 tests/codex-plugin/scripts/nacl-legacy-symlinks.test.mjs
support-tests-scripts bf905e3f828a7ea70adfedceafdff01a373e68a4 tests/codex-plugin/scripts/nacl-local-graph-lifecycle-docker-smoke.test.mjs
support-tests-scripts 02756c21041ae763a60bb3e09ae49e25ff0c7dd4 tests/codex-plugin/scripts/nacl-local-graph-lifecycle.test.mjs
support-tests-scripts 2749d604dc08d84aed0a3c9e908480bfa8ead3af tests/codex-plugin/scripts/nacl-multi-project-docker-e2e.test.mjs
support-tests-scripts a3ae89c7ec82b3c27a2fee63dd23ed9c65d7e9e1 tests/codex-plugin/scripts/nacl-multi-project.test.mjs
support-tests-scripts 34dcc15bcd7c6c1a388e991bedf228e28822d54f tests/codex-plugin/scripts/nacl-package-contract.test.mjs
support-tests-scripts 7c786b826d97ff4dd03eb330119dd5ce437c7031 tests/codex-plugin/scripts/nacl-package-server.test.mjs
support-tests-scripts 2b44fe0662b094e9f2c357db0057a0ec450f6b9e tests/codex-plugin/scripts/nacl-project-routing.test.mjs
support-tests-scripts c2ffa75b7cfb83e7a55f7f7edb068aea7e76cfdd tests/codex-plugin/scripts/nacl-workflow-integration.test.mjs
support-tests-scripts 57675415179fb4f41ab295e9d9ec0042b89216f8 tests/codex-plugin/scripts/neo4j-image-fixture.mjs
support-tests-scripts 2d7129e502c0cae819df9340d8477abf14d969dc tests/codex-plugin/scripts/neo4j-image-fixture.test.mjs
support-tests-scripts 420e60d0ef4379baded8ea1b8cb1dca412931d6b tests/codex-plugin/scripts/plugin-docs.test.mjs
support-tests-scripts c1d35786815a86079cdccae36b90263a0d10c755 tests/codex-plugin/scripts/validate-codex-plugin.test.sh
support-tests-scripts 259301317075dfaa59bed67dd8ecbab7f6028aec tests/codex-plugin/scripts/validate-codex-skills.test.mjs
support-tests-scripts 4606e72e042564097e8780d66c1d4dcb611869bd tests/codex-plugin/vendor/openai-codex/4aa950d456c6c90174d3269d7eaab4a2823e5889/LICENSE
support-tests-scripts 2805899d56d0332d175cfc613c67d45d6f006db7 tests/codex-plugin/vendor/openai-codex/4aa950d456c6c90174d3269d7eaab4a2823e5889/NOTICE
support-tests-scripts 6f19f4fa5874bc166b7d9b8831a1292526cc319f tests/codex-plugin/vendor/openai-codex/4aa950d456c6c90174d3269d7eaab4a2823e5889/PROVENANCE.md
support-tests-scripts 0547b4041a5f58fa19892079a114a1df98286406 tests/codex-plugin/vendor/openai-codex/4aa950d456c6c90174d3269d7eaab4a2823e5889/quick_validate.py
support-tests-scripts 4606e72e042564097e8780d66c1d4dcb611869bd tests/codex-plugin/vendor/openai-codex/plugin-validator-ebda00d5/LICENSE
support-tests-scripts 2805899d56d0332d175cfc613c67d45d6f006db7 tests/codex-plugin/vendor/openai-codex/plugin-validator-ebda00d5/NOTICE
support-tests-scripts ee1721d82e3a86842f71fb4b34f25b27f3d4db8a tests/codex-plugin/vendor/openai-codex/plugin-validator-ebda00d5/PROVENANCE.md
support-tests-scripts 88fae0fd00998ea32fa2393869042f0231a2b43b tests/codex-plugin/vendor/openai-codex/plugin-validator-ebda00d5/validate_plugin.py
~~~
