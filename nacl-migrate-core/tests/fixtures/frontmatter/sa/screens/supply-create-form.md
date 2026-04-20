---
title: "SupplyCreateForm — Создание поставки"
type: screen
screen: supply-create-form
module: marketplace-integration
uc: [UC509, UC511]
status: draft
tags: [screen, marketplace-integration]
---

# SupplyCreateForm — Создание поставки

## Назначение
Форма создания поставки. Менеджер выбирает утверждённый расчёт, указывает склад, загружает обогащённый отчёт и публикует поставку через API одним нажатием. После публикации доступен блок управления транспортной этикеткой.

## Data-элементы

| ID | Название | Тип элемента | Entity.Attribute | Режим |
|----|----------|--------------|------------------|-------|
| sel_calculation | Расчёт | Select | DailyOrderCalculation.id | edit |
| lbl_calculation_date | Дата расчёта | Label | DailyOrderCalculation.calculationDate | view |
| lbl_calculation_status | Статус расчёта | Label | DailyOrderCalculation.status | view |
| sel_warehouse | Склад | Select | Supply.warehouseName | edit |
| file_enriched_report | Обогащённый отчёт | FileUpload | Supply.enrichedReportFile | edit |
| lbl_supply_status | Статус поставки | Badge | Supply.status | view |
| lbl_publication_status | Статус публикации | Badge | Supply.publicationStatus | view |
| lbl_supply_created_at | Дата создания поставки | Label | Supply.createdAt | view |
| lbl_label_status | Статус этикетки | Badge | ShippingLabel.transferStatus | view |

## Functional-элементы

| ID | Название | Тип | Действие | Условие доступности |
|----|----------|-----|----------|---------------------|
| btn_upload | Загрузить отчёт и создать поставку | Button (primary) | Валидация файла + создание Supply | sel_calculation выбран, sel_warehouse заполнен, file_enriched_report загружен |
| btn_publish | Опубликовать | Button (primary) | Вызов UC501: публикация поставки через API | Supply.publicationStatus ≠ PUBLISHED |
| btn_retry | Повторить публикацию | Button (secondary) | Повторный вызов API публикации | Supply.publicationStatus = FAILED |
| btn_request_label | Запросить этикетку | Button (secondary) | Вызов UC502: запрос этикетки через API (BRQ-018, BRQ-019) | Supply.publicationStatus = PUBLISHED, ShippingLabel.transferStatus ∈ {NOT_READY, FAILED} |

## Visual-элементы

| ID | Описание |
|----|----------|
| lbl_title | Заголовок страницы: «Создание поставки» |
| section_select | Секция выбора расчёта, склада и загрузки отчёта |
| section_supply_info | Секция данных поставки (видима после Supply создан) |
| section_publish | Секция публикации: кнопка «Опубликовать» и результат (видима после Supply создан, publicationStatus ≠ PUBLISHED) |
| section_label | Блок управления этикеткой: статус-бейдж и кнопка «Запросить этикетку» (видим после publicationStatus = PUBLISHED) |
| msg_validation_error | Область ошибок валидации файла |
| msg_api_error | Область ошибок API с кодом и описанием |
| msg_success | Подтверждение создания поставки |
| msg_publish_success | Подтверждение публикации с номером поставки |
| badge_publication_status | Цветной бейдж PublicationStatus: NOT_PUBLISHED (серый), PUBLISHING (синий/loading), PUBLISHED (зелёный), FAILED (красный) |
| badge_label_status | Цветной бейдж ShippingLabel.transferStatus: NOT_READY (серый), FETCHING (жёлтый), FETCHED (зелёный), FAILED (красный), ERROR (красный/outline) |
| dlg_overwrite_confirm | Диалог подтверждения перезаписи: «Поставка для данного расчёта и склада уже существует. Перезаписать?» с кнопками «Перезаписать» / «Отменить» (альтернативный сценарий A6) |
| stepper | Визуальный пошаговый индикатор: 1. Загрузка отчёта → 2. Публикация → 3. Этикетка |

---

## Секция: Ранее созданные поставки (UC511)

Секция расположена в нижней части страницы, под основной формой создания поставки.

### Data-элементы секции

| ID | Название | Тип элемента | Entity.Attribute | Режим |
|----|----------|--------------|------------------|-------|
| chk_select_row | Выбор строки | Checkbox | — | edit |
| chk_select_all | Выбрать все | Checkbox | — | edit |
| tbl_supply_history | Таблица ранее созданных поставок | Table | Supply[] | view |
| col_created_at | Дата | Column | Supply.createdAt | view |
| col_warehouse | Склад | Column | Supply.warehouseName | view |
| col_status | Статус | Column (Badge) | Supply.status | view |
| col_file_name | Название файла | Column | Supply.fileName (BR-DWN-01) | view |
| col_publication_status | Статус публикации | Column (Badge) | Supply.publicationStatus | view |
| col_total_items | Позиций | Column | Supply.totalItems | view |

### Functional-элементы секции

| ID | Название | Тип | Действие | Условие доступности |
|----|----------|-----|----------|---------------------|
| btn_download_single | Скачать файл | Button (icon) | Скачать enrichedReportFile одной поставки | Файл доступен |
| btn_download_selected | Скачать выбранные | Button (secondary) | Формирует ZIP-архив выбранных файлов | Хотя бы 1 чекбокс отмечен (BR-DWN-02) |
| btn_download_all_supplies | Скачать все | Button (secondary) | Формирует ZIP-архив всех файлов | Есть хотя бы 1 поставка |

### Visual-элементы секции

| ID | Описание |
|----|----------|
| section_supply_history | Секция с заголовком «Ранее созданные поставки» |
| msg_empty_state | Пустое состояние: «Поставки ещё не создавались» (если нет данных) |
| msg_download_error | MessageBlock (error) при ошибке скачивания / формирования архива |
| badge_selected_count | Счётчик выбранных: «Выбрано: N» (видим при N > 0) |
