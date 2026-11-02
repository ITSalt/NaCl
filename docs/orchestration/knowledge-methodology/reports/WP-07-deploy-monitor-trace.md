# WP-07 предварительно: trigger deploy и monitoring

NaCl 20fe4c6; source-only, dependency WP-01 открыта. Сеть/deploy не запускались; частота и цена UNKNOWN, DEFER.

Root `nacl-tl-deliver/SKILL.md:204–208,255–263` описывает push и ожидание CI; `nacl-tl-deploy/SKILL.md:65–76` называет push через ship триггером, а deploy skill — мониторингом CI/health. Поэтому HALT на pre-monitor gate не доказывает отмену уже отправленного push или внешнего side effect. Это логический порядок source contract, не наблюдённое развёртывание.

Root deploy :122–167 сопоставляет clean-checkout artifact с заявленным deployed SHA и upstream statuses. Codex `skills-for-codex/nacl-tl-deploy/SKILL.md:13–24,67–74,88–93` требует отдельно установить commit и CI/health, не доказывая фактический SHA target. Root :186–217 в показанном примере делает первый curl для HTTP 200, затем второй для body/keys; статус второго и сравнение полученной version с ожидаемым SHA в этих строках явно не проверяются. Возможный разный ответ между запросами — предложенный negative, не runtime результат. Deliver :574–600 вызывает отдельный `nacl-core/scripts/health-check.sh:32–44`: helper использует `curl -sf`, отбрасывает тело и сообщает 200 OK, но не сравнивает точный http_code (например, 3xx не является ошибкой `curl -f`); shape/version он не проверяет. Нельзя автоматически приписывать ему shape gate deploy.

Альтернатива — записывать trigger и observation отдельно, expected SHA и независимо подтверждённый served SHA, единый HTTP status/body, CI run и artifact. Риски: endpoint/cache/LB и смешанные replicas, отсутствие version contract, health не равен product QA. Proposed controls: смена ответов между curl, иной served SHA, отказ monitoring после push; positive — verified exact target/revision. Ничего не выполнялось.
