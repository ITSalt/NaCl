# WP-11 предварительно: BA attributes → SA domain

Pinned NaCl 20fe4c6, source-only; зависимости открыты. Реальная потеря или устаревание данных не наблюдались, стоимость/frequency UNKNOWN, DEFER.

Root `nacl-ba-entities/SKILL.md:340–352,654–663,775–787` записывает EntityAttribute `name,business_type,required,comment`. Root `nacl-sa-domain/SKILL.md:112–125` в IMPORT_BA для ещё не связанных BusinessEntity читает `id,name,data_type,description`, но не `business_type`, `required`, `comment`. В fixture только с полями показанного writer этот RETURN даст null для data_type/description и не вернёт required; существующие дополнительные поля SET не удаляет, другие пути или пользователь могут их заполнить. Например `nacl-migrate-ba/scripts/generate_ba_cypher.py:198–205` использует `type,required,description`, поэтому нельзя обобщать на все атрибуты.

Domain :197–223 интерактивно предлагает mapping типов/nullable; :405–420 создаёт REALIZED_AS/TYPED_AS. Эти edges подтверждают связь, но сами не сравнивают properties. `nacl-ba-handoff/SKILL.md:497–517` предлагает обновить BA колонки и сохранить SA edges; автоматическое обновление DomainAttribute или semantic invalidation по этим строкам не доказано. Уже связанная сущность не попадает в конкретный uncovered IMPORT_BA query.

Альтернатива — подтверждённый trace-aware diff и read-back type/nullable/description после изменения BA. Риски: потерять допустимое преобразование имени/типа, 1→many mapping или ошибочно объявить отсутствие edge ошибкой. Proposed controls: BA writer с business_type/required/comment, migration attribute с type/description, изменение при сохранённых edges; positive — подтверждённое соответствие и downstream. Graph/tests не запускались.
