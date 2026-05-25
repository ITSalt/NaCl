NaCl 2.10.2 — codex-sync-2.10.0

Codex-скиллы синхронизированы с протоколом `/goal` из 2.10.0.

Что вошло:

— Новый `skills-for-codex/nacl-goal` для Codex-compatible preview, alias resolution, GOAL_PROOF checks и structured refusals.
— Общий reference `goal-codex-contract.md`, который честно фиксирует runtime boundary: Codex может подготовить и проверить goal-compatible команды, но не должен утверждать, что Anthropic `/goal` был запущен, если runtime этого не предоставляет и нет evidence.
— Десять Codex-скиллов теперь явно указывают goal-compatible путь или boundary из-за обязательного human gate.
— В Codex package теперь 59 installable skills.
— Новый root/Codex sync guard запускается локально и в GitHub Actions: будущие изменения root SKILL.md требуют Codex update или явный exemption.

Обновление:

sh skills-for-codex/scripts/install-user-symlinks.sh

Windows:

skills-for-codex/scripts/install-user-symlinks.ps1

Этот релиз не включает autonomous execution из 2.10.1. Он выравнивает Codex package с протоколом 2.10.0 и добавляет drift guard.
