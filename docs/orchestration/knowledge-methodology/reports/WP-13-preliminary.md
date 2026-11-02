# WP-13: предварительное исследование dev → QA → release

[QA screenshots и evidence](WP-13-qa-screenshot-evidence.md) — границы путей и retention по исходникам.

[Актуальность QA scenario](WP-13-qa-scenario-freshness.md) — source-level граница reuse и mapping, без наблюдавшегося false PASS.

[Dev acceptance → QA evidence](WP-13-dev-qa-evidence-trace.md) показывает source-level mapping и условия остановки; runtime UNKNOWN.

Предисследование до приёмки WP-05/06/07/12. NaCl SHA `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; live QA, граф и поставка не запускались; стоимость и частота unknown.

Заявленные каналы evidence, а не универсальный порядок: dev baseline/RED/GREEN + regression path (`skills-for-codex/nacl-tl-dev-fe/SKILL.md:57–73,96–110`) → Task+evidence в одной graph операции (`codex-plugin-src/package/resources/workflows/references/verification-evidence.md:101–116`) → FE↔BE sync (`skills-for-codex/nacl-tl-sync/SKILL.md:19–36,40–80`) → review/QA (`codex-plugin-src/workflow-overlays/nacl-tl-review/SKILL.md:19–58,89–96,146–169`, `skills-for-codex/nacl-tl-qa/SKILL.md:17–31,132–140`) → clean checkout/deploy SHA/health (`skills-for-codex/nacl-tl-deploy/SKILL.md:26–48,65–72`) → release gates. Codex full отдельно описывает BE dev → BE review → FE dev → FE review → sync → stubs → QA → docs (`codex-plugin-src/workflow-overlays/nacl-tl-full/SKILL.md:174–182`); после исправления возможны повторные review/sync/QA. Эти стадии отвечают на разные вопросы; их повторяемость и цена не измерены.

Evidence strings test path и qa-stage status сами по себе не содержат commit/env/fixture hash (`verification-evidence.md:18–30`), в отличие от repo-checks-GREEN:SHA. Единая автоматическая инвалидация всех evidence при смене head в исследованных текстах не подтверждена. Это риск для проверки, не доказанная уязвимость. Локальный вызов отдельной функции sanitizer описан в [probe](WP-06-sanitize-probe.md); downstream gates не проверены.

Обратная петля `skills-for-codex/nacl-tl-reopened/SKILL.md:73–105,134–153` требует воспроизведение либо UNVERIFIED, spec-first fix, baseline delta и независимый review. Pre-ship и post-ship QA имеют разные среды (`nacl-tl-verify/SKILL.md:56–67`) и не должны смешиваться без доказательства SHA/env.

Negative cases: старый test path на новом head; FE URL/body расходится с BE; green unit mocks при provider 404; отсутствует natural-entry evidence; clean checkout SHA отличается от deployed; health 200 при сломанном пользовательском сценарии; удалён тест при сохранённой строке evidence; FAILED+mandatory NOT_RUN теряет градацию, но остаётся non-success. Production golden path до promote требует изучения exact SHA и стратегии rollout, не считать автоматически невозможным.

Кандидат DEFER: типизированный evidence ledger, привязанный к head, среде, требованиям и тесту, с selective rerun и независимым judgment. Риски — частичный граф, изменившаяся provider configuration и ложная свежесть. Вариант не реализован и не измерен.
