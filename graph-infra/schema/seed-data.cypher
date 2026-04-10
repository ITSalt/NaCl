// =============================================================================
// Seed Data — Test Project: Order Management System (Управление заказами)
// =============================================================================
// File: graph-infra/schema/seed-data.cypher
// Task: TECH-007
//
// Layers: BA → SA → TL (full traceability)
// Execute statements in order. Each block can be run as a single transaction.
// =============================================================================


// =============================================================================
// BA LAYER
// =============================================================================

// ---------------------------------------------------------------------------
// ProcessGroups
// ---------------------------------------------------------------------------
CREATE (gpr1:ProcessGroup {id: "GPR-01", name: "Продажи", description: "Процессы продаж и работы с клиентами"})
CREATE (gpr2:ProcessGroup {id: "GPR-02", name: "Логистика", description: "Процессы складской логистики и отгрузки"});

// ---------------------------------------------------------------------------
// BusinessProcesses + CONTAINS edges
// ---------------------------------------------------------------------------
MATCH (gpr1:ProcessGroup {id: "GPR-01"})
CREATE (bp1:BusinessProcess {id: "BP-001", name: "Оформление заказа", description: "Полный цикл оформления заказа от заявки до подтверждения"})
CREATE (gpr1)-[:CONTAINS]->(bp1);

MATCH (gpr2:ProcessGroup {id: "GPR-02"})
CREATE (bp2:BusinessProcess {id: "BP-002", name: "Отгрузка", description: "Процесс комплектации и отгрузки товара клиенту"})
CREATE (bp3:BusinessProcess {id: "BP-003", name: "Возврат", description: "Процесс обработки возврата товара от клиента"})
CREATE (gpr2)-[:CONTAINS]->(bp2)
CREATE (gpr2)-[:CONTAINS]->(bp3);

// ---------------------------------------------------------------------------
// BusinessRoles
// ---------------------------------------------------------------------------
CREATE (rol1:BusinessRole {id: "ROL-01", full_name: "Менеджер по продажам", code: "MGR", department: "Продажи"})
CREATE (rol2:BusinessRole {id: "ROL-02", full_name: "Кладовщик", code: "WRK", department: "Склад"})
CREATE (rol3:BusinessRole {id: "ROL-03", full_name: "Бухгалтер", code: "ACC", department: "Бухгалтерия"});

// ---------------------------------------------------------------------------
// Role → Process ownership & participation
// ---------------------------------------------------------------------------
MATCH (rol1:BusinessRole {id: "ROL-01"}), (bp1:BusinessProcess {id: "BP-001"}), (bp3:BusinessProcess {id: "BP-003"})
CREATE (rol1)-[:OWNS]->(bp1)
CREATE (rol1)-[:PARTICIPATES_IN]->(bp3);

MATCH (rol2:BusinessRole {id: "ROL-02"}), (bp2:BusinessProcess {id: "BP-002"}), (bp3:BusinessProcess {id: "BP-003"})
CREATE (rol2)-[:OWNS]->(bp2)
CREATE (rol2)-[:PARTICIPATES_IN]->(bp3);

// ---------------------------------------------------------------------------
// BusinessEntities
// ---------------------------------------------------------------------------
CREATE (obj1:BusinessEntity {id: "OBJ-001", name: "Заказ", type: "Бизнес-объект", description: "Заказ клиента на поставку товаров"})
CREATE (obj2:BusinessEntity {id: "OBJ-002", name: "Позиция заказа", type: "Бизнес-объект", description: "Строка заказа с информацией о товаре и количестве"})
CREATE (obj3:BusinessEntity {id: "OBJ-003", name: "Клиент", type: "Бизнес-объект", description: "Юридическое или физическое лицо — покупатель"})
CREATE (obj4:BusinessEntity {id: "OBJ-004", name: "Товар", type: "Бизнес-объект", description: "Товарная единица на складе"})
CREATE (obj5:BusinessEntity {id: "OBJ-005", name: "Заявка клиента", type: "Внешний документ", description: "Входящий документ от клиента с запросом на товар"});

// ---------------------------------------------------------------------------
// EntityAttributes — OBJ-001 (Заказ): 5 атрибутов
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity {id: "OBJ-001"})
CREATE (a1:EntityAttribute {id: "OBJ-001-A01", name: "orderNumber", data_type: "Текст", description: "Номер заказа"})
CREATE (a2:EntityAttribute {id: "OBJ-001-A02", name: "orderDate", data_type: "Дата", description: "Дата оформления"})
CREATE (a3:EntityAttribute {id: "OBJ-001-A03", name: "totalAmount", data_type: "Число", description: "Сумма заказа"})
CREATE (a4:EntityAttribute {id: "OBJ-001-A04", name: "customer", data_type: "Ссылка", description: "Ссылка на клиента"})
CREATE (a5:EntityAttribute {id: "OBJ-001-A05", name: "status", data_type: "Перечисление", description: "Статус заказа"})
CREATE (e)-[:HAS_ATTRIBUTE]->(a1)
CREATE (e)-[:HAS_ATTRIBUTE]->(a2)
CREATE (e)-[:HAS_ATTRIBUTE]->(a3)
CREATE (e)-[:HAS_ATTRIBUTE]->(a4)
CREATE (e)-[:HAS_ATTRIBUTE]->(a5);

// ---------------------------------------------------------------------------
// EntityAttributes — OBJ-002 (Позиция заказа): 3 атрибута
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity {id: "OBJ-002"})
CREATE (a1:EntityAttribute {id: "OBJ-002-A01", name: "quantity", data_type: "Число", description: "Количество"})
CREATE (a2:EntityAttribute {id: "OBJ-002-A02", name: "unitPrice", data_type: "Число", description: "Цена за единицу"})
CREATE (a3:EntityAttribute {id: "OBJ-002-A03", name: "product", data_type: "Ссылка", description: "Ссылка на товар"})
CREATE (e)-[:HAS_ATTRIBUTE]->(a1)
CREATE (e)-[:HAS_ATTRIBUTE]->(a2)
CREATE (e)-[:HAS_ATTRIBUTE]->(a3);

