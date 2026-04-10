---
name: nacl-ba-handoff
description: |
  Generate BA→SA handoff package from Neo4j: traceability matrix, automation scope,
  module suggestions, coverage stats. Creates cross-layer edges after user confirmation.Use when: prepare BA→SA handoff, build traceability matrix, or the user says "/nacl-ba-handoff".
---

# /nacl-ba-handoff --- BA→SA Handoff Package (Graph)

## Назначение

Создание структурированного пакета передачи BA→SA из Neo4j графа: трассировочная матрица (маппинг BA-узлов на SA-узлы), скоуп автоматизации с кандидатами UC, предложения по группировке SA-модулей, статистика покрытия. Все данные читаются из Neo4j графа (BA-подграф), handoff-рёбра записываются после подтверждения пользователем.

---

## Shared References

Read `nacl-core/SKILL.md` for:
- Neo4j MCP tool names and connection info (`mcp__neo4j__read-cypher`, `mcp__neo4j__write-cypher`)
- ID generation rules
- Schema files location (`graph-infra/schema/ba-schema.cypher`, `graph-infra/schema/sa-schema.cypher`)
- Query library location (`graph-infra/queries/`)

### Named Queries

From `graph-infra/queries/handoff-queries.cypher`:

| Query Name | Description |
|---|---|
| `handoff_traceability_matrix` | Full BA→SA traceability across 4 categories (Step→UC, Entity→Domain, Role→SysRole, Rule→Req) |
| `handoff_uncovered_ba_steps` | WorkflowSteps with stereotype "Автоматизируется" missing AUTOMATES_AS edge |
| `handoff_uncovered_entities` | BusinessEntities (type: "Бизнес-объект") missing REALIZED_AS edge |
| `handoff_coverage_stats` | Coverage percentages per category |

### Handoff Edge Types

Written **only after user confirmation**:

| Edge | From | To | Meaning |
|---|---|---|---|
| `AUTOMATES_AS` | WorkflowStep | UseCase | BA step automated by SA use case |
| `REALIZED_AS` | BusinessEntity | DomainEntity | BA entity realized as SA domain entity |
| `MAPPED_TO` | BusinessRole | SystemRole | BA role mapped to SA system role |
| `IMPLEMENTED_BY` | BusinessRule | Requirement | BA rule implemented by SA requirement |

---

## Режимы работы

### Режим `full` (по умолчанию)

Полная генерация handoff-пакета с нуля: 4 фазы интерактивного диалога.

**Когда:** BA-модель в графе завершена, SA-подграф ещё пуст или частично заполнен.

### Режим `update`

Инкрементальное обновление: пересканировать BA-подграф, добавить новые маппинги, обновить изменившиеся. Существующие handoff-рёбра с подтверждённым статусом не удаляются.

**Когда:** BA-подграф изменился после первичного handoff.

---

## Workflow

```
+------------------+    +------------------+    +------------------+    +------------------+
| Phase 1          |    | Phase 2          |    | Phase 3          |    | Phase 4          |
| Traceability     |--->| Automation       |--->| Module           |--->| Coverage         |
| Matrix           |    | Scope            |    | Suggestions      |    | Stats            |
+------------------+    +------------------+    +------------------+    +------------------+
```

Каждая фаза завершается:
1. **Резюме** --- что найдено / предложено
2. **Подтверждение** --- запрос верификации у пользователя
3. **Артефакт** --- создание/обновление handoff-рёбер в Neo4j (только после подтверждения)

**Не переходи к следующей фазе без явного подтверждения пользователя!**

---

## Предварительная проверка

### 1. Проверь наличие BA-данных в графе

```cypher
// mcp__neo4j__read-cypher
MATCH (bp:BusinessProcess) WITH count(bp) AS bp_count
MATCH (ws:WorkflowStep {stereotype: "Автоматизируется"}) WITH bp_count, count(ws) AS auto_count
MATCH (be:BusinessEntity) WITH bp_count, auto_count, count(be) AS entity_count
MATCH (br:BusinessRole) WITH bp_count, auto_count, entity_count, count(br) AS role_count
MATCH (brq:BusinessRule) WITH bp_count, auto_count, entity_count, role_count, count(brq) AS rule_count
RETURN bp_count, auto_count, entity_count, role_count, rule_count
```

