---
title: "OzonSupplyCreateForm — Создание Ozon поставки"
type: screen
screen: ozon-supply-create-form
module: marketplace-integration
uc: [UC509, UC511]
status: draft
created: 2026-03-30
updated: 2026-04-05
tags: [screen, marketplace-integration]
---

# OzonSupplyCreateForm — Создание Ozon поставки

## Назначение
Форма создания поставки на Ozon (FBO). Менеджер МП выбирает утверждённый расчёт, указывает склад Ozon, загружает обогащённый отчёт (МХ + УИН + артикулы) и публикует поставку через API OZON одним нажатием. После публикации доступен блок управления транспортной этикеткой.

## Data-элементы

| ID | Название | Тип элемента | Entity.Attribute | Режим |
|----|----------|--------------|------------------|-------|
| sel_calculation | Расчёт | Select | DailyOrderCalculation.id | edit |
| lbl_calculation_date | Дата расчёта | Label | DailyOrderCalculation.calculationDate | view |
| lbl_calculation_status | Статус расчёта | Label | DailyOrderCalculation.status | view |
| sel_warehouse | Склад Ozon | Select | OzonSupply.warehouseName | edit |
| file_enriched_report | Обогащённый отчёт (МХ + УИН + артикулы) | FileUpload | OzonSupply.enrichedReportFile | edit |
| lbl_supply_status | Статус поставки | Badge | OzonSupply.status | view |
| lbl_publication_status | Статус публикации Ozon | Badge | OzonSupply.ozonPublicationStatus | view |
| lbl_supply_created_at | Дата создания поставки | Label | OzonSupply.createdAt | view |
| lbl_label_status | Статус этикетки | Badge | ShippingLabel.transferStatus | view |

## Functional-элементы

| ID | Название | Тип | Действие | Условие доступности |
|----|----------|-----|----------|---------------------|
| btn_upload | Загрузить отчёт и создать поставку | Button (primary) | Валидация файла + создание OzonSupply | sel_calculation выбран, sel_warehouse заполнен, file_enriched_report загружен |
| btn_publish | Опубликовать на Ozon | Button (primary) | Вызов UC501: API OZON publish supply | OzonSupply.ozonPublicationStatus ≠ PUBLISHED (reconcile 2026-04-05) |
| btn_retry | Повторить публикацию | Button (secondary) | Повторный вызов API OZON | OzonSupply.ozonPublicationStatus = FAILED (reconcile 2026-04-05) |
| btn_request_label | Запросить этикетку | Button (secondary) | Вызов UC502: запрос этикетки через API (BRQ-018, BRQ-019) | OzonSupply.ozonPublicationStatus = PUBLISHED, ShippingLabel.transferStatus ∈ {NOT_READY, FAILED} |

## Visual-элементы

| ID | Описание |
|----|----------|
| lbl_title | Заголовок страницы: «Создание Ozon поставки» |
| section_select | Секция выбора расчёта, склада и загрузки отчёта |
| section_supply_info | Секция данных поставки (видима после OzonSupply создан) |
| section_publish | Секция публикации: кнопка «Опубликовать на Ozon» и результат (видима после OzonSupply создан, ozonPublicationStatus ≠ PUBLISHED) (reconcile 2026-04-05) |
| section_label | Блок управления этикеткой: статус-бейдж и кнопка «Запросить этикетку» (видим после ozonPublicationStatus = PUBLISHED) (reconcile 2026-04-05) |
| msg_validation_error | Область ошибок валидации файла |
| msg_api_error | Область ошибок API OZON с кодом и описанием |
| msg_success | Подтверждение создания поставки |
| msg_publish_success | Подтверждение публикации на Ozon с номером поставки |
| badge_publication_status | Цветной бейдж OzonPublicationStatus: NOT_PUBLISHED (серый), PUBLISHING (синий/loading), PUBLISHED (зелёный), FAILED (красный) (reconcile 2026-04-05) |
| badge_label_status | Цветной бейдж ShippingLabel.transferStatus: NOT_READY (серый), FETCHING (жёлтый), FETCHED (зелёный), FAILED (красный), ERROR (красный/outline) |
| dlg_overwrite_confirm | Диалог подтверждения перезаписи: «Поставка для данного расчёта и склада уже существует. Перезаписать?» с кнопками «Перезаписать» / «Отменить» (альтернативный сценарий A6) (reconcile 2026-04-05) |
| stepper | Визуальный пошаговый индикатор: 1. Загрузка отчёта → 2. Публикация на Ozon → 3. Этикетка |
| badge_platform_note | Информационная подсказка: «Площадка Ozon принимает: Ozon, Ozon Select (BRQ-003)» |

