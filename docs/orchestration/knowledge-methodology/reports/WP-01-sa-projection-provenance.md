# WP-01: provenance SA source, projection и установленной сборки

Read-only сверка трёх SKILL.md, без запуска builder или runtime. NaCl HEAD 20fe4c6a56482e85d3ea9a9ebaadb37206047e41; установленный nacl/0.2.2 release-manifest заявляет source commit c291c798fcfda697dd8d93f23ffc6d7e68528a5a.

codex-plugin-src/README.md:3–16 описывает root, skills-for-codex и overlays как исходные материалы; plugins/nacl — generated. scripts/codex-plugin-manifest.json:31–40,94–106 задаёт workflow sources для nacl-sa-uc, nacl-sa-ui и nacl-sa-validate, overlay среди них выбран для validate. scripts/build-codex-plugin.mjs:345–364 копирует resources из legacy-codex и выбирает overlay SKILL либо skills-for-codex SKILL; имя legacy не доказывает устаревание обязанностей.

| Файл | Git blob установленного SKILL | Сопоставление |
|---|---|---|
| sa-uc | 0196cc0e06d02aba9e828d5637da09628531001f | совпадает с skills-for-codex в c291c7, отличается от HEAD d7d4a44db4b726a314ba963dab70066cdcc789a2 |
| sa-ui | 76efc1c376c025f6061e522ab4345fd1deda6b62 | совпадает с skills-for-codex в c291c7, отличается от HEAD c214f21535bf89146517ba0784fcca82c08c0074 |
| sa-validate | 34791a9a2151f63ea6a6283ce9257957b2bb2dbc | совпадает с выбранным overlay в c291c7 и HEAD; HEAD skills-for-codex имеет другой blob 82993dcbd35dbc01e9dd32d0e4a668603b2ccc3c |

Это Git blob SHA-1, не SHA-256 payload и не commit ID. Для validate прямое сравнение installed с HEAD skills-for-codex не является проверкой builder parity: manifest выбирает overlay. В installed validate строки 184–185 кратко описывают warning same-storage без найденных в root/skills-for-codex оговорок L13.9/L13.10. Это различие текстов, не доказательство runtime. Равенство трёх файлов не проверяет остальные payload/resources, активный routing или исполнение.