Если все счётчики = 0 --- предупреди, что BA-подграф пуст; предложи сначала `/nacl-ba-process` или `/nacl-ba-import-doc`.

### 2. Проверь существующие handoff-рёбра (для режима update)

```cypher
// mcp__neo4j__read-cypher
OPTIONAL MATCH ()-[a:AUTOMATES_AS]->() WITH count(a) AS automates_count
OPTIONAL MATCH ()-[r:REALIZED_AS]->() WITH automates_count, count(r) AS realized_count
OPTIONAL MATCH ()-[m:MAPPED_TO]->() WITH automates_count, realized_count, count(m) AS mapped_count
OPTIONAL MATCH ()-[i:IMPLEMENTED_BY]->() WITH automates_count, realized_count, mapped_count, count(i) AS implemented_count
RETURN automates_count, realized_count, mapped_count, implemented_count
```

Если handoff-рёбра уже существуют и режим `full` --- предупреди о возможной перезаписи.

### 3. Проверь наличие SA-узлов (UseCase, DomainEntity, SystemRole, Requirement)

```cypher
// mcp__neo4j__read-cypher
OPTIONAL MATCH (uc:UseCase) WITH count(uc) AS uc_count
OPTIONAL MATCH (de:DomainEntity) WITH uc_count, count(de) AS de_count
OPTIONAL MATCH (sr:SystemRole) WITH uc_count, de_count, count(sr) AS sr_count
OPTIONAL MATCH (rq:Requirement) WITH uc_count, de_count, sr_count, count(rq) AS rq_count
RETURN uc_count, de_count, sr_count, rq_count
```

Если SA-узлы существуют --- предложи создание handoff-рёбер к ним.
Если SA-узлов нет --- матрица будет содержать только BA-сторону с пустыми SA-колонками; handoff-рёбра будут созданы позже, когда SA-узлы появятся.

---

## Phase 1: Traceability Matrix

**Режим:** полуавтоматический + интерактивный (подтверждение маппинга)

**Цель:** Построить четырёхсекционную матрицу трассировки BA→SA из Neo4j.

### 1.1. Загрузить существующую трассировку

Выполни запрос `handoff_traceability_matrix`:

```cypher
// mcp__neo4j__read-cypher
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase)
RETURN 'Step→UC' AS category, ws.id AS ba_id, ws.function_name AS ba_name, uc.id AS sa_id, uc.name AS sa_name
UNION ALL
MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de:DomainEntity)
RETURN 'Entity→Domain' AS category, be.id AS ba_id, be.name AS ba_name, de.id AS sa_id, de.name AS sa_name
UNION ALL
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
RETURN 'Role→SysRole' AS category, br.id AS ba_id, br.full_name AS ba_name, sr.id AS sa_id, sr.name AS sa_name
UNION ALL
MATCH (brq:BusinessRule)-[:IMPLEMENTED_BY]->(rq:Requirement)
RETURN 'Rule→Req' AS category, brq.id AS ba_id, brq.name AS ba_name, rq.id AS sa_id, rq.description AS sa_name
```

### 1.2. Найти непокрытые BA-шаги

Выполни запрос `handoff_uncovered_ba_steps`:

```cypher
// mcp__neo4j__read-cypher
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep {stereotype: "Автоматизируется"})
WHERE NOT (ws)-[:AUTOMATES_AS]->(:UseCase)
RETURN bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS ws_id, ws.function_name AS ws_function
```

### 1.3. Найти непокрытые бизнес-сущности

Выполни запрос `handoff_uncovered_entities`:

```cypher
// mcp__neo4j__read-cypher
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WHERE NOT (be)-[:REALIZED_AS]->(:DomainEntity)
RETURN be.id, be.name, be.type
```

### 1.4. Найти непокрытые роли и правила