// ---------------------------------------------------------------------------
// EntityAttributes — OBJ-003 (Клиент): 4 атрибута
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity {id: "OBJ-003"})
CREATE (a1:EntityAttribute {id: "OBJ-003-A01", name: "name", data_type: "Текст", description: "Наименование клиента"})
CREATE (a2:EntityAttribute {id: "OBJ-003-A02", name: "phone", data_type: "Текст", description: "Телефон"})
CREATE (a3:EntityAttribute {id: "OBJ-003-A03", name: "email", data_type: "Текст", description: "Электронная почта"})
CREATE (a4:EntityAttribute {id: "OBJ-003-A04", name: "inn", data_type: "Текст", description: "ИНН"})
CREATE (e)-[:HAS_ATTRIBUTE]->(a1)
CREATE (e)-[:HAS_ATTRIBUTE]->(a2)
CREATE (e)-[:HAS_ATTRIBUTE]->(a3)
CREATE (e)-[:HAS_ATTRIBUTE]->(a4);

// ---------------------------------------------------------------------------
// EntityAttributes — OBJ-004 (Товар): 4 атрибута
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity {id: "OBJ-004"})
CREATE (a1:EntityAttribute {id: "OBJ-004-A01", name: "sku", data_type: "Текст", description: "Артикул"})
CREATE (a2:EntityAttribute {id: "OBJ-004-A02", name: "name", data_type: "Текст", description: "Наименование товара"})
CREATE (a3:EntityAttribute {id: "OBJ-004-A03", name: "price", data_type: "Число", description: "Цена"})
CREATE (a4:EntityAttribute {id: "OBJ-004-A04", name: "stockQuantity", data_type: "Число", description: "Остаток на складе"})
CREATE (e)-[:HAS_ATTRIBUTE]->(a1)
CREATE (e)-[:HAS_ATTRIBUTE]->(a2)
CREATE (e)-[:HAS_ATTRIBUTE]->(a3)
CREATE (e)-[:HAS_ATTRIBUTE]->(a4);

// ---------------------------------------------------------------------------
// EntityAttributes — OBJ-005 (Заявка клиента): 3 атрибута
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity {id: "OBJ-005"})
CREATE (a1:EntityAttribute {id: "OBJ-005-A01", name: "requestDate", data_type: "Дата", description: "Дата заявки"})
CREATE (a2:EntityAttribute {id: "OBJ-005-A02", name: "requestNumber", data_type: "Текст", description: "Номер заявки"})
CREATE (a3:EntityAttribute {id: "OBJ-005-A03", name: "items", data_type: "Текст", description: "Перечень запрошенных позиций"})
CREATE (e)-[:HAS_ATTRIBUTE]->(a1)
CREATE (e)-[:HAS_ATTRIBUTE]->(a2)
CREATE (e)-[:HAS_ATTRIBUTE]->(a3);

// ---------------------------------------------------------------------------
// Entity RELATES_TO edges
// ---------------------------------------------------------------------------
MATCH (obj1:BusinessEntity {id: "OBJ-001"}), (obj2:BusinessEntity {id: "OBJ-002"})
CREATE (obj1)-[:RELATES_TO {rel_type: "агрегация", cardinality: "1:N"}]->(obj2);

MATCH (obj1:BusinessEntity {id: "OBJ-001"}), (obj3:BusinessEntity {id: "OBJ-003"})
CREATE (obj1)-[:RELATES_TO {rel_type: "ассоциация", cardinality: "N:1"}]->(obj3);

MATCH (obj2:BusinessEntity {id: "OBJ-002"}), (obj4:BusinessEntity {id: "OBJ-004"})
CREATE (obj2)-[:RELATES_TO {rel_type: "ассоциация", cardinality: "N:1"}]->(obj4);

// ---------------------------------------------------------------------------
// EntityStates for OBJ-001 (Заказ): 3 состояния
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity {id: "OBJ-001"})
CREATE (s1:EntityState {id: "OBJ-001-ST01", name: "Новый", description: "Заказ только создан"})
CREATE (s2:EntityState {id: "OBJ-001-ST02", name: "Подтверждён", description: "Заказ подтверждён менеджером"})
CREATE (s3:EntityState {id: "OBJ-001-ST03", name: "Отгружен", description: "Заказ отгружен со склада"})
CREATE (e)-[:HAS_STATE]->(s1)
CREATE (e)-[:HAS_STATE]->(s2)
CREATE (e)-[:HAS_STATE]->(s3)
CREATE (s1)-[:TRANSITIONS_TO {condition: "Менеджер подтверждает"}]->(s2)
CREATE (s2)-[:TRANSITIONS_TO {condition: "Кладовщик отгружает"}]->(s3);

// ---------------------------------------------------------------------------
// WorkflowSteps for BP-001 (Оформление заказа): 4 шага
// ---------------------------------------------------------------------------
MATCH (bp:BusinessProcess {id: "BP-001"}), (rol1:BusinessRole {id: "ROL-01"})
CREATE (s1:WorkflowStep {id: "BP-001-S01", function_name: "Получить заявку от клиента", stereotype: "Бизнес-функция", step_number: 1})
CREATE (s2:WorkflowStep {id: "BP-001-S02", function_name: "Проверить наличие товара", stereotype: "Бизнес-функция", step_number: 2})
CREATE (s3:WorkflowStep {id: "BP-001-S03", function_name: "Создать заказ в системе", stereotype: "Автоматизируется", step_number: 3})
CREATE (s4:WorkflowStep {id: "BP-001-S04", function_name: "Подтвердить заказ", stereotype: "Автоматизируется", step_number: 4})
CREATE (bp)-[:HAS_STEP {order: 1}]->(s1)
CREATE (bp)-[:HAS_STEP {order: 2}]->(s2)
CREATE (bp)-[:HAS_STEP {order: 3}]->(s3)
CREATE (bp)-[:HAS_STEP {order: 4}]->(s4)
CREATE (s1)-[:NEXT_STEP]->(s2)
CREATE (s2)-[:NEXT_STEP]->(s3)
CREATE (s3)-[:NEXT_STEP]->(s4)
CREATE (s1)-[:PERFORMED_BY]->(rol1)
CREATE (s2)-[:PERFORMED_BY]->(rol1)
CREATE (s3)-[:PERFORMED_BY]->(rol1)
CREATE (s4)-[:PERFORMED_BY]->(rol1);

