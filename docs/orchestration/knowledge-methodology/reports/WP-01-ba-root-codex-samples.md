# WP-01: 13 BA workflows — выборка root/Codex контрактов

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Это по одному общему контракту и точечному различию на пакет, не полный semantic diff и не доказательство runtime. Root — nacl-ba-<имя>/SKILL.md, Codex — skills-for-codex/nacl-ba-<имя>/SKILL.md. Closed статусы и confirmation — заявленный текст; отсутствие в указанном фрагменте не доказывает отсутствие во всей версии.

| Workflow | Общий контракт | Выборочное отличие или открытый вопрос |
|---|---|---|
| analyze | Root :230–245,343–352; Codex :33–43: snapshot diff и graph comparison | Codex :21–29,40–43 делает graph/snapshot доступность условной и задаёт partial/NOT_RUN; snapshot может писать файл |
| context | Root :20–36; Codex :20–32: подтверждение до graph write | Root :40–45 называет конкретные MCP, Codex :22–32 требует capability/schema preflight и BLOCKED при недоступности |
| entities | Root :66–75,89–97; Codex :20–40: подтверждение entities и schema/ID | Codex :22–31 уточняет загрузку impact и read-back/blocked |
| from-board | Root :11–21; Codex :55–69: import/analyze/sync | Root :125–132 предписывает auto-create, когда нет активной и существующих boards; Codex :45–60 одновременно указывает BLOCKED при отсутствии board и описывает new/import. Это неоднозначность первого запуска; одинаковые invocation и runtime проверить |
| glossary | Root :23–43; Codex :20–42: full/incremental, full может удалять | В указанном Codex фрагменте отдельное подтверждение удаления и read-back; не утверждать полное отсутствие root confirmation |
| handoff | Root :26–46,126; Codex :19–31: BA-only при отсутствии SA и подтверждение edges | Codex задаёт PARTIALLY_VERIFIED/NOT_RUN для неполной cross-layer части; actual consumers неизвестны |
| import-doc | Root :11–15,87–93; Codex :20–30,54–55: board-only, XLSX entities | Root :51–67 описывает автоматический разбор, Codex :83–95 ставит parsing и PDF coverage в зависимость от доступности |
| process | Root :12–14,64–72; Codex :40–52: process groups и подтверждённые факты | Root :67–70 задаёт разные фазы записи, Codex :21–30,64–67 — closed BLOCKED и read-back |
| roles | Root :12–14,65–79; Codex :38–53,55–62: roles и матрица | Codex :21–29,52–53 явно подтверждает matrix repair и требует read-back |
| rules | Root :11–23,111–116; Codex :46–60: типизированные traceable rules | Codex :19–28 задаёт BLOCKED и read-back; root :120–125 проверяет graph source |
| sync | Root :13–15; Codex :19–29,32–47: board→graph→markers | Root :17 заявляет единственный BA graph writer, тогда как другие BA root skills также описывают graph writes; Codex ограничивает описание board-to-graph. Это текстовая несогласованность, не runtime эксклюзивность |
| validate | Root :12–20; Codex :19–35: read-only проверки | При отсутствии SA root :144–146 выполняет internal с warning, Codex :23–27,63–72 указывает NOT_RUN cross / PARTIALLY_VERIFIED |
| workflow | Root :12–14,513–525; Codex :49–57,67–73: graph decomposition и максимум 12 шагов, один исполнитель | Root :537–542 задаёт максимум 3 исходящие ветви; в Codex SKILL и проверенных прямых references этот численный предел не найден, полную closure и runtime проверить до вывода о семантическом пропуске |

Проверить остальные клиентские ресурсы, фактический routing, negative cases и consumers. Ни один workflow/graph в этой сверке не запускался; различия текста подтверждены указанными фрагментами; runtime effect и полнота closure остаются гипотезами.
