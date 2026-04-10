---
name: graph_sa_architect
description: |
  Декомпозиция системы на модули (Bounded Contexts), построение Context Map и определение NFR.
  Читает BA-данные из Neo4j графа, записывает Module/Requirement узлы в граф.
  Используй когда пользователь просит: спроектировать архитектуру в графе, разбить на модули,
  определить bounded contexts, создать обзор системы, graph_sa_architect.
---

# /graph_sa_architect --- Архитектурная декомпозиция (Graph)

## Назначение

Декомпозиция информационной системы на функциональные модули (Bounded Contexts), определение межмодульных зависимостей и высокоуровневых нефункциональных требований. Все данные читаются из Neo4j графа (BA-подграф) и записываются в Neo4j граф (SA-подграф).

---

## Shared References

Read `graph_core/SKILL.md` for:
- Neo4j MCP tool names and connection info (`mcp__neo4j__read-cypher`, `mcp__neo4j__write-cypher`)
- ID generation rules
- Schema files location (`graph-infra/schema/sa-schema.cypher`)
- Query library location (`graph-infra/queries/`)

### Key Schema (SA Layer)

From `graph-infra/schema/sa-schema.cypher`:

| Node | Key Properties | Description |
|------|---------------|-------------|
| `Module` | id, name, description, uc_range_start, uc_range_end | Functional module (Bounded Context) |
| `Requirement` | id, description, type, priority | Functional or non-functional requirement |

Key SA relationships used by this skill:
- `(:Module)-[:CONTAINS_UC]->(:UseCase)` --- module owns a use case
- `(:Module)-[:CONTAINS_ENTITY]->(:DomainEntity)` --- module owns a domain entity
- `(:Module)-[:DEPENDS_ON {type, description}]->(:Module)` --- inter-module dependency
- `(:ProcessGroup)-[:SUGGESTS]->(:Module)` --- BA-to-SA handoff edge

---

## Режимы работы

### Режим `full` (по умолчанию)

Полная декомпозиция системы с нуля: 5 фаз интерактивного диалога.

**Когда:** Новый проект, Module узлы ещё не созданы в графе.

### Режим `module`

Добавление одного модуля в существующую архитектуру.

**Когда:** Модули уже существуют в графе, нужно расширить.

**Параметр:** `module_name` --- имя нового модуля (snake_case).

---

## Workflow

```
+--------------+    +--------------+    +--------------+    +--------------+    +--------------+
| Phase 0      |    | Phase 1      |    | Phase 2      |    | Phase 3      |    | Phase 4      |
| BA Context   |--->| Бизнес-      |--->| Модульная    |--->| Context      |--->| NFR и        |
| Import       |    | контекст     |    | декомпозиция |    | Map          |    | ограничения  |
| (из графа)   |    |              |    | (в граф)     |    | (в граф)     |    | (в граф)     |
+--------------+    +--------------+    +--------------+    +--------------+    +--------------+
```

Каждая фаза завершается:
1. **Резюме** --- что понято
2. **Подтверждение** --- запрос верификации у пользователя
3. **Артефакт** --- создание/обновление узлов и рёбер в Neo4j графе

**Не переходи к следующей фазе без явного подтверждения пользователя!**

---

## Предварительная проверка

### Режим `full`

1. Проверь наличие Module узлов в графе:

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module) RETURN count(m) AS module_count
```

Если `module_count > 0` --- предупреди о возможной перезаписи.

2. Проверь наличие BA-данных в графе:

```cypher
// mcp__neo4j__read-cypher
MATCH (gpr:ProcessGroup) RETURN count(gpr) AS pg_count
```

Если `pg_count = 0` --- предупреди, что BA-подграф пуст; Phase 0 будет пропущена.

### Режим `module`

1. Загрузи существующие модули:

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module)
RETURN m.id AS id, m.name AS name, m.uc_range_start AS uc_start, m.uc_range_end AS uc_end
ORDER BY m.uc_range_start
```

Если модулей нет --- предложи `/graph_sa_architect` в режиме `full`.

2. Определи занятые имена и диапазоны UC.
3. Определи свободный диапазон UC для нового модуля.

---

## Phase 0: Импорт BA-контекста из графа

**Цель:** Прочитать BA-подграф и извлечь контекст для архитектурного проектирования.