---

## Секция: Ранее созданные поставки Ozon (UC511)

Секция расположена в нижней части страницы, под основной формой создания поставки.

### Data-элементы секции

| ID | Название | Тип элемента | Entity.Attribute | Режим |
|----|----------|--------------|------------------|-------|
| chk_select_row | Выбор строки | Checkbox | — | edit |
| chk_select_all | Выбрать все | Checkbox | — | edit |
| tbl_supply_history | Таблица ранее созданных поставок | Table | OzonSupply[] | view |
| col_created_at | Дата | Column | OzonSupply.createdAt | view |
| col_warehouse | Склад | Column | OzonSupply.warehouseName | view |
| col_status | Статус | Column (Badge) | OzonSupply.status | view |
| col_file_name | Название файла | Column | Supply.fileName (BR-OZF-01) | view |
| col_publication_status | Статус публикации | Column (Badge) | OzonSupply.ozonPublicationStatus | view |
| col_total_items | Позиций | Column | OzonSupply.totalItems | view |

### Functional-элементы секции

| ID | Название | Тип | Действие | Условие доступности |
|----|----------|-----|----------|---------------------|
| btn_download_single | Скачать файл | Button (icon) | Скачать enrichedReportFile одной поставки (имя по BR-OZF-01) | Файл доступен |
| btn_download_selected | Скачать выбранные | Button (secondary) | Формирует ZIP-архив выбранных файлов. Имя: `поставки_ozon_{дата}.zip` | Хотя бы 1 чекбокс отмечен (BR-DWN-02) |
| btn_download_all_supplies | Скачать все | Button (secondary) | Формирует ZIP-архив всех файлов. Имя: `поставки_ozon_все_{дата}.zip` | Есть хотя бы 1 поставка |

### Visual-элементы секции

| ID | Описание |
|----|----------|
| section_supply_history | Секция с заголовком «Ранее созданные поставки Ozon» |
| msg_empty_state | Пустое состояние: «Поставки Ozon ещё не создавались» (если нет данных) |
| msg_download_error | MessageBlock (error) при ошибке скачивания / формирования архива |
| badge_selected_count | Счётчик выбранных: «Выбрано: N» (видим при N > 0) |

### Wireframe секции

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Ранее созданные поставки Ozon                                          │
│                                                                         │
│ [Скачать выбранные (N)]  [Скачать все]                                  │
│ ┌──┬────────────┬────────────┬──────────┬────────────────────┬──────┬──────┬────┐
│ │☐ │ Дата       │ Склад      │ Статус   │ Название файла     │Публ. │ Поз. │ ⬇  │
│ ├──┼────────────┼────────────┼──────────┼────────────────────┼──────┼──────┼────┤
│ │☐ │ 02.04.2026 │ Хоругвино  │ ✅ PUBL  │озон_хоругвино_85.xlsx│✅ PUB│  85  │ ⬇  │
│ │☐ │ 01.04.2026 │ Пушкино    │ 🔵 CRTD │озон_пушкино_42.xlsx │❌ N_P│  42  │ ⬇  │
│ └──┴────────────┴────────────┴──────────┴────────────────────┴──────┴──────┴────┘
│                                                                         │
│ Поставки Ozon ещё не создавались.   ← пустое состояние (если нет)      │
└─────────────────────────────────────────────────────────────────────────┘
```
