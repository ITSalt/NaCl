# WP-01: BA→SA coverage — источники и границы расчётов

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Статическое сопоставление Cypher и документа, graph/Cypher не запускались. Логические примеры — предложенные контрпримеры, не наблюдённые runtime результаты.

docs/methodology/handoff.md:72–79,123–151,163–169 задаёт цель ≥95% для четырёх категорий. Проверенные ниже queries не содержат явного сравнения >=95 или отдельного отказа по порогу. Это не доказывает отсутствия такого policy у любых других consumers. Документ также говорит о full coverage, что требует уточнения условий исключений.

Иллюстративный snippet документа :129–140 считает count(ws) и count(uc) без DISTINCT после OPTIONAL MATCH; в примере два source steps, у одного две связи и у другого нет, логическая формула snippet даёт 2/3 вместо 1/2 уникальных покрытых steps. Snippet содержит ellipses, не является полным исполняемым query.

Named query graph-infra/queries/handoff-queries.cypher:52–89, повторённый в nacl-ba-handoff/SKILL.md:408–445 и аналогичных фрагментах nacl-ba-validate/SKILL.md:508–518,551–560,580–589,627–636, считает denominator по BA nodes, numerator по match rows без DISTINCT. При двух BA steps, из которых один имеет два target UC, из текста получается 2/2=100%, хотя покрыт один из двух; один source с двумя targets теоретически даёт 200%. Это аналитическое следствие, не исполненный probe. Entities отфильтрованы по type=Бизнес-объект, steps — по русскому Автоматизируется, roles/rules шире; integer rounding тоже влияет на интерпретацию порога.

SA-side nacl-sa-validate/SKILL.md:2277–2292,2340–2351,2397–2408 считает source nodes и EXISTS, не размножая numerator по edge; при нулевом total описывает N/A. Его steps denominator включает русский/английский stereotype либо существующий edge, entities охватывает все BusinessEntity. В rules :2452–2464 independent суммы implemented и out_of_scope могут пересечься; это гипотеза для отдельного negative. BA и SA показатели нельзя считать одной формулой.

BA named query использует CASE ELSE 0, но некоторые последующие MATCH/grouping при пустых категориях могут не вернуть строку: точный результат надо проверить на изолированной fixture, не заявлять 0 или N/A по памяти. Codex BA validation skills-for-codex/nacl-ba-validate/SKILL.md:19–27 при отсутствующем SA помечает cross NOT_RUN/PARTIAL.

Consumer BA handoff :449–459 выводит таблицу, BA validate :731–735 оценивает CRITICAL/WARNING; по проверенным фрагментам TL plan не доказан как читатель именно 95% aggregate. Предлагаемые negative fixtures: два BA nodes/две targets у одного, пустой BA/SA, английский stereotype, mapped+out_of_scope, rounding около порога, changed meaning с прежним edge. Независимый oracle должен считать distinct source IDs, показывать scope/exceptions/N/A и опираться на консистентный snapshot; проверки не выполнялись.