### Шаг 0.1: Загрузить все ProcessGroup и их BusinessProcess

```cypher
// mcp__neo4j__read-cypher
MATCH (gpr:ProcessGroup)-[:CONTAINS]->(bp:BusinessProcess)
RETURN gpr.id AS gpr_id, gpr.name AS gpr_name,
       collect({id: bp.id, name: bp.name, description: bp.description}) AS processes
```

### Шаг 0.2: Загрузить все BusinessEntity (бизнес-объекты)

```cypher
// mcp__neo4j__read-cypher
MATCH (be:BusinessEntity)
OPTIONAL MATCH (be)-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
RETURN be.id AS id, be.name AS name, be.type AS type, be.description AS description,
       collect({id: a.id, name: a.name, data_type: a.data_type}) AS attributes
```

### Шаг 0.3: Загрузить automation scope (шаги для автоматизации)

```cypher
// mcp__neo4j__read-cypher
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep {stereotype: "Автоматизируется"})
OPTIONAL MATCH (ws)-[:PERFORMED_BY]->(r:BusinessRole)
RETURN bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS ws_id, ws.function_name AS ws_function,
       r.full_name AS role_name
ORDER BY bp.id, ws.step_number
```

### Шаг 0.4: Загрузить существующие предложения по модулям (если есть)

```cypher
// mcp__neo4j__read-cypher
MATCH (gpr:ProcessGroup)-[:SUGGESTS]->(m:Module)
RETURN gpr.id AS gpr_id, gpr.name AS gpr_name,
       m.id AS module_id, m.name AS module_name
```

### Шаг 0.5: Загрузить бизнес-роли

```cypher
// mcp__neo4j__read-cypher
MATCH (r:BusinessRole)
OPTIONAL MATCH (r)-[:OWNS]->(owned:BusinessProcess)
OPTIONAL MATCH (r)-[:PARTICIPATES_IN]->(part:BusinessProcess)
RETURN r.id AS id, r.full_name AS name,
       collect(DISTINCT owned.name) AS owns_processes,
       collect(DISTINCT part.name) AS participates_in
```

### Шаг 0.6: Загрузить бизнес-правила

```cypher
// mcp__neo4j__read-cypher
MATCH (brq:BusinessRule)
OPTIONAL MATCH (brq)-[:CONSTRAINS]->(be:BusinessEntity)
OPTIONAL MATCH (brq)-[:APPLIES_IN]->(bp:BusinessProcess)
RETURN brq.id AS id, brq.name AS name, brq.description AS description,
       collect(DISTINCT be.name) AS constrains_entities,
       collect(DISTINCT bp.name) AS applies_in_processes
```

### Вывод Phase 0

Покажи пользователю сводку:

```
**Phase 0: Импорт BA-контекста из графа**

BA-подграф загружен:
- Группы процессов: {N} (содержат {M} бизнес-процессов)
- Бизнес-объекты: {N}
- Шаги для автоматизации: {N} (из {M} бизнес-процессов)
- Бизнес-роли: {N}
- Бизнес-правила: {N}
- Предложения по модулям: {N} (из SUGGESTS-рёбер)

Эти данные будут использованы как основа для проектирования.
Переходим к Phase 1 для верификации и уточнения.
```

### Если BA-подграф пуст

Пропусти Phase 0, перейди к Phase 1. Работай в стандартном режиме --- собирай всю информацию от пользователя.

---

## Phase 1: Бизнес-контекст

**Цель:** Верифицировать и уточнить бизнес-контекст на основе BA-данных из графа.

### Если BA-данные загружены (Phase 0 выполнена)

Предложи пользователю верификацию, а не задавай вопросы с нуля:

```
На основе BA-подграфа я вижу:

**Бизнес-процессы:** {список процессов по группам}
**Scope автоматизации:** {N} шагов подлежат автоматизации
**Ключевые объекты:** {список бизнес-объектов}
**Роли:** {список ролей}

Вопросы для уточнения:
1. Все ли процессы должны быть покрыты системой?
2. Есть ли внешние системы для интеграции, не отражённые в графе?
3. Есть ли ограничения scope, которые нужно учесть?
```

### Если BA-данных нет

Задавай вопросы как в стандартном sa-architect:

