# WP-01: FR-014 — матрица критериев и draft oracle

Исторический контракт family-cinema commit 8d449ab, .tl/feature-requests/FR-014-photo-lightbox.md:62–83; дополнение UC030-upload-photos.md:260–271. Это статическая сверка с WP-01-briefs-draft.md и прежними WP-16 reports, не приёмка продукта. Все предложенные дополнительные negative cases не исполнялись в этой сверке. Детали реализации из FR :37–60 не должны становиться скрытыми требованиями harness.

| Критерий исторического полного scope | Что покрыто черновиком | Что осталось |
|---|---|---|
| AC-1 enhanced открывает нужное фото | Vitest v3 dialog/src, browser open/geometry и отдельный fixture pixel | fullscreen, нужный элемент среди нескольких, crop/overlay; role и src — экспериментальные селекторы, иной UI не означает дефект |
| AC-2 error открывает оригинал | отдельного случая в текущих draft нет | добавить одинаковое требование в полный brief и fixture; проверить оригинал без фиктивной enhanced версии |
| AC-3 uploading/enhancing не открываются | synthetic temp uploaded как proxy и enhancing; browser наблюдение enhancing 500 мс; реальное uploading не проверено | настоящий upload, устойчивое состояние, hit target и согласованный deadline |
| AC-4 pinch 1–3× | CDP события и synthetic control по относительной bbox | повторная доставка/target, clamp сверх границ, абсолютный масштаб, viewport, вертикаль, cancel и устройство |
| AC-5 wheel zoom 1–3× | draft bbox и synthetic wheel/scroll control | объективная метрика и false-pass controls, состояние и тайминги |
| AC-6 кнопка X | draft close и actionability после close | role/label, deadline, отсутствие перехвата в UI |
| AC-7 фон за изображением закрывает | draft проверенная точка и synthetic control | граница фона/controls, hit-testing, timing |
| AC-8 Escape закрывает | Vitest и synthetic browser control | focus, доставка и отсутствие невидимого перехвата |
| AC-9 enhanced↔original | draft src/decode и специальные цветовые fixtures | правильная карточка/версия, initial state, error/отсутствующая версия; DOM и exact src не обязательны без отдельного решения |
| AC-10 фон не прокручивается | synthetic scroll lock и восстановление | scrollable страница, до/во время/после, nested/touch; сохранение позиции — отдельный вопрос |
| AC-11 карточные delete и toggle работают без viewer | отдельного полного теста нет | реальная карточка, контролируемый API, правильный photo ID, disabled/processing scope |

Scope FR также указывает frontend-only и отсутствие новых API/domain/навигации и внешних зависимостей. Исторический AC-11 требует работу карточных кнопок; они добавлены в draft одинакового brief после независимой сверки; draft brief отдельно требует восстановление scroll после close, но это не показано в историческом AC-10. До сравнения общий brief, наблюдаемость и severity должны совпадать у обеих arm; затем нужны независимый закрытый oracle, hash, negative/positive controls и технически подтверждённая изоляция.

Baseline 7 FAIL в одном раннем runner связаны с отсутствием конкретного role=dialog, enhancing PASS; это не автоматически подтверждённые продуктовые defects. Все восемь тогдашних draft cases прошли на специально построенном synthetic v8 control, более поздние pixel/pinch версии проверялись выборочно. Ни один из этих результатов не является full product acceptance или A/B.
