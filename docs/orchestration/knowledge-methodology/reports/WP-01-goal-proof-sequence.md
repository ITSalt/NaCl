# WP-01: GOAL proof и фиксация результата — статическая трасса

Источник: pinned дерево NaCl 20fe4c6. Это проверка текста и видимого кода, без выполнения alias, evaluator или wrapper.

`docs/guides/goal-proof-protocol.md:19–25,81–90` описывает evaluator с доступом только к transcript и требует для успешного завершения GOAL_OK и существующий файл `<run_id>.md` с final proof. `docs/guides/goal-run-schema.md:3–17` описывает четыре single-file alias и выход `/goal`, затем повторную проверку и запись итогового YAML. Если final proof означает исключительно итоговую запись после этой проверки, буквальный порядок становится циклическим; источники не исключают, что достаточная запись появляется раньше. Поэтому фактическая блокировка не доказана.

Для 2.10.0 `nacl-goal/SKILL.md:71–79,896–900` и `docs/guides/goal-run-schema.md:81` описывают вызов `/goal` без записи run file, тогда как `nacl-goal/SKILL.md:133–136` и protocol :86–88 формулируют требование файла. Это текстовое противоречие при одновременной применимости требований, не наблюдение runtime. Версии и область каждого условия требуют отдельной проверки.

Intake 2.10.1 и conduct 2.18.0 используют каталог run, а не single-file YAML (`docs/guides/goal-run-schema.md:5`, `nacl-goal/SKILL.md:357–368`, `nacl-goal/checks/intake.sh:4–16`); общий protocol не оговаривает это различие. Не переносим предполагаемый цикл на эти alias.

`nacl-goal/checks/wave.sh:4,39–54` — заглушка с GOAL_NOT_OK, а `nacl-goal/checks/intake.sh:97–106,138–145,295,319,455` содержит чтение каталога и условные обращения к внешним источникам. Общий исполняемый evaluator/parser/finalizer в просмотренном репозитории не найден; вне него может существовать иная реализация. Codex projection описывает preview и BLOCKED при отсутствии Anthropic primitive (`skills-for-codex/nacl-goal/SKILL.md:48–60,96–104,122–124`), а не подтверждённое исполнение.

Возможные проверки: установить точную версию и применимый контракт, получить время появления interim и final файла и transcript, отдельно проверить evaluator и порядок post-completion recheck. Эти проверки не выполнялись; все результаты DEFER.