1. Какую бизнес-задачу решает система?
2. Кто целевые пользователи?
3. Какие основные функциональные области?
4. Что НЕ входит в scope?
5. Есть ли внешние системы для интеграции?

### Действия после получения ответов

1. Сформулируй бизнес-цели (2--3 пункта)
2. Определи success criteria
3. Опиши scope (что входит, что не входит)
4. Опиши целевых пользователей на основе BusinessRole из графа

### Артефакт

В отличие от sa-architect, **НЕ создавай markdown-файлы** в `docs/`. Данные Phase 1 хранятся в памяти диалога и используются в последующих фазах для создания графовых узлов.

### Переход

После подтверждения пользователем -> Phase 2

---

## Phase 2: Модульная декомпозиция

**Цель:** Разбить систему на 3--8 функциональных модулей (Bounded Contexts) и записать их в граф.

### Принципы декомпозиции

1. **Single Responsibility:** Каждый модуль решает одну бизнес-задачу
2. **High Cohesion:** Сущности и UC внутри модуля тесно связаны
3. **Low Coupling:** Минимум зависимостей между модулями
4. **Testable Boundary:** Модуль можно описать 1--2 предложениями без "и/или"
5. **Balanced Size:** Каждый модуль содержит 3--15 UC
6. **BA Alignment:** Модули должны коррелировать с ProcessGroup из BA-подграфа

### Построение предложения

Если в Phase 0 загружены SUGGESTS-рёбра --- используй их как стартовую точку. Иначе --- используй ProcessGroup как основу для группировки:

```
На основе BA-подграфа я предлагаю разбить систему на следующие модули:

1. **{Название}** (mod-{code}) --- {назначение}
   - Источник: ProcessGroup "{gpr_name}"
   - UC range: UC100-UC199
   - Процессы: {список BP из этой группы}
   - Бизнес-объекты: {список BE, связанных с процессами}

2. **{Название}** (mod-{code}) --- {назначение}
   ...

Вопросы:
1. Согласны с такой структурой модулей?
2. Нужно ли добавить/убрать/объединить модули?
3. Есть ли общесистемные функции (авторизация, настройки)?
   - Если да, они идут в модуль mod-common (UC001-UC099)
```

### Правила декомпозиции

- Система = 3--8 модулей
- Если модуль содержит > 15 UC --- разделить
- Если модуль содержит < 3 UC --- объединить с другим
- Каждый модуль = один Bounded Context
- UC001--UC099 зарезервированы для общесистемных функций (mod-common)
- Каждый модуль получает блок из 100 номеров

### Артефакт: Создание Module узлов в графе

После подтверждения пользователем --- создай Module узлы.

#### Шаг 2.1: Генерация ID для модулей

Формат ID: `mod-{code}` (код в snake_case, напр. `mod-orders`, `mod-catalog`).

#### Шаг 2.2: Создание каждого Module узла

Для каждого модуля выполни:

```cypher
// mcp__neo4j__write-cypher
MERGE (m:Module {id: $id})
SET m.name = $name,
    m.description = $description,
    m.uc_range_start = $uc_range_start,
    m.uc_range_end = $uc_range_end,
    m.status = 'draft',
    m.created = datetime()
```

Параметры:
- `$id` --- например `"mod-orders"`
- `$name` --- человекочитаемое название, например `"Управление заказами"`
- `$description` --- 1--2 предложения о назначении
- `$uc_range_start` --- начало диапазона UC (int), например `100`
- `$uc_range_end` --- конец диапазона UC (int), например `199`

#### Шаг 2.3: Создание SUGGESTS-рёбер (если есть ProcessGroup-источник)

Для каждого модуля, который соответствует ProcessGroup:

```cypher
// mcp__neo4j__write-cypher
MATCH (gpr:ProcessGroup {id: $gpr_id})
MATCH (m:Module {id: $module_id})
MERGE (gpr)-[:SUGGESTS]->(m)
```

#### Шаг 2.4: Верификация созданных модулей

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module)
OPTIONAL MATCH (gpr:ProcessGroup)-[:SUGGESTS]->(m)
RETURN m.id AS id, m.name AS name, m.description AS description,
       m.uc_range_start AS uc_start, m.uc_range_end AS uc_end,
       collect(gpr.name) AS source_process_groups
ORDER BY m.uc_range_start
```

Покажи пользователю таблицу:

```
**Phase 2: Модули записаны в граф**

