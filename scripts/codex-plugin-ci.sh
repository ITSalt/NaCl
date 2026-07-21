#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

case ${1:-} in
  test:contracts)
    # Codex owns this closed test inventory. Generic repository tests are owned
    # by test-tools.yml; generated Claude-package tests are owned by
    # build-plugin.yml and must never enter this suite through a broad glob.
    node_tests=(
      scripts/build-codex-plugin.test.mjs
      tests/codex-plugin/scripts/ci-ownership.test.mjs
      tests/codex-plugin/scripts/codex-plugin-wave1-report.test.mjs
      tests/codex-plugin/scripts/codex-source-drift.test.mjs
      tests/codex-plugin/scripts/nacl-agent-profiles.test.mjs
      tests/codex-plugin/scripts/nacl-authorization.test.mjs
      tests/codex-plugin/scripts/nacl-concurrency-docker-e2e.test.mjs
      tests/codex-plugin/scripts/nacl-concurrency-model.test.mjs
      tests/codex-plugin/scripts/nacl-graph-gateway-docker-e2e.test.mjs
      tests/codex-plugin/scripts/nacl-graph-gateway.test.mjs
      tests/codex-plugin/scripts/nacl-interface-metadata.test.mjs
      tests/codex-plugin/scripts/nacl-legacy-symlinks.test.mjs
      tests/codex-plugin/scripts/nacl-local-graph-lifecycle-docker-smoke.test.mjs
      tests/codex-plugin/scripts/nacl-local-graph-lifecycle.test.mjs
      tests/codex-plugin/scripts/nacl-multi-project-docker-e2e.test.mjs
      tests/codex-plugin/scripts/nacl-multi-project.test.mjs
      tests/codex-plugin/scripts/nacl-package-contract.test.mjs
      tests/codex-plugin/scripts/nacl-package-server.test.mjs
      tests/codex-plugin/scripts/nacl-project-routing.test.mjs
      tests/codex-plugin/scripts/nacl-project-bootstrap.test.mjs
      tests/codex-plugin/scripts/nacl-production-binding.test.mjs
      tests/codex-plugin/scripts/nacl-public-mcp-bundle.test.mjs
      tests/codex-plugin/scripts/nacl-reviewer-fixtures.test.mjs
      tests/codex-plugin/scripts/nacl-server-access-source.test.mjs
      tests/codex-plugin/scripts/nacl-server-operation-authorization-source.test.mjs
      tests/codex-plugin/scripts/nacl-skills-only-bundle.test.mjs
      tests/codex-plugin/scripts/nacl-skills-only-bootstrap-docker-e2e.test.mjs
      tests/codex-plugin/scripts/nacl-skills-only-windows.test.mjs
      tests/codex-plugin/scripts/nacl-submission-readiness.test.mjs
      tests/codex-plugin/scripts/nacl-vps-provision-r2.test.mjs
      tests/codex-plugin/scripts/nacl-vps-server-access-source.test.mjs
      tests/codex-plugin/scripts/nacl-workflow-integration.test.mjs
      tests/codex-plugin/scripts/neo4j-image-fixture.test.mjs
      tests/codex-plugin/scripts/plugin-docs.test.mjs
      tests/codex-plugin/scripts/validate-codex-skills.test.mjs
    )
    node --test "${node_tests[@]}"

    shell_tests=(
      tests/codex-plugin/scripts/check-claude-runtime-unchanged.test.sh
      tests/codex-plugin/scripts/legacy-installer-isolated.test.sh
      tests/codex-plugin/scripts/validate-codex-plugin.test.sh
    )
    failed=0
    for test_file in "${shell_tests[@]}"; do
      bash "$test_file" || failed=1
    done

    shell_sources=(
      scripts/check-claude-runtime-unchanged.sh
      scripts/codex-plugin-ci.sh
      scripts/validate-codex-plugin.sh
      tests/codex-plugin/scripts/check-claude-runtime-unchanged.test.sh
      tests/codex-plugin/scripts/legacy-installer-isolated.test.sh
      tests/codex-plugin/scripts/validate-codex-plugin.test.sh
    )
    for shell_file in "${shell_sources[@]}"; do
      bash -n "$shell_file" || { echo "SYNTAX FAIL: $shell_file"; failed=1; }
    done
    exit "$failed"
    ;;
  test:codex-skills)
    exec python3 scripts/validate-codex-skills.py --root skills-for-codex
    ;;
  test:claude-isolation)
    exec bash scripts/check-claude-runtime-unchanged.sh "${@:2}"
    ;;
  test:plugin-manifest)
    exec bash scripts/validate-codex-plugin.sh
    ;;
  test:plugin-spike|test:plugin-package)
    python3 scripts/validate-codex-skills.py \
      --root plugins/nacl/skills \
      --expected-count 10
    exec node --test \
      tests/codex-plugin/scripts/codex-plugin-wave1-report.test.mjs \
      tests/codex-plugin/scripts/nacl-graph-gateway.test.mjs \
      tests/codex-plugin/scripts/nacl-legacy-symlinks.test.mjs \
      tests/codex-plugin/scripts/nacl-package-contract.test.mjs \
      tests/codex-plugin/scripts/nacl-package-server.test.mjs
    ;;
  test:plugin-closure)
    exec node scripts/check-plugin-closure.mjs
    ;;
  test:plugin-docs)
    exec node scripts/check-plugin-docs.mjs
    ;;
  test:cli-legacy)
    exec bash tests/codex-plugin/scripts/legacy-installer-isolated.test.sh
    ;;
  test:cli-plugin)
    exec node scripts/codex-plugin-wave2-cli-e2e.mjs "${@:2}"
    ;;
  test:graph-unit)
    exec node --test \
      tests/codex-plugin/scripts/neo4j-image-fixture.test.mjs \
      tests/codex-plugin/scripts/nacl-authorization.test.mjs \
      tests/codex-plugin/scripts/nacl-concurrency-model.test.mjs \
      tests/codex-plugin/scripts/nacl-graph-gateway.test.mjs \
      tests/codex-plugin/scripts/nacl-local-graph-lifecycle.test.mjs \
      tests/codex-plugin/scripts/nacl-project-routing.test.mjs \
      tests/codex-plugin/scripts/nacl-multi-project.test.mjs
    ;;
  test:workflow-integration)
    exec node --test \
      tests/codex-plugin/scripts/nacl-agent-profiles.test.mjs \
      tests/codex-plugin/scripts/nacl-legacy-symlinks.test.mjs \
      tests/codex-plugin/scripts/nacl-workflow-integration.test.mjs
    ;;
  test:graph-local-e2e)
    if [ "${NACL_RUN_DOCKER_SMOKE:-}" != "1" ]; then
      echo "Status: BLOCKED"
      echo "Reason: set NACL_RUN_DOCKER_SMOKE=1 to authorize disposable local Docker resources"
      exit 2
    fi
    node --test tests/codex-plugin/scripts/nacl-local-graph-lifecycle-docker-smoke.test.mjs
    exec node --test tests/codex-plugin/scripts/nacl-graph-gateway-docker-e2e.test.mjs
    ;;
  test:multi-project)
    node --test \
      tests/codex-plugin/scripts/nacl-project-routing.test.mjs \
      tests/codex-plugin/scripts/nacl-multi-project.test.mjs
    if [ "${NACL_RUN_DOCKER_SMOKE:-}" != "1" ]; then
      echo "Status: BLOCKED"
      echo "Reason: set NACL_RUN_DOCKER_SMOKE=1 to authorize disposable two-project Docker resources"
      exit 2
    fi
    exec node --test tests/codex-plugin/scripts/nacl-multi-project-docker-e2e.test.mjs
    ;;
  test:multi-user)
    node --test \
      tests/codex-plugin/scripts/nacl-authorization.test.mjs \
      tests/codex-plugin/scripts/nacl-concurrency-model.test.mjs
    if [ "${NACL_RUN_DOCKER_SMOKE:-}" != "1" ]; then
      echo "Status: BLOCKED"
      echo "Reason: set NACL_RUN_DOCKER_SMOKE=1 to authorize disposable multi-user Docker resources"
      exit 2
    fi
    exec node --test tests/codex-plugin/scripts/nacl-concurrency-docker-e2e.test.mjs
    ;;
  test:candidate)
    exec node scripts/codex-plugin-wave7-candidate.mjs "${@:2}"
    ;;
  test:production-mcp)
    npm ci --ignore-scripts --prefix services/nacl-mcp
    npm --prefix services/nacl-mcp test
    npm --prefix services/nacl-mcp run build
    npm --prefix services/nacl-mcp run check
    npm --prefix services/nacl-mcp audit --omit=dev
    npm --prefix services/nacl-mcp run sbom
    npm --prefix services/nacl-mcp run sbom:check
    node -e 'const fs=require("fs"),p=require("path"),c=require("crypto"); const root="services/nacl-mcp/dist/sbom"; const m=JSON.parse(fs.readFileSync(p.join(root,"sbom-manifest.json"))); if(!Array.isArray(m.artifacts)||m.artifacts.length!==2||!Array.isArray(m.notRun))process.exit(1); for(const a of m.artifacts){const b=fs.readFileSync(p.join(root,a.path)); if(c.createHash("sha256").update(b).digest("hex")!==a.sha256)process.exit(1); const d=JSON.parse(b); if(d.bomFormat!=="CycloneDX"||!Array.isArray(d.components)||d.components.length===0)process.exit(1)}'
    node --test \
      tests/codex-plugin/scripts/nacl-production-binding.test.mjs \
      tests/codex-plugin/scripts/nacl-public-mcp-bundle.test.mjs
    ;;
  test:production-mcp-docker)
    if [ "${NACL_RUN_DOCKER_SMOKE:-}" != "1" ]; then
      echo "Status: BLOCKED"
      echo "Reason: set NACL_RUN_DOCKER_SMOKE=1 to authorize disposable three-project public MCP Docker resources"
      exit 2
    fi
    exec node --test --test-name-pattern='public OAuth boundary reaches two isolated project containers' \
      services/nacl-mcp/test/topology-docker-e2e.test.mjs
    ;;
  test:production-mcp-container)
    if [ "${NACL_RUN_DOCKER_SMOKE:-}" != "1" ]; then
      echo "Status: BLOCKED"
      echo "Reason: set NACL_RUN_DOCKER_SMOKE=1 to authorize a disposable rootless public MCP container"
      exit 2
    fi
    exec npm --prefix services/nacl-mcp run container:smoke
    ;;
  *)
    echo "Status: BLOCKED"
    echo "Reason: unknown Codex plugin CI entry point: ${1:-<missing>}"
    echo "Available: test:contracts, test:codex-skills, test:claude-isolation, test:plugin-manifest, test:plugin-spike, test:plugin-package, test:plugin-closure, test:plugin-docs, test:cli-legacy, test:cli-plugin, test:graph-unit, test:workflow-integration, test:graph-local-e2e, test:multi-project, test:multi-user, test:candidate, test:production-mcp, test:production-mcp-docker, test:production-mcp-container"
    exit 2
    ;;
esac