// ---------------------------------------------------------------------------
// WorkflowStep READS/PRODUCES/MODIFIES edges for BP-001
// ---------------------------------------------------------------------------
MATCH (s1:WorkflowStep {id: "BP-001-S01"}), (obj5:BusinessEntity {id: "OBJ-005"})
CREATE (s1)-[:READS]->(obj5);

MATCH (s3:WorkflowStep {id: "BP-001-S03"}), (obj1:BusinessEntity {id: "OBJ-001"})
CREATE (s3)-[:PRODUCES]->(obj1);

MATCH (s4:WorkflowStep {id: "BP-001-S04"}), (obj1:BusinessEntity {id: "OBJ-001"})
CREATE (s4)-[:MODIFIES]->(obj1);

// ---------------------------------------------------------------------------
// WorkflowSteps for BP-002 (Отгрузка): 4 шага
// ---------------------------------------------------------------------------
MATCH (bp:BusinessProcess {id: "BP-002"}), (rol2:BusinessRole {id: "ROL-02"})
CREATE (s1:WorkflowStep {id: "BP-002-S01", function_name: "Получить заказ на отгрузку", stereotype: "Бизнес-функция", step_number: 1})
CREATE (s2:WorkflowStep {id: "BP-002-S02", function_name: "Скомплектовать товар", stereotype: "Бизнес-функция", step_number: 2})
CREATE (s3:WorkflowStep {id: "BP-002-S03", function_name: "Оформить отгрузку в системе", stereotype: "Автоматизируется", step_number: 3})
CREATE (s4:WorkflowStep {id: "BP-002-S04", function_name: "Передать клиенту", stereotype: "Бизнес-функция", step_number: 4})
CREATE (bp)-[:HAS_STEP {order: 1}]->(s1)
CREATE (bp)-[:HAS_STEP {order: 2}]->(s2)
CREATE (bp)-[:HAS_STEP {order: 3}]->(s3)
CREATE (bp)-[:HAS_STEP {order: 4}]->(s4)
CREATE (s1)-[:NEXT_STEP]->(s2)
CREATE (s2)-[:NEXT_STEP]->(s3)
CREATE (s3)-[:NEXT_STEP]->(s4)
CREATE (s1)-[:PERFORMED_BY]->(rol2)
CREATE (s2)-[:PERFORMED_BY]->(rol2)
CREATE (s3)-[:PERFORMED_BY]->(rol2)
CREATE (s4)-[:PERFORMED_BY]->(rol2);

// ---------------------------------------------------------------------------
// BusinessRules
// ---------------------------------------------------------------------------
CREATE (brq1:BusinessRule {id: "BRQ-001", name: "Минимальная сумма заказа", type: "constraint", formulation: "Сумма заказа >= 1000 руб", description: "Ограничение минимальной суммы заказа"})
CREATE (brq2:BusinessRule {id: "BRQ-002", name: "Расчёт суммы позиции", type: "calculation", formulation: "сумма = количество × цена", description: "Формула расчёта суммы строки заказа"})
CREATE (brq3:BusinessRule {id: "BRQ-003", name: "Наличие на складе", type: "invariant", formulation: "Количество в заказе <= остаток на складе", description: "Проверка наличия товара"})
CREATE (brq4:BusinessRule {id: "BRQ-004", name: "Подтверждение менеджером", type: "authorization", formulation: "Только менеджер может подтвердить заказ", description: "Правило авторизации подтверждения"})
CREATE (brq5:BusinessRule {id: "BRQ-005", name: "Уникальность номера заказа", type: "constraint", formulation: "Номер заказа уникален в системе", description: "Ограничение уникальности номера"});

// ---------------------------------------------------------------------------
// BusinessRule edges: CONSTRAINS / APPLIES_IN
// ---------------------------------------------------------------------------
MATCH (brq1:BusinessRule {id: "BRQ-001"}), (obj1:BusinessEntity {id: "OBJ-001"})
CREATE (brq1)-[:CONSTRAINS]->(obj1);

MATCH (brq2:BusinessRule {id: "BRQ-002"}), (obj2:BusinessEntity {id: "OBJ-002"})
CREATE (brq2)-[:CONSTRAINS]->(obj2);

MATCH (brq3:BusinessRule {id: "BRQ-003"}), (obj4:BusinessEntity {id: "OBJ-004"})
CREATE (brq3)-[:CONSTRAINS]->(obj4);

MATCH (brq4:BusinessRule {id: "BRQ-004"}), (bp1:BusinessProcess {id: "BP-001"})
CREATE (brq4)-[:APPLIES_IN]->(bp1);

MATCH (brq5:BusinessRule {id: "BRQ-005"}), (obj1:BusinessEntity {id: "OBJ-001"})
CREATE (brq5)-[:CONSTRAINS]->(obj1);

// ---------------------------------------------------------------------------
// GlossaryTerms
// ---------------------------------------------------------------------------
CREATE (gt1:GlossaryTerm {id: "GT-001", term: "Заказ", definition: "Документ, фиксирующий намерение клиента приобрести товар", synonyms: "Order, ордер"})
CREATE (gt2:GlossaryTerm {id: "GT-002", term: "Позиция заказа", definition: "Строка заказа с указанием товара и количества", synonyms: "OrderItem, строка заказа"})
CREATE (gt3:GlossaryTerm {id: "GT-003", term: "Клиент", definition: "Юридическое или физическое лицо — контрагент", synonyms: "Customer, покупатель"})
CREATE (gt4:GlossaryTerm {id: "GT-004", term: "Отгрузка", definition: "Процесс физической передачи товара клиенту", synonyms: "Shipment"})
CREATE (gt5:GlossaryTerm {id: "GT-005", term: "Заявка", definition: "Входящий запрос клиента на поставку товара", synonyms: "Request"});

