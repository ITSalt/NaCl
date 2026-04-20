---
title: "DeliveryOrderList — Список заявок на поставку"
type: screen
module: order-generation
uc: UC301, UC304a
status: draft
created: 2026-03-21
updated: 2026-03-21
tags: [screen, order-generation]
---

# DeliveryOrderList — Список заявок на поставку

## Назначение

Экран списка заявок на поставку. Отображает все DeliveryOrder с возможностью фильтрации по статусу и маркетплейсу. Является точкой входа в подраздел «Заявки на поставку»: отсюда пользователь переходит к созданию новой заявки (UC301) или к утверждению существующей (UC303).

## Роли

`marketplace_manager`, `product_manager`, `analyst`

## Data-элементы

| ID | Название | Тип элемента | Entity.Attribute | Режим |
|----|----------|--------------|------------------|-------|
| col_id | ID заявки | Column | DeliveryOrder.id | view |
| col_marketplace | Маркетплейс | Column | DeliveryOrder.marketplace | view |
| col_status | Статус | Column | DeliveryOrder.status | view |
| col_created_at | Дата создания | Column | DeliveryOrder.createdAt | view |
| col_approved_at | Дата утверждения | Column | DeliveryOrder.approvedAt | view |
| col_shipment_id | ID поставки Marketplace | Column | DeliveryOrder.marketplaceShipmentId | view |
| col_created_by | Инициатор | Column | DeliveryOrder.createdBy | view |

## Functional-элементы

| ID | Название | Тип | Действие |
|----|----------|-----|----------|
| btn_create | + Создать заявку | Button | Переход к DeliveryOrderCreateForm (UC301) |
| fil_status | Фильтр по статусу | Select | Фильтрация по DeliveryOrder.status (ALL / DRAFT / EXPORTED / APPROVED / PUBLISHED) |
| fil_marketplace | Фильтр по маркетплейсу | Select | Фильтрация по DeliveryOrder.marketplace (ALL / MP2 / MARKETPLACE / MARKETPLACE_SELECT) |
| lnk_row | Строка заявки | Link | Переход к DeliveryOrderApproveForm (UC303) при статусе EXPORTED; иначе — просмотр |
| btn_export | Экспорт в 1С | Button | Запуск экспорта из строки списка (UC401); активен при статусе DRAFT |

## Visual-элементы

| ID | Описание |
|----|----------|
| lbl_title | Заголовок страницы: «Заявки на поставку» |
| badge_status | Бейдж статуса DeliveryOrder с цветовой индикацией: DRAFT — серый, EXPORTED — синий, APPROVED — зелёный, PUBLISHED — фиолетовый |
| msg_empty | Сообщение при пустом списке: «Заявки на поставку ещё не созданы. Нажмите "Создать заявку".» |
| msg_empty_filter | Сообщение при пустом фильтре: «Ничего не найдено. Попробуйте изменить фильтры.» |
| lbl_total | Итого: количество заявок в текущем фильтре |
| pager | Пагинация: [< 1 2 3 ... >] |