| Модуль | ID | UC Range | Источник (ProcessGroup) |
|--------|----|----------|-------------------------|
| {name} | {id} | UC{start}-UC{end} | {gpr_names} |
| ...    | ...  | ...      | ...                     |

Всего модулей: {N}
```

### Переход

После подтверждения модульной декомпозиции -> Phase 3

---

## Phase 3: Context Map

**Цель:** Определить межмодульные зависимости и записать их в граф.

### Действия

На основе BA-данных из Phase 0 и модулей из Phase 2:

1. **Определи направления зависимостей:**
   - Какой модуль от какого зависит?
   - Кто владеет данными (CRUD)?
   - Кто только читает данные?

2. **Определи типы связей:**
   - `data_read` --- модуль читает справочники/сущности другого модуля
   - `operation_call` --- модуль инициирует бизнес-процесс в другом модуле
   - `event` --- модуль реагирует на изменения в другом модуле

3. **Определи общие сущности:**
   - Какие BusinessEntity из графа используются несколькими ProcessGroup?
   - Определи владельца и читателей

Для анализа общих сущностей выполни:

```cypher
// mcp__neo4j__read-cypher
MATCH (ws:WorkflowStep)-[:READS|PRODUCES|MODIFIES]->(be:BusinessEntity)
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws)
MATCH (gpr:ProcessGroup)-[:CONTAINS]->(bp)
RETURN be.id AS entity_id, be.name AS entity_name,
       collect(DISTINCT {gpr_id: gpr.id, gpr_name: gpr.name,
               rel_type: type((ws)-[:READS|PRODUCES|MODIFIES]->(be))}) AS used_by_groups
```

### Вопросы для пользователя

```
Я построил карту зависимостей между модулями:

{Текстовая таблица зависимостей}

Вопросы:
1. Правильно ли я определил направления зависимостей?
2. Есть ли зависимости, которые я пропустил?
3. Правильно ли определены владельцы общих сущностей?
```

### Артефакт: Создание межмодульных рёбер в графе

#### Шаг 3.1: Создание DEPENDS_ON рёбер между модулями

Для каждой зависимости:

```cypher
// mcp__neo4j__write-cypher
MATCH (m1:Module {id: $source_module_id})
MATCH (m2:Module {id: $target_module_id})
MERGE (m1)-[r:DEPENDS_ON]->(m2)
SET r.type = $dep_type,
    r.description = $description
```

Параметры:
- `$source_module_id` --- модуль-потребитель
- `$target_module_id` --- модуль-поставщик
- `$dep_type` --- `"data_read"`, `"operation_call"`, или `"event"`
- `$description` --- что передаётся (напр. `"Читает данные клиентов"`)

#### Шаг 3.2: Предварительное распределение BusinessEntity по модулям

На основе анализа владения --- создай предварительные CONTAINS_ENTITY-рёбра:

```cypher
// mcp__neo4j__write-cypher
MATCH (m:Module {id: $module_id})
MERGE (de:DomainEntity {id: $entity_id})
SET de.name = $entity_name,
    de.module = $module_id,
    de.status = 'draft',
    de.created = datetime()
MERGE (m)-[:CONTAINS_ENTITY]->(de)
```

Также создай BA-to-SA handoff-ребро:

```cypher
// mcp__neo4j__write-cypher
MATCH (be:BusinessEntity {id: $ba_entity_id})
MATCH (de:DomainEntity {id: $sa_entity_id})
MERGE (be)-[:REALIZED_AS]->(de)
```

#### Шаг 3.3: Верификация Context Map

```cypher
// mcp__neo4j__read-cypher
MATCH (m1:Module)-[r:DEPENDS_ON]->(m2:Module)
RETURN m1.name AS source, m2.name AS target,
       r.type AS dep_type, r.description AS description
ORDER BY m1.name, m2.name
```

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module)-[:CONTAINS_ENTITY]->(de:DomainEntity)
RETURN m.name AS module, collect({id: de.id, name: de.name}) AS entities
ORDER BY m.name
```

Покажи пользователю результат:

```
**Phase 3: Context Map записан в граф**

Зависимости:
| Источник | Приёмник | Тип | Описание |
|----------|----------|-----|----------|
| {source} | {target} | {type} | {desc} |

Распределение сущностей:
| Модуль | Сущности |
|--------|----------|
| {module} | {entity_list} |
```