// ---------------------------------------------------------------------------
// GlossaryTerm DEFINES edges
// ---------------------------------------------------------------------------
MATCH (gt1:GlossaryTerm {id: "GT-001"}), (obj1:BusinessEntity {id: "OBJ-001"})
CREATE (gt1)-[:DEFINES]->(obj1);

MATCH (gt2:GlossaryTerm {id: "GT-002"}), (obj2:BusinessEntity {id: "OBJ-002"})
CREATE (gt2)-[:DEFINES]->(obj2);

MATCH (gt3:GlossaryTerm {id: "GT-003"}), (obj3:BusinessEntity {id: "OBJ-003"})
CREATE (gt3)-[:DEFINES]->(obj3);

MATCH (gt5:GlossaryTerm {id: "GT-005"}), (obj5:BusinessEntity {id: "OBJ-005"})
CREATE (gt5)-[:DEFINES]->(obj5);


// =============================================================================
// SA LAYER
// =============================================================================

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------
CREATE (mod1:Module {id: "mod-orders", name: "orders", description: "Модуль управления заказами"})
CREATE (mod2:Module {id: "mod-logistics", name: "logistics", description: "Модуль логистики и отгрузки"});

// ---------------------------------------------------------------------------
// UseCases
// ---------------------------------------------------------------------------
MATCH (mod1:Module {id: "mod-orders"})
CREATE (uc101:UseCase {id: "UC-101", name: "Создать заказ", actor: "OrderManager", priority: "High", uc_type: "primary", description: "Создание нового заказа в системе"})
CREATE (uc102:UseCase {id: "UC-102", name: "Подтвердить заказ", actor: "OrderManager", priority: "High", uc_type: "primary", description: "Подтверждение существующего заказа менеджером"})
CREATE (mod1)-[:CONTAINS_UC]->(uc101)
CREATE (mod1)-[:CONTAINS_UC]->(uc102);

MATCH (mod2:Module {id: "mod-logistics"})
CREATE (uc201:UseCase {id: "UC-201", name: "Оформить отгрузку", actor: "WarehouseOperator", priority: "Medium", uc_type: "primary", description: "Оформление отгрузки товара со склада"})
CREATE (mod2)-[:CONTAINS_UC]->(uc201);

// ---------------------------------------------------------------------------
// ActivitySteps for UC-101 (4 steps)
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: "UC-101"})
CREATE (as1:ActivityStep {id: "UC-101-AS01", description: "Открыть форму создания заказа", actor_type: "User", step_number: 1})
CREATE (as2:ActivityStep {id: "UC-101-AS02", description: "Заполнить данные заказа", actor_type: "User", step_number: 2})
CREATE (as3:ActivityStep {id: "UC-101-AS03", description: "Система валидирует данные", actor_type: "System", step_number: 3})
CREATE (as4:ActivityStep {id: "UC-101-AS04", description: "Система сохраняет заказ", actor_type: "System", step_number: 4})
CREATE (uc)-[:HAS_STEP {order: 1}]->(as1)
CREATE (uc)-[:HAS_STEP {order: 2}]->(as2)
CREATE (uc)-[:HAS_STEP {order: 3}]->(as3)
CREATE (uc)-[:HAS_STEP {order: 4}]->(as4);

// ---------------------------------------------------------------------------
// ActivitySteps for UC-102 (3 steps)
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: "UC-102"})
CREATE (as1:ActivityStep {id: "UC-102-AS01", description: "Открыть заказ", actor_type: "User", step_number: 1})
CREATE (as2:ActivityStep {id: "UC-102-AS02", description: "Нажать Подтвердить", actor_type: "User", step_number: 2})
CREATE (as3:ActivityStep {id: "UC-102-AS03", description: "Система меняет статус", actor_type: "System", step_number: 3})
CREATE (uc)-[:HAS_STEP {order: 1}]->(as1)
CREATE (uc)-[:HAS_STEP {order: 2}]->(as2)
CREATE (uc)-[:HAS_STEP {order: 3}]->(as3);

// ---------------------------------------------------------------------------
// DomainEntities
// ---------------------------------------------------------------------------
MATCH (mod1:Module {id: "mod-orders"})
CREATE (de1:DomainEntity {id: "DE-Order", name: "Order", module: "orders", description: "Заказ"})
CREATE (de2:DomainEntity {id: "DE-OrderItem", name: "OrderItem", module: "orders", description: "Позиция заказа"})
CREATE (de3:DomainEntity {id: "DE-Customer", name: "Customer", module: "orders", description: "Клиент"})
CREATE (de4:DomainEntity {id: "DE-Product", name: "Product", module: "orders", description: "Товар"})
CREATE (mod1)-[:CONTAINS_ENTITY]->(de1)
CREATE (mod1)-[:CONTAINS_ENTITY]->(de2)
CREATE (mod1)-[:CONTAINS_ENTITY]->(de3)
CREATE (mod1)-[:CONTAINS_ENTITY]->(de4);

MATCH (mod2:Module {id: "mod-logistics"})
CREATE (de5:DomainEntity {id: "DE-Shipment", name: "Shipment", module: "logistics", description: "Отгрузка"})
CREATE (mod2)-[:CONTAINS_ENTITY]->(de5);

// ---------------------------------------------------------------------------
// DomainAttributes — Order: 5 attributes
// ---------------------------------------------------------------------------
MATCH (de:DomainEntity {id: "DE-Order"})
CREATE (da1:DomainAttribute {id: "Order-A01", name: "id", data_type: "UUID", nullable: false, description: "Primary key"})
CREATE (da2:DomainAttribute {id: "Order-A02", name: "orderNumber", data_type: "String", nullable: false, description: "Номер заказа"})
CREATE (da3:DomainAttribute {id: "Order-A03", name: "orderDate", data_type: "DateTime", nullable: false, description: "Дата заказа"})
CREATE (da4:DomainAttribute {id: "Order-A04", name: "totalAmount", data_type: "Decimal", nullable: false, description: "Сумма заказа"})
CREATE (da5:DomainAttribute {id: "Order-A05", name: "status", data_type: "Enum", nullable: false, description: "Статус заказа"})
CREATE (de)-[:HAS_ATTRIBUTE]->(da1)
CREATE (de)-[:HAS_ATTRIBUTE]->(da2)
CREATE (de)-[:HAS_ATTRIBUTE]->(da3)
CREATE (de)-[:HAS_ATTRIBUTE]->(da4)
CREATE (de)-[:HAS_ATTRIBUTE]->(da5);

