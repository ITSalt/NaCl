#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

case ${1:-} in
  test:contracts)
    node_tests=$(git ls-files '*/scripts/*.test.mjs')
    if [ -n "$node_tests" ]; then
      # paths in this repository contain no spaces; intentional word split
      # shellcheck disable=SC2086
      node --test $node_tests
    fi
    failed=0
    for test_file in $(git ls-files 'scripts/*.test.sh' '*/scripts/*.test.sh'); do
      bash "$test_file" || failed=1
    done
    for shell_file in $(git ls-files 'scripts/*.sh' '*/scripts/*.sh'); do
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
  *)
    echo "Status: BLOCKED"
    echo "Reason: unknown Codex plugin CI entry point: ${1:-<missing>}"
    echo "Available: test:contracts, test:codex-skills, test:claude-isolation, test:plugin-manifest, test:plugin-spike, test:plugin-package, test:plugin-closure, test:plugin-docs, test:cli-legacy, test:cli-plugin, test:graph-unit, test:workflow-integration, test:graph-local-e2e, test:multi-project, test:multi-user, test:candidate"
    exit 2
    ;;
esac