### Переход

После подтверждения Context Map -> Phase 4

---

## Phase 4: NFR и технические ограничения

**Цель:** Зафиксировать нефункциональные требования как Requirement узлы в графе.

### Вопросы для пользователя

**Производительность:**
1. Сколько пользователей одновременно?
2. Требования к времени отклика?
3. Какие объёмы данных ожидаются?

**Интеграции:**
4. Нужна ли интеграция с внешними системами? (уточнить Phase 1)
5. Требования к API?
6. Импорт/экспорт?

**Безопасность:**
7. Требования к безопасности?
8. Многофакторная аутентификация?
9. Шифрование данных?

**Инфраструктура:**
10. Веб / мобильное / десктоп?
11. Предпочтения по технологиям?
12. Резервное копирование?

### Действия

1. Зафиксируй ответы
2. Предложи разумные значения по умолчанию для незаданных параметров
3. Классифицируй каждое NFR по категории

### Артефакт: Создание Requirement узлов в графе

#### Шаг 4.1: Генерация ID для NFR

Формат ID: `NFR-NNN` (глобальный последовательный счётчик).

Получи следующий свободный ID:

```cypher
// mcp__neo4j__read-cypher
MATCH (r:Requirement)
WHERE r.id STARTS WITH 'NFR-'
WITH max(toInteger(replace(r.id, 'NFR-', ''))) AS maxNum
RETURN 'NFR-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId
```

#### Шаг 4.2: Создание Requirement узлов

Для каждого NFR:

```cypher
// mcp__neo4j__write-cypher
MERGE (r:Requirement {id: $id})
SET r.description = $description,
    r.type = 'nfr',
    r.category = $category,
    r.priority = $priority,
    r.metric = $metric,
    r.target_value = $target_value,
    r.status = 'draft',
    r.created = datetime()
```

Параметры:
- `$id` --- например `"NFR-001"`
- `$description` --- текст требования, напр. `"Время отклика < 2 сек для 95-го перцентиля"`
- `$type` --- всегда `"nfr"`
- `$category` --- `"performance"`, `"security"`, `"integration"`, `"infrastructure"`
- `$priority` --- `"high"`, `"medium"`, `"low"`
- `$metric` --- метрика измерения (если применимо)
- `$target_value` --- целевое значение (если применимо)

#### Шаг 4.3: Привязка NFR к модулям (если NFR специфичен для модуля)

```cypher
// mcp__neo4j__write-cypher
MATCH (m:Module {id: $module_id})
MATCH (r:Requirement {id: $nfr_id})
MERGE (m)-[:HAS_REQUIREMENT]->(r)
```

Если NFR системный (применим ко всем модулям) --- не создавай привязку к конкретному модулю.

#### Шаг 4.4: Верификация NFR

```cypher
// mcp__neo4j__read-cypher
MATCH (r:Requirement {type: 'nfr'})
OPTIONAL MATCH (m:Module)-[:HAS_REQUIREMENT]->(r)
RETURN r.id AS id, r.description AS description, r.category AS category,
       r.priority AS priority, r.metric AS metric, r.target_value AS target_value,
       collect(m.name) AS applies_to_modules
ORDER BY r.category, r.id
```

Покажи пользователю результат:

```
**Phase 4: NFR записаны в граф**

| ID | Категория | Описание | Приоритет | Метрика | Модули |
|----|-----------|----------|-----------|---------|--------|
| {id} | {category} | {desc} | {priority} | {metric} | {modules} |

Всего NFR: {N}
```

---

## Завершение

### Режим `full`

После Phase 4:

1. **Финальная верификация графа:**

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
OPTIONAL MATCH (m)-[:DEPENDS_ON]->(dep:Module)
OPTIONAL MATCH (m)-[:HAS_REQUIREMENT]->(r:Requirement {type: 'nfr'})
RETURN m.id AS id, m.name AS name,
       m.uc_range_start AS uc_start, m.uc_range_end AS uc_end,
       count(DISTINCT de) AS entity_count,
       count(DISTINCT dep) AS dependency_count,
       count(DISTINCT r) AS nfr_count
