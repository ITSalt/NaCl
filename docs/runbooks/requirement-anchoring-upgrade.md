# Апгрейд графа: привязка требований к реализующим их шагам/полям/формам (`REALIZED_BY`) — инструкция для агента

**Кому предназначено.** Эту инструкцию пользователь NaCl отдаёт агенту с чистым
контекстным окном в проекте, чей граф создан ДО релиза, добавившего ребро
`Requirement -[:REALIZED_BY]-> {ActivityStep | FormField | Form | Screen}`. В таком
графе `Requirement` связаны **только** с `UseCase`/`Module` (`HAS_REQUIREMENT`) и висят
над артефактами, которые их реализуют: невозможно ни проследить, какой шаг ломает какое
требование, ни закрыть покрытие.

**Что получится в конце.** Каждое функциональное/валидационное/поведенческое/интерфейсное
требование привязано к шагу/полю/форме, которая его реализует; `/nacl-sa-validate` проходит
без CRITICAL по L3.7; NFR (`type='nfr'`) и зарезервированные классы (`adr`/`question`)
остаются свободно висящими **by design**. Машинно-проставленные рёбра помечены
`provenance:'backfill'` — их видно и можно откатить.

---

## 0. Твоя роль и правила

Ты оркестратор. Тяжёлую работу (чтение графа, дерёвка кандидатов) делают сабагенты,
возвращая выжимку (counts, списки id), а не сырые дампы.

Правила, которые нельзя нарушать:

1. **Бэкап до первой записи.** APOC-экспорт графа или снапшот контейнера — обязательный
   шаг; точку отката укажи в финальном отчёте.
2. **verify-before-bulk.** Сначала на ОДНОМ UC: проставил якоря → scoped-прогон L3 →
   посмотрел глазами → только потом масштабируй.
3. **Никогда не пиши low-confidence якорь молча.** Неоднозначный кандидат (несколько
   шагов/полей) уходит в таблицу на доразметку человеку/тебе, а не угадывается. Неверная
   трассируемость хуже отсутствующей.
4. **Идемпотентность.** Все записи через `MERGE`/`coalesce`; повторный прогон — no-op.
5. **Git-дисциплина проекта** — по его CLAUDE.md. Ничего не пушь без явного запроса.

---

## 1. Шаг 0 — доступ, версия скиллов, бэкап

Сабагентом-разведчиком собери:

- Подключение к графу: MCP-neo4j или fallback `docker exec <neo4j-container> cypher-shell …`
  (имя контейнера и креды — из `graph-infra/` или config проекта).
- **Версия скиллов:** в `nacl-sa-validate/SKILL.md` должен существовать уровень **L3.7**
  (`REALIZED_BY`-anchor) и в его таблице обязательных фильтров — строка L3.7. Если нет —
  **СТОП**: сначала обнови скиллы, апгрейд графа старыми скиллами бессмыслен (валидатор не
  увидит новый инвариант).
- Сделай бэкап графа и зафиксируй его расположение.

---

## 2. Шаг 1 — нормализация дискриминатора класса (идемпотентно)

Валидатор читает класс требования как `coalesce(rq.rq_type, rq.req_type, rq.type, 'unknown')`.
Старые графы могли писать класс в `req_type` (значения `business`/`security`/`integrity`)
или вообще не задавать его. Приведи к каноническому `rq_type`, **не трогая** зарезервированные
`type ∈ {nfr, adr, question}`:

```cypher
// mcp__neo4j__write-cypher — выполнить один раз; повторный прогон no-op (rq_type уже задан)
MATCH (rq:Requirement)
WHERE rq.rq_type IS NULL
  AND NOT coalesce(rq.type,'') IN ['nfr','adr','question','assumption']
  AND (rq.req_type IS NOT NULL OR rq.type IS NOT NULL)
SET rq.rq_type = CASE
      WHEN rq.req_type IN ['functional','validation','behavioral','interface'] THEN rq.req_type
      WHEN rq.type    IN ['functional','validation','behavioral','interface'] THEN rq.type
      ELSE 'functional'   -- legacy business/security/integrity → must-anchor functional
    END                    --   (намеренно: всплывёт в L3.7, аналитик переклассифицирует валидационные)
RETURN coalesce(rq.req_type, rq.type) AS legacy, rq.rq_type AS canonical, count(*) AS n ORDER BY canonical;
```

