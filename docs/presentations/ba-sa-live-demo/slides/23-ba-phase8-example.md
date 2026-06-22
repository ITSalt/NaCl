# Фаза 8 живьём: ловим заранее оставленную дырку

В фазе 4 я «забыл» описать атрибуты сущности OBJ-003 «Автомобиль». Отчёт:

```
=== BA Validation Report ===
L1 BP completeness ........ PASS
L2 Workflow coverage ...... PASS
L3 Step performers ........ PASS
L4 Entity attributes ...... FAIL  [CRITICAL]
    └─ OBJ-003 «Автомобиль»: 0 атрибутов
L5 Entity-process matrix .. PASS
L6 Role-process matrix .... PASS
L7 Glossary coverage ...... WARN  [1 термин без определения]
L8 Rules binding .......... PASS

Result: FAIL — 1 CRITICAL. Phase 9 заблокирована.
```

**Чиним:** даю атрибуты (гос. номер — Текст, марка и модель — Текст,
год выпуска — Число) → перезапуск → `L4 PASS`, **Result: PASS**.

<!--
Speaker notes:
- Ключевой момент демо: модель сама сказала, ЧТО и ГДЕ не так — не ревьюер.
- Починка — это точечный возврат в фазу 4 для одной сущности, не перепрогон
  всего: оркестратор зовёт nacl-ba-entities в режиме доработки.
- WARNING не блокирует: можно осознанно идти дальше, дырка зафиксирована.
-->