// ---------------------------------------------------------------------------
// DomainAttributes — OrderItem: 3 attributes
// ---------------------------------------------------------------------------
MATCH (de:DomainEntity {id: "DE-OrderItem"})
CREATE (da1:DomainAttribute {id: "OrderItem-A01", name: "id", data_type: "UUID", nullable: false, description: "Primary key"})
CREATE (da2:DomainAttribute {id: "OrderItem-A02", name: "quantity", data_type: "Int", nullable: false, description: "Количество"})
CREATE (da3:DomainAttribute {id: "OrderItem-A03", name: "unitPrice", data_type: "Decimal", nullable: false, description: "Цена за единицу"})
CREATE (de)-[:HAS_ATTRIBUTE]->(da1)
CREATE (de)-[:HAS_ATTRIBUTE]->(da2)
CREATE (de)-[:HAS_ATTRIBUTE]->(da3);

// ---------------------------------------------------------------------------
// DomainAttributes — Customer: 5 attributes
// ---------------------------------------------------------------------------
MATCH (de:DomainEntity {id: "DE-Customer"})
CREATE (da1:DomainAttribute {id: "Customer-A01", name: "id", data_type: "UUID", nullable: false, description: "Primary key"})
CREATE (da2:DomainAttribute {id: "Customer-A02", name: "name", data_type: "String", nullable: false, description: "Наименование"})
CREATE (da3:DomainAttribute {id: "Customer-A03", name: "phone", data_type: "String", nullable: true, description: "Телефон"})
CREATE (da4:DomainAttribute {id: "Customer-A04", name: "email", data_type: "String", nullable: true, description: "Email"})
CREATE (da5:DomainAttribute {id: "Customer-A05", name: "inn", data_type: "String", nullable: true, description: "ИНН"})
CREATE (de)-[:HAS_ATTRIBUTE]->(da1)
CREATE (de)-[:HAS_ATTRIBUTE]->(da2)
CREATE (de)-[:HAS_ATTRIBUTE]->(da3)
CREATE (de)-[:HAS_ATTRIBUTE]->(da4)
CREATE (de)-[:HAS_ATTRIBUTE]->(da5);

// ---------------------------------------------------------------------------
// DomainAttributes — Product: 5 attributes
// ---------------------------------------------------------------------------
MATCH (de:DomainEntity {id: "DE-Product"})
CREATE (da1:DomainAttribute {id: "Product-A01", name: "id", data_type: "UUID", nullable: false, description: "Primary key"})
CREATE (da2:DomainAttribute {id: "Product-A02", name: "sku", data_type: "String", nullable: false, description: "Артикул"})
CREATE (da3:DomainAttribute {id: "Product-A03", name: "name", data_type: "String", nullable: false, description: "Наименование"})
CREATE (da4:DomainAttribute {id: "Product-A04", name: "price", data_type: "Decimal", nullable: false, description: "Цена"})
CREATE (da5:DomainAttribute {id: "Product-A05", name: "stockQuantity", data_type: "Int", nullable: false, description: "Остаток на складе"})
CREATE (de)-[:HAS_ATTRIBUTE]->(da1)
CREATE (de)-[:HAS_ATTRIBUTE]->(da2)
CREATE (de)-[:HAS_ATTRIBUTE]->(da3)
CREATE (de)-[:HAS_ATTRIBUTE]->(da4)
CREATE (de)-[:HAS_ATTRIBUTE]->(da5);

// ---------------------------------------------------------------------------
// DomainAttributes — Shipment: 3 attributes
// ---------------------------------------------------------------------------
MATCH (de:DomainEntity {id: "DE-Shipment"})
CREATE (da1:DomainAttribute {id: "Shipment-A01", name: "id", data_type: "UUID", nullable: false, description: "Primary key"})
CREATE (da2:DomainAttribute {id: "Shipment-A02", name: "shipmentDate", data_type: "DateTime", nullable: false, description: "Дата отгрузки"})
CREATE (da3:DomainAttribute {id: "Shipment-A03", name: "shipmentType", data_type: "Enum", nullable: false, description: "Тип отгрузки"})
CREATE (de)-[:HAS_ATTRIBUTE]->(da1)
CREATE (de)-[:HAS_ATTRIBUTE]->(da2)
CREATE (de)-[:HAS_ATTRIBUTE]->(da3);

// ---------------------------------------------------------------------------
// DomainEntity relationships
// ---------------------------------------------------------------------------
MATCH (de1:DomainEntity {id: "DE-Order"}), (de2:DomainEntity {id: "DE-OrderItem"})
CREATE (de1)-[:RELATES_TO {rel_type: "composition", cardinality: "1:N"}]->(de2);

MATCH (de1:DomainEntity {id: "DE-Order"}), (de3:DomainEntity {id: "DE-Customer"})
CREATE (de1)-[:RELATES_TO {rel_type: "association", cardinality: "N:1"}]->(de3);

MATCH (de2:DomainEntity {id: "DE-OrderItem"}), (de4:DomainEntity {id: "DE-Product"})
CREATE (de2)-[:RELATES_TO {rel_type: "association", cardinality: "N:1"}]->(de4);