Затем инвентаризация (read-only) — сколько требований какого класса, сколько уже привязано,
сколько освобождено:

```cypher
MATCH (rq:Requirement)
WITH rq, coalesce(rq.rq_type, rq.req_type, rq.type, 'unknown') AS cls,
     (coalesce(rq.type,'') IN ['nfr','adr','question','assumption'] OR coalesce(rq.rq_type, rq.req_type, rq.type,'') = 'nfr'
      OR coalesce(rq.anchor_exempt,false)) AS exempt
RETURN cls,
       count(*) AS total,
       sum(CASE WHEN exempt THEN 1 ELSE 0 END) AS exempt,
       sum(CASE WHEN EXISTS { (rq)-[:REALIZED_BY]->() } THEN 1 ELSE 0 END) AS anchored
ORDER BY cls;
```

Цель апгрейда: для каждого must-anchor класса `anchored + exempt = total`.

---

## 3. Шаг 2 — дерёвка якорей по уровням уверенности

Для каждого непривязанного must-anchor требования найди кандидатный артефакт. Сигналы уже
в графе: `rq.rq_type`, `rq.source`, шаги UC (`HAS_STEP`), формы и поля
(`USES_FORM`→`HAS_FIELD`), экраны (`HAS_SCREEN`/`RENDERS`).

**Валидационные** (`validation`) → `FormField`:

```cypher
MATCH (rq:Requirement)
WHERE coalesce(rq.rq_type, rq.req_type, rq.type,'unknown') = 'validation' AND NOT EXISTS { (rq)-[:REALIZED_BY]->() }
MATCH (uc:UseCase)-[:HAS_REQUIREMENT]->(rq)
OPTIONAL MATCH (uc)-[:USES_FORM]->(:Form)-[:HAS_FIELD]->(ff:FormField)
WITH rq, uc, collect(DISTINCT ff) AS fields
RETURN rq.id AS rq, uc.id AS uc, [f IN fields | f.id] AS candidate_fields, size(fields) AS n ORDER BY n;
```

**Интерфейсные** (`interface`) → `Form` (или `Screen` для formless):

```cypher
MATCH (rq:Requirement)
WHERE coalesce(rq.rq_type, rq.req_type, rq.type,'unknown') = 'interface' AND NOT EXISTS { (rq)-[:REALIZED_BY]->() }
MATCH (uc:UseCase)-[:HAS_REQUIREMENT]->(rq)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)
OPTIONAL MATCH (uc)-[:HAS_SCREEN]->(scr:Screen)
WITH rq, uc, collect(DISTINCT f) AS forms, collect(DISTINCT scr) AS screens
RETURN rq.id AS rq, uc.id AS uc, [x IN forms | x.id] AS forms, [x IN screens | x.id] AS screens,
       size(forms) AS nf, size(screens) AS ns ORDER BY nf;
```

**Поведенческие/функциональные** (`behavioral`/`functional`, в т.ч. `source='BRQ-*'`) → `ActivityStep`
(предпочтительно `System`-шаг, где правило применяется):

```cypher
MATCH (rq:Requirement)
WHERE coalesce(rq.rq_type, rq.req_type, rq.type,'unknown') IN ['behavioral','functional'] AND NOT EXISTS { (rq)-[:REALIZED_BY]->() }
MATCH (uc:UseCase)-[:HAS_REQUIREMENT]->(rq)
OPTIONAL MATCH (uc)-[:HAS_STEP]->(s:ActivityStep)
WHERE coalesce(s.actor, s.actor_type) = 'System'
WITH rq, uc, collect(DISTINCT s) AS steps
RETURN rq.id AS rq, uc.id AS uc, [x IN steps | x.id] AS candidate_steps, size(steps) AS n ORDER BY n;
```

