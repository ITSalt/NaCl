# Security Policy

## Reporting Vulnerabilities

Please report security vulnerabilities through [GitHub Security Advisories](https://github.com/ITSalt/NaCl/security/advisories/new).

Do **not** open public issues for security vulnerabilities.

## Security Guidelines for Skills

- **Never** include credentials, API keys, or passwords in SKILL.md files
- All secrets must use environment variables (`.env` files, MCP server env config)
- The default Neo4j password in `.env.example` (`neo4j_graph_dev`) is for local development only — change it for any shared or production deployment
- SKILL.md files are public prompts — treat them as public code

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