```cypher
// mcp__neo4j__read-cypher
MATCH (br:BusinessRole)
WHERE NOT (br)-[:MAPPED_TO]->(:SystemRole)
RETURN 'Role' AS category, br.id AS ba_id, br.full_name AS ba_name
UNION ALL
MATCH (brq:BusinessRule)
WHERE NOT (brq)-[:IMPLEMENTED_BY]->(:Requirement)
RETURN 'Rule' AS category, brq.id AS ba_id, brq.name AS ba_name
```

### 1.5. Построить и показать трассировочную матрицу

Объедини результаты шагов 1.1--1.4 в четыре таблицы:

**Секция 1: Процессы → Use Cases**

| BA: Step ID | BA: Бизнес-функция | BA: Процесс | SA: UC | Статус |
|---|---|---|---|---|
| {ws_id} | {ws_function} | {bp_name} | {uc_name или "---"} | {Покрыт / Не покрыт} |

**Секция 2: Сущности → Domain Entities**

| BA: OBJ ID | BA: Имя | BA: Тип | SA: Entity | Статус |
|---|---|---|---|---|
| {be_id} | {be_name} | {be_type} | {de_name или "---"} | {Покрыт / Не покрыт} |

**Секция 3: Роли → Системные роли**

| BA: ROL ID | BA: Роль | SA: Системная роль | Статус |
|---|---|---|---|
| {br_id} | {br_name} | {sr_name или "---"} | {Покрыт / Не покрыт} |

**Секция 4: Бизнес-правила → Требования**

| BA: BRQ ID | BA: Правило | SA: Требование | Статус |
|---|---|---|---|
| {brq_id} | {brq_name} | {rq_description или "---"} | {Покрыт / Не покрыт} |

### Подтверждение

Покажи собранную матрицу пользователю:

```
**Phase 1: Трассировочная матрица**

Трассировочная матрица из графа:
- Шаги → UC: {covered}/{total} покрыто, {uncovered} ожидают маппинга
- Сущности → Entities: {covered}/{total} покрыто, {uncovered} ожидают маппинга
- Роли → Системные роли: {covered}/{total} покрыто
- Правила → Требования: {covered}/{total} покрыто

Проверьте маппинг. Есть ли корректировки?
Для непокрытых элементов я предложу кандидатов SA в Phase 2.
```

### Создание handoff-рёбер (после подтверждения)

Если пользователь предложил конкретные маппинги для непокрытых элементов и SA-узлы существуют --- создай рёбра.

#### AUTOMATES_AS

```cypher
// mcp__neo4j__write-cypher
MATCH (ws:WorkflowStep {id: $ws_id})
MATCH (uc:UseCase {id: $uc_id})
MERGE (ws)-[:AUTOMATES_AS]->(uc)
```

#### REALIZED_AS

```cypher
// mcp__neo4j__write-cypher
MATCH (be:BusinessEntity {id: $be_id})
MATCH (de:DomainEntity {id: $de_id})
MERGE (be)-[:REALIZED_AS]->(de)
```

#### MAPPED_TO

```cypher
// mcp__neo4j__write-cypher
MATCH (br:BusinessRole {id: $br_id})
MATCH (sr:SystemRole {id: $sr_id})
MERGE (br)-[:MAPPED_TO]->(sr)
```

#### IMPLEMENTED_BY

```cypher
// mcp__neo4j__write-cypher
MATCH (brq:BusinessRule {id: $brq_id})
MATCH (rq:Requirement {id: $rq_id})
MERGE (brq)-[:IMPLEMENTED_BY]->(rq)
```

---

## Phase 2: Automation Scope

**Режим:** конструктивный

**Цель:** Сформировать плоскую таблицу всех автоматизируемых шагов с кандидатами UC и приоритетами.

### Действия

#### Шаг 2.1: Загрузить все автоматизируемые шаги с контекстом

