# SA Фаза 2 на примере: OBJ-001 → DE-Booking

**Вход:** подтверждаю импорт сущностей BA в mod-001 и типы, предложенные агентом.

**Выход:**

| DomainAttribute | Тип | Из BA (`TYPED_AS`) |
|-----------------|-----|--------------------|
| Booking-A01 number | int, unique | «Номер» (Число) |
| Booking-A02 slot_datetime | datetime | «Дата и время слота» (Дата) |
| Booking-A03 service_type | enum → ENUM-ServiceType | «Услуга» (Перечисление) |
| Booking-A04 comment | string, nullable | «Комментарий» (Текст) |
| Booking-A05 status | enum → ENUM-BookingStatus | «Статус» (Перечисление) |

```
ENUM-BookingStatus: new / confirmed / cancelled   ← из EntityState BA!
DE-Booking RELATES_TO DE-ScheduleSlot (N:1), DE-Client (N:1)
OBJ-001 ─REALIZED_AS→ DE-Booking
```

mod-001: DE-Booking, DE-Client, DE-Vehicle, DE-ScheduleSlot.
mod-002: DE-WorkOrder (+ ENUM-WorkOrderStatus).

<!--
Speaker notes:
- Значения ENUM-BookingStatus не выдуманы: они импортированы из состояний
  EntityState, описанных в BA фазе 4. Жизненный цикл стал перечислением.
- nullable/unique агент предлагает из контекста, я подтверждаю.
- Показать кросс-слойное ребро: MATCH (o:BusinessEntity)-[:REALIZED_AS]->(d) RETURN *
-->
