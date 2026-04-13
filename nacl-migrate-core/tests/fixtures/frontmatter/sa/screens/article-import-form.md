---
title: "ArticleImportForm — Загрузка справочника артикулов"
type: screen
module: data-import
uc: UC101
status: draft
created: 2026-03-20
updated: 2026-04-03
tags: [screen, data-import]
---

# ArticleImportForm — Загрузка справочника артикулов

## Назначение
Форма загрузки файла «Список артикулов» из 1С. Позволяет выбрать и отправить Excel-файл, добавить комментарий к загрузке, просмотреть результат обработки и историю предыдущих загрузок.

## Data-элементы

| ID | Название | Тип элемента | Entity.Attribute | Режим |
|----|----------|--------------|------------------|-------|
| inp_file | Файл из 1С | FileInput | ArticleImport.fileName | edit |
| inp_comment | Комментарий к загрузке | TextInput | ArticleImport.comment | edit |
| lbl_status | Статус загрузки | Label | ArticleImport.status | view |
| lbl_row_count | Строк загружено | Label | ArticleImport.rowCount | view |
| lbl_imported_at | Дата загрузки | Label | ArticleImport.importedAt | view |
| lbl_error | Сообщение об ошибке | Label | ArticleImport.errorMessage | view |
| lbl_uploaded_by | Загрузил | Label | ArticleImport.uploadedBy | view |

## Functional-элементы

| ID | Название | Тип | Действие |
|----|----------|-----|----------|
| btn_upload | Загрузить | Button | Отправка файла → UC101 шаг 4 |
| btn_clear | Сбросить | Button | Очистить выбранный файл |

## Visual-элементы

| ID | Описание |
|----|----------|
| lbl_title | Заголовок страницы: «Загрузка справочника артикулов» |
| msg_error | Область отображения ошибок загрузки (формат, структура колонок) |
| msg_warning | Область предупреждений (например, rowCount = 0 после фильтрации) |
| hint_comment | Подсказка под полем комментария: «Комментарий будет виден при выборе справочника в форме расчёта» |
| badge_filter_note | Информационная подсказка: «Импортируются только товары с признаком id == mp» |
| tbl_history | Таблица истории предыдущих загрузок: fileName, comment, status, rowCount, importedAt, uploadedBy |

## Колонки таблицы предпросмотра данных (после успешной загрузки)

После обработки отображается таблица загруженных строк со следующими колонками:

| Колонка | Entity.Attribute |
|---------|-----------------|
| Артикул 1С | ArticleRow.article1c |
| Артикульная группа | ArticleRow.articleGroup |
| Родитель | ArticleRow.parentArticle |
| Размер | ArticleRow.size |
| КатегорияКамней | ArticleRow.stoneCategory |
| Вес | ArticleRow.weight |
| Тег | ArticleRow.tag |
