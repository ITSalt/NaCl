# WP-01: три высокорисковых overlay — выборочная трасса

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Текстовые контракты, не подтверждённая доступность tools, runtime или реальная цена. Все выводы DEFER; предложенные проверки не выполнялись.

## nacl-migrate

Root nacl-migrate/SKILL.md:28–40 делегирует BA/SA specialists и фазовые gates, repo Codex skills-for-codex/nacl-migrate/SKILL.md:29–40 описывает phase contracts через доступные graph tools, overlay codex-plugin-src/workflow-overlays/nacl-migrate/SKILL.md:12–19 ограничивает schema route MIG-GATEWAY с fence и для domain materialization задаёт BLOCKED при недоступной capability. Потребители — BA/SA graph и phase report; риск гипотетической замены — принять file conversion за graph write или потерять отказ. Negative: отсутствующий domain gateway; positive: разрешённый scope и read-back.

Root :14–23,232–244 задаёт canary с порогом coverage и остановку перед human retrospective; Codex :16–27 и overlay :25–36 описывают deferred alias и запрет утверждать чужой runtime без evidence. Нельзя считать count разрешением перескочить human gate. Работа alias и evaluator не проверена.

## nacl-publish

Root nacl-publish/SKILL.md:15–34,195–213 предполагает graph/Docmost и reconciliation; Codex skills-for-codex/nacl-publish/SKILL.md:15–44 описывает confirmation и conditional tools; overlay codex-plugin-src/workflow-overlays/nacl-publish/SKILL.md:12–19 задаёт protected ReleaseEnvironment и BLOCKED при отсутствующих named reads. Потребители — pages, board links и manifest; риск — использовать stale local данные или принять отказ за публикацию. Проверять missing named read, drift и partial publication без обращения к live target.

Root publish :805–809,859–891 ссылается на удалённые команды nacl-render excalidraw, тогда как root render :751–758 переносит генерацию в analyst-tool. См. WP-01-publish-render-trace.md. Связь publish→новый endpoint и runtime failure не доказаны.

## nacl-tl-full

Root nacl-tl-full/SKILL.md:12–26,75–94 потребляет Task/Wave и результаты specialists; Codex skills-for-codex/nacl-tl-full/SKILL.md:34–53 задаёт closed status; overlay codex-plugin-src/workflow-overlays/nacl-tl-full/SKILL.md:12–19,45–55 дополнительно описывает claim/heartbeat/fence, revision CAS, explicit operation и evidence до terminal advancement. Потребители — graph Task, conductor и owner. Риск гипотетической замены — stale worker, потеря concurrent update или отделённое от статуса evidence. Negative: stale fence, revision conflict, missing evidence, claim handoff. Live atomicity и authentication не следуют из текста.

Root :41–49 ссылается на goal check script, Codex :22–32 упоминает путь, overlay :31–43 использует внутреннюю ссылку и GOAL_PROOF transcript evidence вместо project-cwd shell invocation. Рабочий evaluator и равенство local verification не подтверждены.

Это по два выбранных различия, не полный semantic diff трёх workflows. Подтверждения встречаются и в root; не приписывать их исключительно overlay.
