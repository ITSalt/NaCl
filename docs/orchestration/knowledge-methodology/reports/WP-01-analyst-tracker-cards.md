# WP-01: analyst-tool и tracker дополнительные механизмы

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Категория DEFER; цена, частота и live runtime UNKNOWN. Эта карточка составлена статически; позднейший изолированный handler probe описан в [render path](WP-01-analyst-render-path-boundary.md). Не обращаться к реальному tracker/graph для этих проб.

## AT-01: состояние очереди и события

analyst-tool/server/src/routes/skills.ts:31–49 возвращает runId, затем services/skill-runner.ts:417–441 при ненулевом exit публикует run.failed и возвращает resolved failedSummary; services/run-queue.ts:102–115 любую resolved summary отражает в ring как completed с exitCode. UI App.tsx:189–213 обрабатывает run.failed, RunPanel.tsx:63–67 показывает nonzero exit, а patch/diff side effects требуют completed и exitCode 0 (web/src/state/store.ts:431–440); board reload может произойти и при failed. RunPanel статически рисует зелёный значок для completed даже при nonzero exit, рядом показывая exit code. Batch отдельно учитывает nonzero как failed. Это статическое различие terminal state, не доказанный false PASS UI; hydration/reconnect и порядок событий требуют трассировки. Альтернатива единый typed phase+exitCode и reconciliation replay; риск consumer без exitCode считает completed успешным. Negative: nonzero resolved, reject, пропавший/поздний WS, reload и обратный порядок final events; positive: zero exit и read-back.

## AT-RECONNECT: восстановление статуса run

Pinned source: `analyst-tool/server/src/services/run-queue.ts:32–50,102–115,129–135` хранит до 200 записей в process-local ring; `routes/runs.ts:4–17` предоставляет read API. При reconnect клиент `web/src/api/ws.ts:37–55,72–88` повторно подписывает каналы, а server `index.ts:94–118`, `ws/events.ts:17–24,36–47` в показанном пути не воспроизводит прошлые события. `App.tsx:44–68,189–232` и store :412–447 обновляют UI по событиям; ограниченный поиск в web не нашёл hydration из runs API на reconnect/bootstrap. При пропущенном terminal event и отсутствии последующего обновления показанный UI state может устареть; это не наблюдённая потеря самого результата и не исключает другие consumers или способы обновления.

Proposed negative: disconnect во время terminal event, reconnect и сравнение UI с runs API; отдельно restart/eviction и out-of-order. Positive: доставленный terminal event и согласованный exitCode. Альтернатива fetch/reconcile должна защищать более новый state от старого snapshot и явно показывать границу durable history. Browser/server не запускались, частота и влияние UNKNOWN, DEFER.

## TRACK-01: project_id в конфигурации

yougile-setup/src/index.ts:240–245,293–297 принимает project id для board, но :153–175,204–221 формирует yougile.project_id из одинаковых пустых ветвей. Непосредственный consumer этого поля пока не найден; влияние на live success не доказано. Риск потери выбранного scope в config. Альтернатива typed serializer/schema и roundtrip точных IDs. Negative: заданный project id после генерации, существующий config и сложный YAML; positive: корректный roundtrip ID и сохранение остальных значений.

## TRACK-REOPENED: частичное создание колонки

При успешном создании board и отказе создания Reopened `yougile-setup/src/index.ts:284–311,403–421` сохраняет error, продолжает остальные колонки и при успешном config update может записать пустой reopened ID (:167–185,204–221); итог `success:false`, exit 1, не тихий успех. Если частичная конфигурация затем сохранена и интеграция считается настроенной, root QA `nacl-tl-qa/SKILL.md:533–556` при найденном bug выше auto_create_bugs threshold передаёт поле в create_task, reopened `nacl-tl-reopened/SKILL.md:100–114,122–143` использует его в get_tasks; в показанных ветвях отдельная проверка непустоты не найдена. При не настроенной интеграции предусмотрены skip/manual; поведение API при пустом ID и реальная потеря задач UNKNOWN.

Proposed negative: fake API с отказом только Reopened, проверить exit/error, config и downstream handling без записи в произвольный scope; positive: созданный ID и точный roundtrip. Source-only, внешние API не запускались; DEFER.

## TRACK-02: частичный результат sticker states

yougile-setup/src/index.ts:317–325 после failed GET продолжает создание; :333–363 ошибку создания state при повторном использовании существующего sticker логирует и возвращает частичные stateIds; при создании нового sticker исключение попадает во внешний catch и result.errors, а :405–421 success зависит от result.errors. Это статический путь к неполному config при success, если state POST ошибётся, не воспроизведённый live дефект. Column errors обрабатываются отдельно. При повторном использовании Module sticker неполная map может попасть в `yougile.stickers.module.states`; root `nacl-tl-reopened/SKILL.md:192–201` использует sticker первым, затем file paths/keywords и при неоднозначности спрашивает. Ошибочный выбор модуля или поведение неизвестного ID не доказаны. Альтернатива per-operation typed outcomes и обязательный read-back states. Negative: failed GET, ошибка одного POST, отсутствующий обязательный ID и частичная board creation; positive: все states подтверждены. Возможные дубли проверять только fake API.

## AT-02: файловая запись render endpoint

analyst-tool/server/src/routes/render.ts:41–66 выполняет mkdir и writeFile и возвращает path/bytes; чтение graph при render не означает filesystem read-only. Конкретный UI consumer и confirmation остаются открыты. [Изолированный handler probe](WP-01-analyst-render-path-boundary.md) с fake graph дважды воспроизвёл запись за project root внутри temp; live graph/API и эксплуатация не проверены. Альтернатива preview, scoped overwrite и atomic read-back. Negative: dirty существующий файл, смена проекта, failure во время записи; positive: согласованный output с проверенным содержимым. На live server endpoint не запускался.
