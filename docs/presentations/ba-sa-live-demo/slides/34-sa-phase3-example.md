# SA Фаза 3 на примере СТО: матрица прав

**Выход — CRUD-матрица (роль × доменная сущность):**

| Роль \ Сущность | Booking | ScheduleSlot | Client | Vehicle | WorkOrder |
|-----------------|---------|--------------|--------|---------|-----------|
| role-001 CLIENT | C R | R | C R U | C R U | R |
| role-002 ADMIN | C R U D | C R U D | R U | R | C R |
| role-003 MECHANIC | R | R | — | R | R U |

**C** — создание (Create), **R** — чтение (Read), **U** — изменение (Update),
**D** — удаление (Delete), «—» — нет доступа.

```
ROL-01 Клиент        ─MAPPED_TO→ role-001 CLIENT
ROL-02 Администратор ─MAPPED_TO→ role-002 ADMIN
ROL-03 Мастер        ─MAPPED_TO→ role-003 MECHANIC
```

Проверка консистентности: CLIENT создаёт Booking — потому что шаг
BP-001-S02 (исполнитель Клиент) делает `PRODUCES` Заявки. **Права выведены
из процессов, а не назначены интуитивно.**

Gate: **«Ролевая модель и права верны? → yes»**

<!--
Speaker notes:
- Матрица — будущий middleware авторизации и проверки в каждом UC.
- Несоответствие (роль делает шаг, но прав нет) валидация поймает позже.
- Где посмотреть: Neo4j Browser → MATCH (sr:SystemRole)-[p:HAS_PERMISSION]->
  (de:DomainEntity) RETURN sr.id, p.crud, de.id
- Здесь же — опциональные дельты As-Is/To-Be, если роли меняются при внедрении.
-->
