# WP-01: BA/SA overlay — source-level capability и human gates

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Package pilot overlay, legacy Codex и Skills-only project MCP — разные контуры. Доступность, права, actual consumers и runtime enforcement UNKNOWN; DEFER.

- **nacl-ba-full** overlay :12–19,29–39,59–80,190–218 описывает защищённые Board metadata и BLOCKED/BA_DOMAIN_RESOURCE_UNAVAILABLE для неподдержанного domain; фазовые проверки/confirmation и BA→SA human gate сохраняются. Phase 8 validation read-only, Phase 9 отдаёт readiness и optional publish. Graph materialization и delivery handoff не наблюдались.
- **nacl-sa-architect** overlay :23–47,249–268,278–297 требует подтверждать context/writes/external file; pilot не предоставляет ExternalContract relationships и задаёт BLOCKED/SA_RELATIONSHIP_RESOURCE_UNAVAILABLE для такой materialization. TL plan overlay :23–27,35–39,52–59 описывает file gate, но named discovery недоступен; подтверждённый список остаётся file-only. Прямое чтение полей файла sync/QA не доказано.
- **nacl-sa-full** overlay :12–18,27–39,58–78,203–242 описывает только определённые scalar mutations Module/FR/UseCase с approval/lease/fence/CAS, отсутствующие relationship/named surfaces ведут к BLOCKED. Каждая фаза требует подтверждения, goal wrapper не должен обходить human gate; publish и TL optional. Это не доказывает поддержку всех graph writes или live atomicity.
- **nacl-sa-validate** overlay :13–30,32–56,199–232 описывает graph read-only и repair через отдельный подтверждённый workflow; пустой BA при full даёт internal и skipped cross/PARTIALLY_VERIFIED, не полное покрытие. Root SA full ожидает ValidationReport graph node, writer не доказан — WP-01-sa-validation-report-trace.md.

Статусы клиентов нельзя смешивать: root nacl-tl-release/SKILL.md:164–174 содержит формулировку Status: FAIL с CRITICAL, package validator использует FAILED (overlay nacl-sa-validate :198–207,220–230). При этом package release overlay nacl-tl-release/SKILL.md:67 прямо проверяет Status: FAILED. Это различие текстов root и package и отдельная нормализация в package, не доказанный межклиентский false PASS или неисправный parser.

Все ссылки сокращённых overlay имен относятся к codex-plugin-src/workflow-overlays/<name>/SKILL.md. Доказательства live connection, approved writes, handoff, persistence и recovery не собирались.