MATCH (de5:DomainEntity {id: "DE-Shipment"}), (de1:DomainEntity {id: "DE-Order"})
CREATE (de5)-[:RELATES_TO {rel_type: "association", cardinality: "N:1"}]->(de1);

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------
CREATE (en1:Enumeration {id: "ENUM-OrderStatus", name: "OrderStatus", description: "Статусы заказа"})
CREATE (ev1:EnumValue {id: "ENUM-OrderStatus-V01", value: "NEW", description: "Новый"})
CREATE (ev2:EnumValue {id: "ENUM-OrderStatus-V02", value: "CONFIRMED", description: "Подтверждён"})
CREATE (ev3:EnumValue {id: "ENUM-OrderStatus-V03", value: "SHIPPED", description: "Отгружен"})
CREATE (en1)-[:HAS_VALUE]->(ev1)
CREATE (en1)-[:HAS_VALUE]->(ev2)
CREATE (en1)-[:HAS_VALUE]->(ev3);

CREATE (en2:Enumeration {id: "ENUM-ShipmentType", name: "ShipmentType", description: "Типы отгрузки"})
CREATE (ev4:EnumValue {id: "ENUM-ShipmentType-V01", value: "DELIVERY", description: "Доставка"})
CREATE (ev5:EnumValue {id: "ENUM-ShipmentType-V02", value: "PICKUP", description: "Самовывоз"})
CREATE (en2)-[:HAS_VALUE]->(ev4)
CREATE (en2)-[:HAS_VALUE]->(ev5);

// ---------------------------------------------------------------------------
// DomainEntity → Enumeration edges
// ---------------------------------------------------------------------------
MATCH (de:DomainEntity {id: "DE-Order"}), (en:Enumeration {id: "ENUM-OrderStatus"})
CREATE (de)-[:HAS_ENUM]->(en);

MATCH (de:DomainEntity {id: "DE-Shipment"}), (en:Enumeration {id: "ENUM-ShipmentType"})
CREATE (de)-[:HAS_ENUM]->(en);

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
CREATE (f1:Form {id: "FORM-OrderCreate", name: "OrderCreateForm", form_type: "create", description: "Форма создания заказа"})
CREATE (f2:Form {id: "FORM-OrderList", name: "OrderListForm", form_type: "list", description: "Список заказов"})
CREATE (f3:Form {id: "FORM-Shipment", name: "ShipmentForm", form_type: "create", description: "Форма оформления отгрузки"});

// ---------------------------------------------------------------------------
// FormFields — OrderCreateForm: 5 fields
// ---------------------------------------------------------------------------
MATCH (f:Form {id: "FORM-OrderCreate"})
CREATE (ff1:FormField {id: "FF-OC-01", name: "customerSelect", field_type: "select", label: "Клиент", required: true})
CREATE (ff2:FormField {id: "FF-OC-02", name: "orderDate", field_type: "date", label: "Дата заказа", required: true})
CREATE (ff3:FormField {id: "FF-OC-03", name: "itemsTable", field_type: "table", label: "Позиции заказа", required: true})
CREATE (ff4:FormField {id: "FF-OC-04", name: "totalAmount", field_type: "number", label: "Итого", required: false})
CREATE (ff5:FormField {id: "FF-OC-05", name: "submitButton", field_type: "button", label: "Создать заказ", required: false})
CREATE (f)-[:HAS_FIELD]->(ff1)
CREATE (f)-[:HAS_FIELD]->(ff2)
CREATE (f)-[:HAS_FIELD]->(ff3)
CREATE (f)-[:HAS_FIELD]->(ff4)
CREATE (f)-[:HAS_FIELD]->(ff5);

// ---------------------------------------------------------------------------
// FormFields — OrderListForm: 3 fields
// ---------------------------------------------------------------------------
MATCH (f:Form {id: "FORM-OrderList"})
CREATE (ff1:FormField {id: "FF-OL-01", name: "filterStatus", field_type: "select", label: "Фильтр по статусу", required: false})
CREATE (ff2:FormField {id: "FF-OL-02", name: "searchInput", field_type: "text", label: "Поиск", required: false})
CREATE (ff3:FormField {id: "FF-OL-03", name: "dataTable", field_type: "table", label: "Таблица заказов", required: false})
CREATE (f)-[:HAS_FIELD]->(ff1)
CREATE (f)-[:HAS_FIELD]->(ff2)
CREATE (f)-[:HAS_FIELD]->(ff3);

// ---------------------------------------------------------------------------
// FormFields — ShipmentForm: 4 fields
// ---------------------------------------------------------------------------
MATCH (f:Form {id: "FORM-Shipment"})
CREATE (ff1:FormField {id: "FF-SF-01", name: "orderSelect", field_type: "select", label: "Заказ", required: true})
CREATE (ff2:FormField {id: "FF-SF-02", name: "shipmentDate", field_type: "date", label: "Дата отгрузки", required: true})
CREATE (ff3:FormField {id: "FF-SF-03", name: "shipmentType", field_type: "select", label: "Тип отгрузки", required: true})
CREATE (ff4:FormField {id: "FF-SF-04", name: "submitButton", field_type: "button", label: "Оформить отгрузку", required: false})
CREATE (f)-[:HAS_FIELD]->(ff1)
CREATE (f)-[:HAS_FIELD]->(ff2)
CREATE (f)-[:HAS_FIELD]->(ff3)
CREATE (f)-[:HAS_FIELD]->(ff4);

// ---------------------------------------------------------------------------
// FormField MAPS_TO DomainAttribute
// ---------------------------------------------------------------------------
MATCH (ff:FormField {id: "FF-OC-01"}), (da:DomainAttribute {id: "Customer-A02"})
CREATE (ff)-[:MAPS_TO]->(da);

MATCH (ff:FormField {id: "FF-OC-02"}), (da:DomainAttribute {id: "Order-A03"})
CREATE (ff)-[:MAPS_TO]->(da);

MATCH (ff:FormField {id: "FF-OC-04"}), (da:DomainAttribute {id: "Order-A04"})
CREATE (ff)-[:MAPS_TO]->(da);

MATCH (ff:FormField {id: "FF-OL-01"}), (da:DomainAttribute {id: "Order-A05"})
CREATE (ff)-[:MAPS_TO]->(da);

MATCH (ff:FormField {id: "FF-SF-01"}), (da:DomainAttribute {id: "Order-A02"})
CREATE (ff)-[:MAPS_TO]->(da);