Классификация уверенности:

| Уверенность | Условие | Действие |
|---|---|---|
| **high** | ровно один кандидат нужного типа (или однозначное совпадение поля по имени/тексту) | авто-MERGE ребра с `provenance:'backfill'` |
| **low** | несколько кандидатов — какой именно реализует, неоднозначно | **НЕ писать**; в таблицу на доразметку |
| **no-anchor** | у UC нет ни одного кандидата нужного типа | в таблицу; кандидат на `anchor_exempt` или на доспецификацию UC |

Запись high-confidence якоря (по одному разрешённому (требование, артефакт)):

```cypher
// mcp__neo4j__write-cypher
MATCH (rq:Requirement {id: $rqId})
MATCH (anchor {id: $anchorId})
WHERE $anchorLabel IN labels(anchor)        -- ActivityStep | FormField | Form | Screen
MERGE (rq)-[rel:REALIZED_BY]->(anchor)
ON CREATE SET rel.provenance = 'backfill', rel.confidence = 'high', rel.anchor_kind = $cls
RETURN rq.id AS rq, anchor.id AS anchor, $anchorLabel AS label;
```

Требование, реализуемое несколькими шагами, получает несколько рёбер (по одному на шаг).

---

## 4. Шаг 3 — остаток: ручная доразметка и легитимные исключения

- **low / no-anchor** из таблицы Шага 2: реши, какой артефакт реально реализует требование
  (читая текст требования и шаги/поля UC), и проставь то же ребро вручную тем же `MERGE`
  (можно `confidence:'manual'`).
- Редкое требование, которое действительно нечем привязать (сквозное функциональное без
  одного конкретного шага), помечай явным флагом — это единственный легитимный способ
  оставить must-anchor требование без ребра:

```cypher
// mcp__neo4j__write-cypher
MATCH (rq:Requirement {id: $rqId})
SET rq.anchor_exempt = true, rq.anchor_exempt_reason = $reason
RETURN rq.id;
```

Не злоупотребляй `anchor_exempt`: смещайся в сторону реальной привязки, чтобы валидатор
ловил настоящие гэпы.

---

## 5. Шаг 4 — верификация

- **verify-before-bulk:** после первого UC — scoped `/nacl-sa-validate` (L3); убедись, что
  L3.7 по этому UC чист и L3.7b (несоответствие типа цели) не сработал.
- В конце — полный `/nacl-sa-validate` (internal): **0 CRITICAL по L3.7**. Каждое must-anchor
  требование либо привязано, либо `anchor_exempt`. L3.8 (System-шаги без реализующего
  требования) — WARNING, фиксируй в журнал, не блокирует.
- Перепроверь инвентаризацию из Шага 2: для каждого must-anchor класса `anchored + exempt = total`.

---

## 6. Откат

Машинные рёбра помечены `provenance:'backfill'` и снимаются одной командой; ручные
(`authored`/`manual`) сохраняются фильтром:

```cypher
MATCH ()-[r:REALIZED_BY {provenance: 'backfill'}]->() DELETE r;
```

Нормализация `rq_type` и флаги `anchor_exempt` идемпотентны и безопасны; при полном откате
их можно не снимать (валидатор без L3.7 их игнорирует).

---

## 7. Definition of Done и отчёт

- [ ] Бэкап-точка графа указана.
- [ ] `rq_type` нормализован; зарезервированные `type` (`nfr`/`adr`/`question`) не тронуты.
- [ ] Инвентаризация до → после по классам: `anchored + exempt = total` для must-anchor.
- [ ] high-confidence рёбра проставлены (`provenance:'backfill'`); low/no-anchor — разрешены
      вручную или помечены `anchor_exempt` с причиной.
- [ ] `/nacl-sa-validate`: 0 CRITICAL по L3.7; список WARNING (включая L3.8) с планом.
- [ ] Список `anchor_exempt`-требований с причинами — отдельно, не потеряны.

Отчёт — компактный, со ссылками на узлы по id, без сырых дампов.
