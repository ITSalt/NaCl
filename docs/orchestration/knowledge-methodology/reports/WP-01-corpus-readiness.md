# WP-01: готовность шести кандидатов корпуса

Read-only аудит reports/WP-01-briefs-draft.md, WP-01-baseline-candidates.md, WP-01-corpus-conflicts.md и WP-16 evidence. Корпус и критерии не заморожены. Для всех шести найдены кандидатные commit/tree, но graph baseline, эквивалентность A/B inputs, изоляция решений и независимый закрытый harness не подтверждены.

| Кандидат | Code baseline | Имеется | Открыто |
|---|---|---|---|
| FR-014 | 8d449ab | локальная архивная среда, typecheck и historical unit suite 109/109; частичные browser RED и synthetic controls | полный AC, устройство/touch, error semantics, fixture/harness durability, blind isolation и воспроизводимый graph |
| FR-029 | a54778c | draft критерий согласованности трёх поверхностей | тарифный конфликт требований, fake API и clock/reset, среда, harness и repeatability |
| BUG-1 | 7a842ec | draft критерии fake provider success/error/missing key и OTP non-disclosure | различие исторических 503 и поздних 500, рабочая fixture, изоляция решения и repeatability |
| FR-030 | 43bbf10 | кандидат двух fake providers и feature flag | baseline без новой spec, одинаковые требования к error classes, fixture и скрытие post-change тестов |
| FR-041 | 27f8123 | draft для public/private/revoked и consent | предупреждения и 404/429/503, полный scope или явный slice, матрица данных и fixture |
| Recovery | 3efbf81 | предложен synthetic graph и сравнение interrupted/uninterrupted | исходное состояние, interruption, semantic equality, restore и изоляция |

Hash и tree кандидатов находятся в WP-01-baseline-candidates.md. Ранее проверенные FR-014 пробы относятся к описанным конкретным controls, не к full acceptance или A/B. Один path deny probe не изолировал ранее созданный hardlink, а network policy проверялась лишь на ограниченных loopback случаях. Положительные и отрицательные значения без исполняемого независимого oracle остаются черновиком. D-4 допускает только одну пару плюс review в общем лимите; это не трёхповторная серия.
