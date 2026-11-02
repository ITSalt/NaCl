# WP-01: board sync, regeneration и change_marker

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Source-level trace; graph, UI и тесты не запускались. Источники и consumers не доказывают runtime equivalence, recovery или цену; DEFER.

docs/methodology/graph-philosophy.md:71,89–97 обещает двунаправленное выравнивание после graph edits/re-sync. Исследованные источники описывают два разных маршрута:

1. Board→graph: root nacl-ba-sync/SKILL.md:15–17,602–646 и Codex skills-for-codex/nacl-ba-sync/SKILL.md:19–47 обновляют graph по board и затем markers/read-back. Dirty label описан как обновление graph из board, не обратный merge.
2. Graph→regenerate: root nacl-render/SKILL.md:751–758 направляет генерацию в analyst-tool; Sidebar.tsx:195–208 → skill-runner.ts:302–318,327–350 → analyst-tool/server/src/render/index.ts:20–27,29–65 → запись board/meta. Поддержка некоторых видов не доказывает auto re-sync любой доски, layout equivalence или сохранение user edits. Endpoint возвращает runId, не доказательство completion.

Sidebar :195–208 запрашивает подтверждение для unsynced edits в per-board UI; защита batch/direct API не установлена. Root analyze :354–395 сообщает graph mismatch, но не восстанавливает автоматически. Root sync :617–624 пропавший graph node пропускает и предлагает убрать nodeId; :89–91 рассматривает non-deleted shapes — удаление shape не доказано как graph delete. Terminal failure :814–825,878–890 и partial :892–902 не доказывают rollback уже выполненных graph writes; partial sidecar может быть ok. Codex sync :27–29,35–47 требует read-back до markers и сохранения board при terminal failure.

Root nacl-ba-workflow/SKILL.md:162–175,371–397,437–468 описывает определение, запись и отображение change_marker. graph-infra/schema/ba-schema.cypher:105–110 документирует значения в комментарии, не показывает constraint. Root sync :300–315 при create использует marker либо [new], на match сохраняет прежний при null; dirty update :626–646 меняет function_name и не показывает invalidation marker. В целевом поиске исходников за пределами этих root skills найдены schema и generated copies, но явный SA/TL reader и автоматический semantic diff/replan не подтверждены. Не исключены динамические consumers. Значение default не является доказательством подтверждённой семантики as-is/to-be.

Предлагаемые negative: graph edit при несохранённой board, удалённый shape при живом graph node, crash между graph и marker, изменённый step со старым marker. Positive: read-back и повтор stable ID, отдельно regeneration поддержанного вида. Cases не исполнены.
