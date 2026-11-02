# Наблюдение обычного Codex transport

`session capabilities` сообщил CLI 0.166.0 и доступность queue/app-server. `session discover` с настройкой по умолчанию завершился `App Server timeout: initialize`; прямой probe proxy также не дождался ответа. `codex app-server daemon version` сообщил работающий daemon и локальный control socket.

Штатный `codex_transport.read_thread(..., shared=True, remote='unix:///Users/maxnikitin/.codex/app-server-control/app-server-control.sock')` успешно ответил через этот сокет. Текущий coordinator thread сообщил cwd `/Users/maxnikitin/projects/NaCl`, status active, pid отсутствует. Обычный `autonomy.py:1144–1155` требует cwd program workspace или checkout координатора `/Users/maxnikitin/projects/NaCl-orch`, а также подтверждённую привязку процесса. Из результата следует, что текущий thread не удовлетворяет проверке cwd; фактический `claim` не выполнялся, process/thread binding не доказан. Запуск другого coordinator session и смена настроек не выполнялись. `enable` не выполнялся, watcher отсутствует.

Вывод: проблема default proxy и несовпадение cwd — конкретные наблюдаемые ограничения текущего запуска, но не доказательство принципиальной недоступности обычной автономии. Успешный websocket initialize не является подтверждением claim/enable/watch. Private-owner — отдельный режим, не обязательное следствие этих фактов.