MATCH (ff:FormField {id: "FF-SF-02"}), (da:DomainAttribute {id: "Shipment-A02"})
CREATE (ff)-[:MAPS_TO]->(da);

MATCH (ff:FormField {id: "FF-SF-03"}), (da:DomainAttribute {id: "Shipment-A03"})
CREATE (ff)-[:MAPS_TO]->(da);

// ---------------------------------------------------------------------------
// UseCase → Form edges
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: "UC-101"}), (f:Form {id: "FORM-OrderCreate"})
CREATE (uc)-[:USES_FORM]->(f);

MATCH (uc:UseCase {id: "UC-101"}), (f:Form {id: "FORM-OrderList"})
CREATE (uc)-[:USES_FORM]->(f);

MATCH (uc:UseCase {id: "UC-201"}), (f:Form {id: "FORM-Shipment"})
CREATE (uc)-[:USES_FORM]->(f);

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------
CREATE (rq1:Requirement {id: "RQ-001", description: "Минимальная сумма заказа 1000 руб", priority: "High", req_type: "business"})
CREATE (rq2:Requirement {id: "RQ-002", description: "Автоматический расчёт суммы позиции", priority: "Medium", req_type: "business"})
CREATE (rq3:Requirement {id: "RQ-003", description: "Проверка наличия товара при добавлении в заказ", priority: "High", req_type: "business"})
CREATE (rq4:Requirement {id: "RQ-004", description: "Авторизация подтверждения заказа менеджером", priority: "High", req_type: "security"})
CREATE (rq5:Requirement {id: "RQ-005", description: "Уникальность номера заказа", priority: "High", req_type: "integrity"});

// ---------------------------------------------------------------------------
// UseCase → Requirement edges
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: "UC-101"}), (rq1:Requirement {id: "RQ-001"}), (rq2:Requirement {id: "RQ-002"}), (rq3:Requirement {id: "RQ-003"}), (rq5:Requirement {id: "RQ-005"})
CREATE (uc)-[:HAS_REQUIREMENT]->(rq1)
CREATE (uc)-[:HAS_REQUIREMENT]->(rq2)
CREATE (uc)-[:HAS_REQUIREMENT]->(rq3)
CREATE (uc)-[:HAS_REQUIREMENT]->(rq5);

MATCH (uc:UseCase {id: "UC-102"}), (rq4:Requirement {id: "RQ-004"})
CREATE (uc)-[:HAS_REQUIREMENT]->(rq4);

// ---------------------------------------------------------------------------
// SystemRoles
// ---------------------------------------------------------------------------
CREATE (sr1:SystemRole {id: "SR-OrderManager", name: "OrderManager", description: "Менеджер по продажам (системная роль)"})
CREATE (sr2:SystemRole {id: "SR-WarehouseOp", name: "WarehouseOperator", description: "Оператор склада (системная роль)"});

// ---------------------------------------------------------------------------
// UseCase → SystemRole (ACTOR)
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: "UC-101"}), (sr:SystemRole {id: "SR-OrderManager"})
CREATE (uc)-[:ACTOR]->(sr);

MATCH (uc:UseCase {id: "UC-102"}), (sr:SystemRole {id: "SR-OrderManager"})
CREATE (uc)-[:ACTOR]->(sr);

MATCH (uc:UseCase {id: "UC-201"}), (sr:SystemRole {id: "SR-WarehouseOp"})
CREATE (uc)-[:ACTOR]->(sr);

// ---------------------------------------------------------------------------
// SystemRole → DomainEntity permissions
// ---------------------------------------------------------------------------
MATCH (sr:SystemRole {id: "SR-OrderManager"}), (de:DomainEntity {id: "DE-Order"})
CREATE (sr)-[:HAS_PERMISSION {crud: "CRUD"}]->(de);

MATCH (sr:SystemRole {id: "SR-OrderManager"}), (de:DomainEntity {id: "DE-OrderItem"})
CREATE (sr)-[:HAS_PERMISSION {crud: "CRUD"}]->(de);

MATCH (sr:SystemRole {id: "SR-OrderManager"}), (de:DomainEntity {id: "DE-Customer"})
CREATE (sr)-[:HAS_PERMISSION {crud: "R"}]->(de);

MATCH (sr:SystemRole {id: "SR-WarehouseOp"}), (de:DomainEntity {id: "DE-Shipment"})
CREATE (sr)-[:HAS_PERMISSION {crud: "CRU"}]->(de);

MATCH (sr:SystemRole {id: "SR-WarehouseOp"}), (de:DomainEntity {id: "DE-Order"})
CREATE (sr)-[:HAS_PERMISSION {crud: "R"}]->(de);

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
CREATE (c1:Component {id: "COMP-DataTable", name: "DataTable", component_type: "ui", description: "Компонент таблицы данных"})
CREATE (c2:Component {id: "COMP-FormLayout", name: "FormLayout", component_type: "ui", description: "Компонент макета формы"});

// ---------------------------------------------------------------------------
// Component → Form edges
// ---------------------------------------------------------------------------
MATCH (c:Component {id: "COMP-DataTable"}), (f:Form {id: "FORM-OrderList"})
CREATE (c)-[:USED_IN]->(f);

MATCH (c:Component {id: "COMP-FormLayout"}), (f:Form {id: "FORM-OrderCreate"})
CREATE (c)-[:USED_IN]->(f);

MATCH (c:Component {id: "COMP-FormLayout"}), (f:Form {id: "FORM-Shipment"})
CREATE (c)-[:USED_IN]->(f);


// =============================================================================
// BA → SA HANDOFF EDGES
// =============================================================================

// WorkflowStep → UseCase
MATCH (ws:WorkflowStep {id: "BP-001-S03"}), (uc:UseCase {id: "UC-101"})
CREATE (ws)-[:AUTOMATES_AS]->(uc);

MATCH (ws:WorkflowStep {id: "BP-001-S04"}), (uc:UseCase {id: "UC-102"})
CREATE (ws)-[:AUTOMATES_AS]->(uc);