ORDER BY m.uc_range_start
```

2. **Проверка handoff-покрытия:**

```cypher
// mcp__neo4j__read-cypher
MATCH (gpr:ProcessGroup)
OPTIONAL MATCH (gpr)-[:SUGGESTS]->(m:Module)
RETURN gpr.id AS gpr_id, gpr.name AS gpr_name,
       CASE WHEN m IS NULL THEN 'NO MODULE' ELSE m.name END AS module_name
```

3. **Покажи итоговую сводку:**

```
**Архитектурная декомпозиция завершена (в графе)**

| Модуль | ID | UC Range | Сущностей | Зависимостей | NFR |
|--------|----|----------|-----------|--------------|-----|
| {name} | {id} | UC{start}-UC{end} | {N} | {N} | {N} |

BA -> SA покрытие:
| ProcessGroup | Module |
|---|---|
| {gpr_name} | {module_name} |

NFR: {N} требований ({по категориям})

Следующие шаги:
1. `/graph_sa_domain` --- создать Domain Model для каждого модуля
2. `/graph_sa_roles` --- определить роли и матрицу прав
3. `/graph_sa_stories` --- создать Use Cases для модулей
```

### Режим `module`

После создания нового модуля:

1. Создай Module узел (Шаг 2.2)
2. Создай SUGGESTS-ребро при наличии ProcessGroup (Шаг 2.3)
3. Создай DEPENDS_ON рёбра к существующим модулям (Шаг 3.1)
4. Опционально --- предварительные CONTAINS_ENTITY (Шаг 3.2)
5. Покажи обновлённую сводку всех модулей

```
Модуль "{module_name}" добавлен в граф.

Следующие шаги:
1. `/graph_sa_domain` --- создать Domain Model для модуля {module_name}
2. `/graph_sa_stories` --- создать Use Cases для модуля {module_name}
```

---

## Работа с неполными ответами

Если пользователь не может ответить на все вопросы:

1. Зафиксируй то, что известно
2. Предложи разумные допущения с обоснованием:
   ```
   Допущение: Система будет веб-приложением с не более чем 100 одновременными пользователями.
   Обоснование: Типичный масштаб для B2B приложений данного типа.
   ```
3. Создай Requirement узел для допущения со статусом `assumption`:

```cypher
// mcp__neo4j__write-cypher
MERGE (r:Requirement {id: $id})
SET r.description = $description,
    r.type = 'assumption',
    r.status = 'needs_review',
    r.rationale = $rationale,
    r.created = datetime()
```

4. Продолжи работу с учётом допущений

---

## Чеклист /graph_sa_architect

Перед завершением работы проверь:

### Phase 0: BA-контекст
- [ ] ProcessGroup и BusinessProcess загружены из графа
- [ ] BusinessEntity загружены
- [ ] Automation scope (WorkflowStep) загружен
- [ ] SUGGESTS-рёбра (если есть) загружены
- [ ] BusinessRole загружены
- [ ] BusinessRule загружены

### Phase 1: Бизнес-контекст
- [ ] Бизнес-цели сформулированы
- [ ] Success criteria определены
- [ ] Scope определён (что входит, что НЕ входит)
- [ ] Пользователь подтвердил

### Phase 2: Модульная декомпозиция
- [ ] Module узлы созданы в графе (`MERGE`)
- [ ] Модулей от 3 до 8
- [ ] Диапазоны UC зарезервированы и не пересекаются
- [ ] SUGGESTS-рёбра от ProcessGroup созданы
- [ ] Верификация: все модули читаются из графа

### Phase 3: Context Map
- [ ] DEPENDS_ON рёбра между модулями созданы
- [ ] Типы зависимостей указаны (data_read / operation_call / event)
- [ ] Предварительные DomainEntity узлы созданы
- [ ] CONTAINS_ENTITY рёбра созданы
- [ ] REALIZED_AS рёбра (BA -> SA) созданы
- [ ] Верификация: Context Map читается из графа

### Phase 4: NFR
- [ ] Requirement узлы (type: 'nfr') созданы
- [ ] Категории: performance, security, integration, infrastructure
- [ ] Приоритеты расставлены
- [ ] Привязка к модулям (если специфичны)
- [ ] Верификация: NFR читаются из графа

### Общее
- [ ] Пользователь подтвердил каждую фазу
- [ ] Допущения задокументированы как Requirement (type: 'assumption')
- [ ] Финальная сводка показана
