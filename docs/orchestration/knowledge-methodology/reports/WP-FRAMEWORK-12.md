# WP-12 — SA → TL → разработка: ограниченная статическая сдача

Снимок `20fe4c6a56482e85d3ea9a9ebaadb37206047e41`; D-6 принимает только ограниченные входы WP03/04/05. Использованы существующие отчёты, новые tests и graph не выполнялись.

**Цепь.** UC/Requirement и anchors, формы и slices → SA readiness → planner описывает self-contained BE/FE tasks, acceptance, test-spec, API contract и Wave/Task с UC→GENERATES→Task → разработка с baseline/RED/result → sync сверяет FE calls и BE routes → review/QA. Slice→Task VERIFIED_BY является связью трассировки, не доказательством выполнения теста. Graph/файловая атомарность и read-back не проверены. [SA→TL](WP-01-sa-tl-static-chain.md).

**BE↔FE.** Planner заявляет API artifact и типы; разработчики получают contract и тесты; sync сверяет URL/method/body и routes. Для non-SYSTEM одного typed mock недостаточно: source описывает runnable fixture, contract-test или live-smoke и отдельные исключения. Это source-contract, не выполненный wire trace; fixture не доказывает реальный provider. Root BE допускает warn/proceed без contract, Codex FE требует BLOCKED: разные роли и клиенты, runtime defect не доказан. Владелец изменения API, полная цепь API↔types↔tests↔wire и coverage stubs UNKNOWN. [Sync cards](WP-01-tl-platform-more-cards.md).

**Риски потери.** Показанный query возвращает Requirement nodes, но явно не возвращает пары REALIZED_BY; отдельное чтение и runtime loss неизвестны. Различие raw/uppercase enum и entity-wide HAS_ENUM может подавить создание другого атрибута; backend-only путь не доказан. Source query может добавлять связи к уточнённым slices; runtime неизвестен. Передача baseline/формулы RED могут быть неоднозначны, исход не наблюдался. [Anchors](WP-12-requirement-anchor-trace.md), [enum](WP-12-enum-interface-trace.md), [RED handoff](WP-05-fe-red-handoff.md), [preliminary](WP-12-preliminary.md).

**Сценарии и отдельные механизмы.** Малый fix: intake → ограниченный scope → исполнитель; обязательные входы и короткий путь UNKNOWN. UI+BE: UC/Requirement/Form → planner → BE/FE → sync; API owner и исполненная E2E цепь UNKNOWN. Интеграция дополнительно требует provider-specific evidence; локальная fixture не доказывает live provider.

| Механизм / consumer | Дефект и решение | Цена / риск / предложенный контроль |
|---|---|---|
| Requirement anchors / planner | Потеря смысла; versioned ID-aware snapshot DEFER | UNKNOWN; одинаковые тексты с разными anchors/class и legacy type |
| Enum / FE и BE | Несогласованный wire; typed table DEFER | UNKNOWN; два enum attributes, Новый/NEW, backend-only |
| API / разработка и sync | Несовпадение contract и route; versioned artifact DEFER | UNKNOWN; missing contract, неверный URL, stale revision |
| Wire / sync и QA | Mock-only evidence; KEEP source-gate в применимом non-SYSTEM scope | UNKNOWN; fixture не доказывает provider; positive runnable wire и negative mock-only |
| Baseline/RED / FE и review | Неверная причина отказа; KEEP прослеживание и независимая приёмка | UNKNOWN; A→B baseline и unrelated failure |

[Первый независимый review](WP-12-independent-review.md) проверил шесть ссылок, pinned HEAD и обычный clean status; ignored не проверялись. Все controls предложены, не выполнены.

**Кандидаты.** KEEP IDs/version, независимую acceptance и non-mock wire gate. Возможный versioned snapshot + structured delta и API artifact — DEFER до проверок нескольких RQ anchors, enum двух атрибутов, ошибочного URL при совпавших DTO, отсутствующего contract, stale revision, mock-only и baseline A→B. Риски: потеря provenance, устаревший snapshot, путаница fixture и provider, recovery. Для малого fix применимость сокращения не доказана; UI+BE и интеграция требуют соответствующей wire/provider проверки. Стоимость, сравнимое выполнение трёх сценариев, качество и ускорение UNKNOWN. Полный минимальный contract, coverage и end-to-end трасса не доказаны. Независимый review обязателен.