```cypher
// mcp__neo4j__read-cypher
MATCH (gpr:ProcessGroup)-[:CONTAINS]->(bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep {stereotype: "Автоматизируется"})
OPTIONAL MATCH (ws)-[:PERFORMED_BY]->(r:BusinessRole)
OPTIONAL MATCH (ws)-[:READS|PRODUCES|MODIFIES]->(be:BusinessEntity)
OPTIONAL MATCH (ws)-[:AUTOMATES_AS]->(uc:UseCase)
RETURN gpr.name AS group_name,
       bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS ws_id, ws.step_number AS step_num, ws.function_name AS ws_function,
       r.full_name AS role_name,
       collect(DISTINCT be.name) AS related_entities,
       uc.id AS existing_uc_id, uc.name AS existing_uc_name
ORDER BY gpr.name, bp.id, ws.step_number
```

#### Шаг 2.2: Для каждого непокрытого шага предложить кандидат UC

Для каждого шага без AUTOMATES_AS-ребра:
1. Предложи кандидат-имя UC (краткое, в формате действия)
2. Определи приоритет (Высокий / Средний / Низкий) на основе:
   - Количества связей с сущностями (больше = выше приоритет)
   - Наличия бизнес-правил, привязанных к связанным сущностям
   - Частоты использования роли (если указана)

**Формат:**

| Группа | BP | Step # | Бизнес-функция | Роль | Кандидат UC | Приоритет | Статус |
|---|---|---|---|---|---|---|---|
| {group} | {bp_id} | {step_num} | {ws_function} | {role} | {uc_candidate} | {priority} | {Покрыт / Новый} |

### Подтверждение

```
**Phase 2: Скоуп автоматизации**

Скоуп автоматизации: {total} шагов из {M} процессов.
- Уже покрыты UC: {covered}
- Новые кандидаты UC: {new}

Проверьте предложенные имена UC и приоритеты.
Вы можете переименовать, объединить или разделить кандидатов.
```

Пользователь подтверждает или корректирует имена UC и приоритеты.

---

## Phase 3: Module Suggestions

**Режим:** конструктивный

**Цель:** Предложить группировку SA-модулей на основе ProcessGroup из графа.

### Действия

#### Шаг 3.1: Загрузить ProcessGroup и связанные данные

```cypher
// mcp__neo4j__read-cypher
MATCH (gpr:ProcessGroup)-[:CONTAINS]->(bp:BusinessProcess)
OPTIONAL MATCH (bp)-[:HAS_STEP]->(ws:WorkflowStep {stereotype: "Автоматизируется"})
OPTIONAL MATCH (ws)-[:READS|PRODUCES|MODIFIES]->(be:BusinessEntity)
OPTIONAL MATCH (gpr)-[:SUGGESTS]->(m:Module)
RETURN gpr.id AS gpr_id, gpr.name AS gpr_name,
       count(DISTINCT bp) AS process_count,
       count(DISTINCT ws) AS auto_step_count,
       collect(DISTINCT be.name) AS related_entities,
       m.id AS existing_module_id, m.name AS existing_module_name
ORDER BY gpr.id
```

#### Шаг 3.2: Для каждой ProcessGroup предложить SA-модуль

Для каждой GPR без SUGGESTS-ребра:
1. Предложи имя кандидата SA-модуля (snake_case: `mod-{code}`)
2. Укажи, какие процессы и сущности входят
3. Добавь краткое обоснование

**Формат:**

| BA: Группа процессов | GPR ID | Предлагаемый SA-модуль | Процессов | Шагов (авто) | Сущностей | Обоснование | Статус |
|---|---|---|---|---|---|---|---|
| {gpr_name} | {gpr_id} | {module_name} | {N} | {N} | {entities} | {rationale} | {Есть / Новый} |

### Подтверждение

```
**Phase 3: Предложения по модулям**

Предложение по модулям: {N} групп → {N} кандидатов SA-модулей.
- Уже связаны с модулями: {existing}
- Новые предложения: {new}

Важно: это предложение. Финальную структуру модулей определяет /nacl-sa-architect.
Согласны с предложенной группировкой?
```

### Создание SUGGESTS-рёбер (после подтверждения)

Для каждого подтверждённого предложения, если Module узел существует:

```cypher
// mcp__neo4j__write-cypher
MATCH (gpr:ProcessGroup {id: $gpr_id})
MATCH (m:Module {id: $module_id})
MERGE (gpr)-[:SUGGESTS]->(m)
```

