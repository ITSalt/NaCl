# Terms of Use — NaCl

Effective date: 2026-07-20

These terms describe the use of the NaCl open-source software and its
documentation. NaCl is local software, not a hosted or managed service.

## Open-source license

NaCl is licensed under the [MIT License](LICENSE). The MIT License governs the
rights to use, copy, modify, merge, publish, distribute, sublicense, and sell
copies of the software. Nothing in these terms reduces or replaces the rights
granted by that license.

Contributions and third-party components may also be subject to their stated
licenses. Users are responsible for reviewing the notices and licenses that
apply to the version they install or redistribute.

## No managed service or account

The repository maintainers do not provide a NaCl cloud backend, managed Neo4j
database, hosted MCP endpoint, user account, data storage service, service-level
agreement, or infrastructure support commitment. The Codex Skills-only and
Claude Code distributions execute through the selected host and on
infrastructure controlled or selected by the user.

## User responsibilities

Users are responsible for:

- selecting, configuring, securing, updating, backing up, and paying for their
  local machine, Docker environment, VPS, Neo4j server, network, and storage;
- controlling access to project data, credentials, logs, backups, and generated
  MCP configuration;
- reviewing plans and confirmations before allowing a skill or script to make
  changes;
- verifying generated analysis, specifications, code, migrations, and release
  actions before relying on them; and
- complying with applicable law, organizational policy, third-party rights,
  and the terms of services they choose to use.

Operational and safety guidance accompanying NaCl is informational. It does
not modify, condition, or add restrictions to the rights granted by the MIT
License.

## Third-party products and services

NaCl can operate through or connect to independently provided products and
services, including OpenAI/ChatGPT/Codex, Anthropic/Claude Code, Neo4j, Docker,
GitHub, and optional integrations configured by the user. Those providers are
not controlled by the NaCl maintainers. Their availability, pricing, security,
data handling, licenses, and terms are governed by their own agreements.

The user is responsible for obtaining the accounts, permissions, licenses, and
infrastructure access required for those products and services. A change or
outage in a third-party product may limit or stop a NaCl workflow.

## Privacy and security

The [Privacy Policy](PRIVACY.md) explains the data flow and the absence of a
maintainer-operated analytics or project-data backend. The
[Security Policy](SECURITY.md) explains responsible vulnerability reporting
and secret-handling requirements.

Users should not submit credentials, confidential project data, or private logs
to public repository channels.

## No warranty and limitation of liability

NaCl is provided under the MIT License **as is**, without warranty of any kind,
express or implied, including warranties of merchantability, fitness for a
particular purpose, and non-infringement.

To the extent permitted by applicable law, the authors and copyright holders
are not liable for any claim, damages, or other liability arising from or in
connection with the software or its use. The complete controlling warranty and
liability text is in the [MIT License](LICENSE).

## Changes and contact

These terms may change with a future release. Changes are published in this
repository with an updated effective date and do not alter the license terms
for copies already received under the MIT License.

Questions about these terms may be submitted through
[GitHub Issues](https://github.com/ITSalt/NaCl/issues). Do not include security
vulnerabilities, credentials, or confidential information in a public issue;
use [GitHub Security Advisories](https://github.com/ITSalt/NaCl/security/advisories/new)
for vulnerability reports.
