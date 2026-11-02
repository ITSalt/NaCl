# WP-01: BA→SA — конкретная статическая цепочка и разрыв

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. ID BP-001-S01 и UC ниже условные; это не данные реального graph. Нет выполненного Cypher/E2E или A/B.

1. Producer: root nacl-ba-workflow/SKILL.md:162–175,371–389 описывает подтверждённый WorkflowStep с function_name, stereotype и BusinessProcess→HAS_STEP; это инструкция, не доказанная запись.
2. Формат и связь: root nacl-ba-handoff/SKILL.md:219–246 показывает mappings и после confirmation описывает WorkflowStep→AUTOMATES_AS→UseCase. Root nacl-sa-uc/SKILL.md:110–114,254–259 описывает альтернативный путь создания UC/edge; оба writer не обязательно идут последовательно.
3. Consumer: root sa-uc :110–114,137,372–375 читает автоматизируемые steps без edge для stories и BA context связанного UC для detail; Codex skills-for-codex/nacl-sa-uc/SKILL.md:270–281 описывает UC→Form→FormField→DomainAttribute. Это разные клиентские тексты, не наблюдавшийся последовательный вызов.
4. Check: root nacl-ba-validate/SKILL.md:478–493 XL1.1 сообщает CRITICAL для шага с точным stereotype Автоматизируется, связанного с BP, без edge; английский stereotype и orphan steps этим конкретным query не охватываются; :731–741 выводит уровень по CRITICAL/WARNING. Наличие edge само не доказывает актуальность смысла или продукта.
5. Обратное изменение: root handoff :497–517 описывает rescan/diff и сохранение подтверждённых SA edges. Смысл BA может поменяться при прежнем ID/edge; один XL1.1 не доказывает semantic equality. Автоматический вызов SA update из этого rescan не доказан.
6. Возможный дальнейший путь: если отдельно вызвать/подтвердить SA feature change, skills-for-codex/nacl-sa-feature/SKILL.md:20–47 описывает impact, confirmed scope, spec_version, directed stale и сигнал TL plan. Текстовой связи от BA handoff update к обязательному запуску feature workflow в проверенных путях нет.

Итог: классы звеньев описаны, но автоматическая цепь BA semantic change→правильный consumer→инвалидация→восстановление после partial writes не доказана. Предлагаемый falsifier: при неизменном edge изменить смысл BA, затем сравнить SA update/stale Task и повтор с сохранением unrelated UC. Positive proposed: confirmed step→UC edge, validator на обеих слоях и подтверждённый SA пересмотр. Это не выполненные проверки.