Если Module узла ещё нет --- **не создавай его здесь**. Запиши предложение в вывод для последующего `/nacl-sa-architect`.

---

## Phase 4: Coverage Stats

**Режим:** автоматический

**Цель:** Показать статистику покрытия BA→SA из графа.

### Действия

#### Шаг 4.1: Выполнить запрос handoff_coverage_stats

```cypher
// mcp__neo4j__read-cypher
MATCH (ws:WorkflowStep {stereotype: "Автоматизируется"})
WITH count(ws) AS total_auto
OPTIONAL MATCH (ws2:WorkflowStep {stereotype: "Автоматизируется"})-[:AUTOMATES_AS]->(:UseCase)
WITH total_auto, count(ws2) AS covered_auto
WITH total_auto, covered_auto,
     CASE WHEN total_auto > 0 THEN round(100.0 * covered_auto / total_auto) ELSE 0 END AS step_pct

MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WITH total_auto, covered_auto, step_pct, count(be) AS total_entities
OPTIONAL MATCH (be2:BusinessEntity {type: "Бизнес-объект"})-[:REALIZED_AS]->(:DomainEntity)
WITH total_auto, covered_auto, step_pct, total_entities, count(be2) AS covered_entities
WITH total_auto, covered_auto, step_pct, total_entities, covered_entities,
     CASE WHEN total_entities > 0 THEN round(100.0 * covered_entities / total_entities) ELSE 0 END AS entity_pct

MATCH (br:BusinessRole)
WITH step_pct, entity_pct, total_auto, covered_auto, total_entities, covered_entities, count(br) AS total_roles
OPTIONAL MATCH (br2:BusinessRole)-[:MAPPED_TO]->(:SystemRole)
WITH step_pct, entity_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, count(br2) AS covered_roles
WITH step_pct, entity_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, covered_roles,
     CASE WHEN total_roles > 0 THEN round(100.0 * covered_roles / total_roles) ELSE 0 END AS role_pct

MATCH (brq:BusinessRule)
WITH step_pct, entity_pct, role_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, covered_roles, count(brq) AS total_rules
OPTIONAL MATCH (brq2:BusinessRule)-[:IMPLEMENTED_BY]->(:Requirement)
WITH step_pct, entity_pct, role_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, covered_roles, total_rules, count(brq2) AS covered_rules

RETURN
  step_pct AS automation_coverage_pct,
  entity_pct AS entity_coverage_pct,
  role_pct AS role_coverage_pct,
  CASE WHEN total_rules > 0 THEN round(100.0 * covered_rules / total_rules) ELSE 0 END AS rule_coverage_pct,
  {steps_covered: covered_auto, steps_total: total_auto,
   entities_covered: covered_entities, entities_total: total_entities,
   roles_covered: covered_roles, roles_total: total_roles,
   rules_covered: covered_rules, rules_total: total_rules} AS details
```

#### Шаг 4.2: Показать статистику покрытия

```
**Phase 4: Coverage Stats**

| Категория | Покрыто | Всего | Покрытие |
|---|---|---|---|
| Шаги → UC | {covered_auto} | {total_auto} | {step_pct}% |
| Сущности → Domain | {covered_entities} | {total_entities} | {entity_pct}% |
| Роли → SysRole | {covered_roles} | {total_roles} | {role_pct}% |
| Правила → Req | {covered_rules} | {total_rules} | {rule_pct}% |
```

---

## Завершение

Покажи пользователю финальный отчёт:

