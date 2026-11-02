# WP-03 предварительно: permission scope → TL planning

Read-only исследование NaCl 20fe4c6; WP-01 зависимость не закрыта, WP-03 не принят. Source-level контракты не доказывают runtime. Цена и частота UNKNOWN; категория DEFER.

`nacl-sa-roles/SKILL.md:384–405,423–456,481–506` описывает confirmed `SystemRole-[:HAS_PERMISSION {crud,scope}]->DomainEntity`, scope all/own/department/assigned; пустой CRUD или отсутствующее ребро задают no access. До confirmed/readback отсутствие может означать неполную модель, а не доказанное намерение deny. :548–560,603–622 допускает transition rules в edge properties либо описании/summary.

`nacl-tl-plan/SKILL.md:970–975` заявляет отображение permissions в authorization/API auth/test specs. При этом named `sa_uc_full_context` в `graph-infra/queries/sa-queries.cypher:10–29` возвращает actor SystemRole nodes, но в показанных полях не выбирает permission edges с crud/scope и DomainEntity. Повторённый query в root plan :684–706 имеет ту же границу; узкий поиск HAS_PERMISSION по sa-queries и root/legacy plan не нашёл отдельной передачи edges. Это расхождение конкретных фрагментов; другие queries, дублирование node properties или дополнительный context вне проверенного scope могут передавать данные. Реальная потеря permissions или false PASS не доказаны. `nacl-tl-qa/SKILL.md:225,327,375` использует role credentials, но само по себе не подтверждает проверку deny или row scope.

Legacy `skills-for-codex/nacl-sa-roles/SKILL.md:29–43,49–64` описывает N:M mapping, CRUD/scope и readback с ограничениями схемы; package SA-full overlay и Skills-only router — отдельные контуры, их runtime route не подтверждён.

Риск по назначению — чрезмерный доступ к чужой записи, необоснованный отказ либо утрата ограничения перехода. Альтернатива: versioned policy table `(role, entity, action, scope, decision, transition, source)` с machine-checkable API cases; риск — потерять BA provenance, субъект и направленное распространение изменений. Proposed controls: own/other record при scope=own, missing decision отдельно от намеренного deny, запрещённый и разрешённый переход. Конкретные HTTP codes источниками здесь не заданы. Graph, tests и A/B не запускались.