MATCH (ws:WorkflowStep {id: "BP-002-S03"}), (uc:UseCase {id: "UC-201"})
CREATE (ws)-[:AUTOMATES_AS]->(uc);

// BusinessEntity → DomainEntity
MATCH (be:BusinessEntity {id: "OBJ-001"}), (de:DomainEntity {id: "DE-Order"})
CREATE (be)-[:REALIZED_AS]->(de);

MATCH (be:BusinessEntity {id: "OBJ-002"}), (de:DomainEntity {id: "DE-OrderItem"})
CREATE (be)-[:REALIZED_AS]->(de);

MATCH (be:BusinessEntity {id: "OBJ-003"}), (de:DomainEntity {id: "DE-Customer"})
CREATE (be)-[:REALIZED_AS]->(de);

MATCH (be:BusinessEntity {id: "OBJ-004"}), (de:DomainEntity {id: "DE-Product"})
CREATE (be)-[:REALIZED_AS]->(de);

// BusinessRole → SystemRole
MATCH (br:BusinessRole {id: "ROL-01"}), (sr:SystemRole {id: "SR-OrderManager"})
CREATE (br)-[:MAPPED_TO]->(sr);

MATCH (br:BusinessRole {id: "ROL-02"}), (sr:SystemRole {id: "SR-WarehouseOp"})
CREATE (br)-[:MAPPED_TO]->(sr);

// BusinessRule → Requirement
MATCH (brq:BusinessRule {id: "BRQ-001"}), (rq:Requirement {id: "RQ-001"})
CREATE (brq)-[:IMPLEMENTED_BY]->(rq);

MATCH (brq:BusinessRule {id: "BRQ-003"}), (rq:Requirement {id: "RQ-003"})
CREATE (brq)-[:IMPLEMENTED_BY]->(rq);

MATCH (brq:BusinessRule {id: "BRQ-005"}), (rq:Requirement {id: "RQ-005"})
CREATE (brq)-[:IMPLEMENTED_BY]->(rq);

// ProcessGroup → Module
MATCH (gpr:ProcessGroup {id: "GPR-01"}), (mod:Module {id: "mod-orders"})
CREATE (gpr)-[:SUGGESTS]->(mod);

MATCH (gpr:ProcessGroup {id: "GPR-02"}), (mod:Module {id: "mod-logistics"})
CREATE (gpr)-[:SUGGESTS]->(mod);

// EntityAttribute → DomainAttribute (TYPED_AS)
MATCH (ea:EntityAttribute {id: "OBJ-001-A01"}), (da:DomainAttribute {id: "Order-A02"})
CREATE (ea)-[:TYPED_AS]->(da);

MATCH (ea:EntityAttribute {id: "OBJ-001-A02"}), (da:DomainAttribute {id: "Order-A03"})
CREATE (ea)-[:TYPED_AS]->(da);


// =============================================================================
// TL LAYER
// =============================================================================

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------
CREATE (w0:Wave {id: "W0", number: 0, name: "Infrastructure", description: "Инфраструктура и настройка окружения"})
CREATE (w1:Wave {id: "W1", number: 1, name: "Core Orders", description: "Базовый функционал заказов"})
CREATE (w2:Wave {id: "W2", number: 2, name: "Logistics", description: "Функционал логистики и отгрузки"});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
CREATE (t1:Task {id: "TECH-001", title: "Project infrastructure setup", status: "done", wave: 0, description: "Настройка базовой инфраструктуры проекта"})
CREATE (t2:Task {id: "UC101-BE", title: "Create order — backend", status: "todo", wave: 1, description: "Бэкенд создания заказа"})
CREATE (t3:Task {id: "UC101-FE", title: "Create order — frontend", status: "todo", wave: 1, description: "Фронтенд создания заказа"})
CREATE (t4:Task {id: "UC102-BE", title: "Confirm order — backend", status: "todo", wave: 1, description: "Бэкенд подтверждения заказа"});

// ---------------------------------------------------------------------------
// Task → Wave edges
// ---------------------------------------------------------------------------
MATCH (t:Task {id: "TECH-001"}), (w:Wave {id: "W0"})
CREATE (t)-[:IN_WAVE]->(w);

MATCH (t:Task {id: "UC101-BE"}), (w:Wave {id: "W1"})
CREATE (t)-[:IN_WAVE]->(w);

MATCH (t:Task {id: "UC101-FE"}), (w:Wave {id: "W1"})
CREATE (t)-[:IN_WAVE]->(w);

MATCH (t:Task {id: "UC102-BE"}), (w:Wave {id: "W1"})
CREATE (t)-[:IN_WAVE]->(w);

// ---------------------------------------------------------------------------
// Task dependencies
// ---------------------------------------------------------------------------
MATCH (t1:Task {id: "UC101-FE"}), (t2:Task {id: "UC101-BE"})
CREATE (t1)-[:DEPENDS_ON]->(t2);

// ---------------------------------------------------------------------------
// APIEndpoints
// ---------------------------------------------------------------------------
CREATE (ep1:APIEndpoint {id: "API-POST-orders", method: "POST", path: "/api/orders", description: "Создать новый заказ"})
CREATE (ep2:APIEndpoint {id: "API-GET-orders", method: "GET", path: "/api/orders", description: "Получить список заказов"});

// ---------------------------------------------------------------------------
// Task → APIEndpoint
// ---------------------------------------------------------------------------
MATCH (t:Task {id: "UC101-BE"}), (ep:APIEndpoint {id: "API-POST-orders"})
CREATE (t)-[:IMPLEMENTS]->(ep);

// ---------------------------------------------------------------------------
// UseCase → Task (SA→TL handoff)
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: "UC-101"}), (t:Task {id: "UC101-BE"})
CREATE (uc)-[:GENERATES]->(t);

MATCH (uc:UseCase {id: "UC-101"}), (t:Task {id: "UC101-FE"})
CREATE (uc)-[:GENERATES]->(t);

MATCH (uc:UseCase {id: "UC-102"}), (t:Task {id: "UC102-BE"})
CREATE (uc)-[:GENERATES]->(t);
