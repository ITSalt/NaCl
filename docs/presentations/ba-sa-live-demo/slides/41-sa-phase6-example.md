# SA Фаза 6 на примере СТО: навигация и компоненты

**Компоненты:**

| Компонент | Тип | Используется в |
|-----------|-----|----------------|
| CMP-MainNav | navigation | все экраны |
| CMP-SlotPicker | input | FORM-BookingCreate |
| CMP-BookingTable | display | экран администратора |
| CMP-StatusBadge | display | заявки и наряды |

**Навигация и достижимость:**

```
CMP-MainNav  «Записаться» ──HAS_INBOUND_ACTION──▶ FORM-BookingCreate   (UC-001 ✔)
CMP-BookingTable  строка ──HAS_INBOUND_ACTION──▶ FORM-BookingConfirm  (UC-002 ✔)
CMP-MainNav  «Наряды» [MECHANIC] ──▶ FORM-WorkOrderOpen               (UC-003 ✔)
```

Меню учитывает роли: пункт «Наряды» виден только MECHANIC/ADMIN —
прямо из матрицы прав фазы 3.

Gate: **«Структура меню и доступ по ролям верны? → yes»**

<!--
Speaker notes:
- Каждая стрелка — ребро в графе. Валидатор позже проверит: у каждого
  актор-UC есть хотя бы одна входящая точка.
- Дизайнер получает не «нарисуй экраны», а каркас: формы с полями,
  компоненты, навигацию, роли.
- Где посмотреть: Neo4j Browser →
  MATCH (c:Component)-[:HAS_INBOUND_ACTION]->(f:Form) RETURN c, f
-->