```
**Handoff-пакет сформирован из Neo4j графа**

Содержание:
- Трассировочная матрица: 4 секции
- Шаги → UC: {covered}/{total} ({step_pct}%)
- Сущности → Domain: {covered}/{total} ({entity_pct}%)
- Роли → SysRole: {covered}/{total} ({role_pct}%)
- Правила → Req: {covered}/{total} ({rule_pct}%)
- Скоуп автоматизации: {N} шагов, {new_candidates} новых кандидатов UC
- Модули (предложение): {N} кандидатов из {M} групп процессов

Gaps report:
- Непокрытые шаги: {N}
- Непокрытые сущности (обязательные): {N}
- Непокрытые роли: {N}
- Непокрытые правила: {N}

Handoff-рёбра созданы: {N} (AUTOMATES_AS: {a}, REALIZED_AS: {r}, MAPPED_TO: {m}, IMPLEMENTED_BY: {i})

Следующие шаги:
1. /nacl-sa-architect --- создать модули на основе предложений
2. /nacl-sa-domain --- построить Domain Model для модулей
3. /nacl-sa-uc --- детализировать Use Cases из кандидатов
4. /nacl-sa-roles --- определить системные роли
```

---

## Режим update

При запуске с `scope: update`:

1. Загрузи существующую трассировку (шаг 1.1)
2. Найди все BA-узлы в графе (пересканируй)
3. Сравни:
   - **Новые BA-узлы** (нет handoff-ребра) --- добавь в матрицу со статусом "Не покрыт"
   - **Удалённые BA-узлы** (handoff-ребро ведёт в пустоту) --- предложи удаление ребра
   - **Изменённые BA-узлы** (свойства узла обновлены) --- обнови BA-колонки в отчёте
4. SA-рёбра, подтверждённые ранее --- **не удаляй**
5. Покажи diff пользователю для подтверждения:

```
Изменения с момента последнего handoff:
- Новые BA-элементы: {N} (добавлены в матрицу)
- Удалённые BA-элементы: {N} (предложено удаление рёбер)
- Изменённые BA-элементы: {N} (обновлены BA-колонки)
- SA-рёбра без изменений: {N}

Подтвердите обновления.
```

---

## Работа с неполными данными

Если SA-подграф пуст (нет UseCase, DomainEntity, SystemRole, Requirement):

1. Фазы 1--3 работают в режиме **предложений** --- формируют кандидатов, но не создают handoff-рёбра
2. Phase 4 покажет 0% покрытия по всем категориям
3. Предложи пользователю:
   - `/nacl-sa-architect` --- для создания модулей
   - `/nacl-sa-domain` --- для создания DomainEntity
   - `/nacl-sa-uc` --- для создания UseCase
   - `/nacl-sa-roles` --- для создания SystemRole
4. После создания SA-узлов --- повторный запуск `/nacl-ba-handoff` создаст рёбра

---

## Чеклист /nacl-ba-handoff

### Предварительная проверка
- [ ] BA-подграф содержит данные (bp_count > 0)
- [ ] Существующие handoff-рёбра проверены (для mode awareness)
- [ ] SA-подграф проверен (наличие/отсутствие целевых узлов)

### Phase 1: Traceability Matrix
- [ ] Запрос `handoff_traceability_matrix` выполнен
- [ ] Запрос `handoff_uncovered_ba_steps` выполнен
- [ ] Запрос `handoff_uncovered_entities` выполнен
- [ ] Непокрытые роли и правила найдены
- [ ] Четыре секции матрицы построены и показаны
- [ ] Пользователь подтвердил маппинг
- [ ] Handoff-рёбра созданы (только после подтверждения, только при наличии SA-узлов)

### Phase 2: Automation Scope
- [ ] Все автоматизируемые шаги загружены с контекстом (роли, сущности, существующие UC)
- [ ] Для каждого непокрытого шага предложен кандидат UC
- [ ] Приоритеты расставлены
- [ ] Таблица подтверждена пользователем

### Phase 3: Module Suggestions
- [ ] ProcessGroup загружены с количеством процессов, шагов, сущностей
- [ ] Существующие SUGGESTS-рёбра учтены
- [ ] Для каждой GPR без модуля предложен кандидат
- [ ] Предложение подтверждено пользователем
- [ ] SUGGESTS-рёбра созданы (только к существующим Module узлам)

### Phase 4: Coverage Stats
- [ ] Запрос `handoff_coverage_stats` выполнен
- [ ] Таблица покрытия показана (4 категории, % по каждой)
- [ ] Финальный отчёт с gaps report показан
- [ ] Следующие шаги предложены
