# WP-01: карта источников Codex workflow

NaCl SHA 20fe4c6a56482e85d3ea9a9ebaadb37206047e41. Read-only сравнение файлов checkout; builder в этой сверке не запускался. Позднейший full-package --check описан в [матрице](WP-01-acceptance-matrix.md). SHA-256 относятся только к SKILL.md, не к ресурсам или installed runtime. Выбор overlay задан scripts/codex-plugin-manifest.json; совпадение bytes не доказывает семантическую эквивалентность root и Codex.

| Root | Выбранный source | Generated workflow SHA-256 | Результат |
|---|---|---|---|
| nacl-ba-analyze | skills-for-codex/nacl-ba-analyze/SKILL.md | a889f48917d8bf8972569d2e53126146dd6d165ac2f5b7bf39192cc1813aed70 | MATCH |
| nacl-ba-context | skills-for-codex/nacl-ba-context/SKILL.md | f83b21963c0b0f0cba33a14fc2e513ed2643df20e0afad1ef92067f88b6adaf7 | MATCH |
| nacl-ba-entities | skills-for-codex/nacl-ba-entities/SKILL.md | c447557f3c153556f00b126c5e2deccbec781ef9cff81fbb91fdf5a94fe9a279 | MATCH |
| nacl-ba-from-board | skills-for-codex/nacl-ba-from-board/SKILL.md | 029561976b5c523fbfd32383cf7d668a43d938e1a06d4a137da4ce04d057229a | MATCH |
| nacl-ba-full | codex-plugin-src/workflow-overlays/nacl-ba-full/SKILL.md | f4cb44a638f624d92ba817bad9bf2c9061242a9434744f9b54c7f5bc1e179164 | MATCH |
| nacl-ba-glossary | skills-for-codex/nacl-ba-glossary/SKILL.md | aa158b9dee4fc550ad057d9a9420fdabb22d2d3c88e5f184bf40a91923eaca92 | MATCH |
| nacl-ba-handoff | skills-for-codex/nacl-ba-handoff/SKILL.md | 389fb0d3d0383cae922695b9de4284acb296698da2b4e6e37395005c8792e544 | MATCH |
| nacl-ba-import-doc | skills-for-codex/nacl-ba-import-doc/SKILL.md | 3396a0ed840be813335d0adb195d349561988695576ee92bfb491b0c3db0a7da | MATCH |
| nacl-ba-process | skills-for-codex/nacl-ba-process/SKILL.md | eac0801f0eff90e6903ed4ad9e46df947c30e247f25173a1e704bc64f72fc92a | MATCH |
| nacl-ba-roles | skills-for-codex/nacl-ba-roles/SKILL.md | d5e203a9b02b9387b817ba511fd0ff1ec78bc148e8f557cd8eda613fe471c84a | MATCH |
| nacl-ba-rules | skills-for-codex/nacl-ba-rules/SKILL.md | 00c5abcdaeb9597abf8477eb6d72cc319d372f4a6edf2524a0d4209f161f2bee | MATCH |
| nacl-ba-sync | skills-for-codex/nacl-ba-sync/SKILL.md | 6fba19301f43176c5c84368705ccf610f97ff7ea1de2213c1a17c35df337b8b5 | MATCH |
| nacl-ba-validate | skills-for-codex/nacl-ba-validate/SKILL.md | 03688c443050109530e5b8bf5382d8e95e090ff35d7aba5accfa9cdc1eb20185 | MATCH |
| nacl-ba-workflow | skills-for-codex/nacl-ba-workflow/SKILL.md | 7432757bc7a603c0f455f61cf330a03237a156c017d16b97e69931f4be458adc | MATCH |
| nacl-core | codex-plugin-src/workflow-overlays/nacl-core/SKILL.md | c078a153332e472d7f3eeccc8309825d52a9f38fb10f22508cdee53218e61fc0 | MATCH |
| nacl-goal | codex-plugin-src/workflow-overlays/nacl-goal/SKILL.md | d6d6098141aef46f31af11af096efed839104a63f35c68455eda1dace50ad7a4 | MATCH |
| nacl-init | codex-plugin-src/workflow-overlays/nacl-init/SKILL.md | c19f9b0e35c9ecffd8150626c43d675456f16747b52d25d58a41cccf701f903a | MATCH |
| nacl-migrate | codex-plugin-src/workflow-overlays/nacl-migrate/SKILL.md | 8d0a75749a96bdf2db80bac397ddeaf0a7895c33667ccef6a8e8230d2a07fd73 | MATCH |
| nacl-migrate-ba | skills-for-codex/nacl-migrate-ba/SKILL.md | 4007a3ac5ed9985656e92c9c9e8bd9d913396507d2fc3891a669d2c1a572767d | MATCH |
| nacl-migrate-core | resource без workflow | — | не применимо |
| nacl-migrate-sa | codex-plugin-src/workflow-overlays/nacl-migrate-sa/SKILL.md | fefbbe244985dac9e4324e040a482d077dc982fad50fed92a69f06fb71b9988b | MATCH |
| nacl-postmortem | skills-for-codex/nacl-postmortem/SKILL.md | a21f19d78b062e8209b13d387c6abb440d83adca9ac399822a3ac653d4d2c56a | MATCH |
| nacl-publish | codex-plugin-src/workflow-overlays/nacl-publish/SKILL.md | f3fc1193443ab4d38d964b42270fee04ee1be2ee1c7c2234cb361d7adc509162 | MATCH |
| nacl-render | skills-for-codex/nacl-render/SKILL.md | 94c98db29d8266395fd34206c8608b89ceb0bd3e0a8e81fd75123f3d92e9bfaf | MATCH |
| nacl-sa-architect | codex-plugin-src/workflow-overlays/nacl-sa-architect/SKILL.md | d7fc65f9be054bce7bba21c78ac734f92509b5b9a7e3ed8da9c457096332566c | MATCH |
| nacl-sa-domain | skills-for-codex/nacl-sa-domain/SKILL.md | 9351628292bcdf8b10dc0fbd0affb0f92ced3463ed9f63f93c36521f0351d129 | MATCH |
| nacl-sa-feature | skills-for-codex/nacl-sa-feature/SKILL.md | 37d08b687b899de2e3a7818724fc121b4aebbed67db41d66f5482c901cd57f8a | MATCH |
| nacl-sa-finalize | skills-for-codex/nacl-sa-finalize/SKILL.md | b01459327a6a7c4e2f440c3207e7c28c2d0a24b1d10038fefd77d8e19023bded | MATCH |
| nacl-sa-flags | skills-for-codex/nacl-sa-flags/SKILL.md | 88337c39a969af3f2402e35383ef0d95b756278192a1def0dfd1c80b2f7e1387 | MATCH |
| nacl-sa-full | codex-plugin-src/workflow-overlays/nacl-sa-full/SKILL.md | 44a46bc40d4ac064dad31fbbd36abf0afcaca048b78c933a098a3aba5890d53d | MATCH |
| nacl-sa-roles | skills-for-codex/nacl-sa-roles/SKILL.md | 348bd1aecbd8169ff126ad847ed27f40a34ea3766566e25788613262aaa2ee48 | MATCH |
| nacl-sa-uc | skills-for-codex/nacl-sa-uc/SKILL.md | 22b63fe291e6f0117effbc1d50505edbb75868895d692a384988a7ebe7fbc24a | MATCH |
| nacl-sa-ui | skills-for-codex/nacl-sa-ui/SKILL.md | 2e700a300b788c35ac175903bd5f24def2eebf14cd40df33d2bd635664f8b603 | MATCH |
| nacl-sa-validate | codex-plugin-src/workflow-overlays/nacl-sa-validate/SKILL.md | 00da4073a99157f16fb69d8a0e8c4f719aa01fab858275878008d679dba27417 | MATCH |
| nacl-tl-conductor | codex-plugin-src/workflow-overlays/nacl-tl-conductor/SKILL.md | f729bf7f8e119a61e0eae9457349aef23db05a3ed33b054933492ed7a5627531 | MATCH |
| nacl-tl-core | codex-plugin-src/workflow-overlays/nacl-tl-core/SKILL.md | 6529e5edd739c8fab3bdb5bca7b4d5d3be1046b0ba6fc244922ffaca3e52ed1f | MATCH |
| nacl-tl-deliver | skills-for-codex/nacl-tl-deliver/SKILL.md | 4e6b91606b0e59fffbeea2c56b65a3d334b5dd65693e0c4ba0aa08109f10ba9e | MATCH |
| nacl-tl-deploy | skills-for-codex/nacl-tl-deploy/SKILL.md | 2538d6cee3d8cb85b272d38d0e27ffccfc20fc87310d2a3ba73df2cc5222ce45 | MATCH |
| nacl-tl-dev | skills-for-codex/nacl-tl-dev/SKILL.md | 8505613753663e35922ffe97617580f337040cd3a9fe27b254139b5e4b22e716 | MATCH |
| nacl-tl-dev-be | skills-for-codex/nacl-tl-dev-be/SKILL.md | e4268208984c1ad8e1a89bf912c229e303588c3e50441913baabbab033e70ebf | MATCH |
| nacl-tl-dev-fe | skills-for-codex/nacl-tl-dev-fe/SKILL.md | 70124688f7cec1355abef38bce19df2b1056f1c37545c23860c16fdb61c60470 | MATCH |
| nacl-tl-diagnose | skills-for-codex/nacl-tl-diagnose/SKILL.md | d5b1babc9d52d44a84cf975ec5fd444893641a9a0245be9c7de591ee499520d5 | MATCH |
| nacl-tl-docs | skills-for-codex/nacl-tl-docs/SKILL.md | 898c2f38777bedf73ca0b87937a6b09d9ba7a48c6c6a7d4281d39f4247fdb11f | MATCH |
| nacl-tl-fix | codex-plugin-src/workflow-overlays/nacl-tl-fix/SKILL.md | c66075b27f2151a362714e421245e48fcdb62ec269a3e7482948bbe560a4d255 | MATCH |
| nacl-tl-full | codex-plugin-src/workflow-overlays/nacl-tl-full/SKILL.md | 203cdc6bc52a1ff63b069afdc877d092a2b53f95719e06994c9a8ab9c7e1b3ca | MATCH |
| nacl-tl-hotfix | skills-for-codex/nacl-tl-hotfix/SKILL.md | 87d5523d072497a8b833026a45ad63103e828cc4507b5677574c4397595f045b | MATCH |
| nacl-tl-intake | codex-plugin-src/workflow-overlays/nacl-tl-intake/SKILL.md | 70c0ed0c2b932def2a082345cadc136a2a1423b7325fcc61805770816f2c120f | MATCH |
| nacl-tl-next | codex-plugin-src/workflow-overlays/nacl-tl-next/SKILL.md | 8fa5dea9259606cabe2acda8611c22e9d5b5fe855a87382bcd45175d8ac97114 | MATCH |
| nacl-tl-plan | codex-plugin-src/workflow-overlays/nacl-tl-plan/SKILL.md | bdb5a74d3cb91f41deb64f1255f6723c8b23250d9ae87ef94fbc360989e770ab | MATCH |
| nacl-tl-qa | skills-for-codex/nacl-tl-qa/SKILL.md | 2bbe3c372f609783789a156b9a7a509593b63fed560a2c5acf6465f1ff53b29b | MATCH |
| nacl-tl-reconcile | skills-for-codex/nacl-tl-reconcile/SKILL.md | e42b1a46777e20c0d2e109733d759578b68a082ee97d81205d2a8b05370bf376 | MATCH |
| nacl-tl-regression-test | skills-for-codex/nacl-tl-regression-test/SKILL.md | e3890e06e9ddedf9a539443346e3fca8cac296efdaa12c67771fe58d9d92c539 | MATCH |
| nacl-tl-release | codex-plugin-src/workflow-overlays/nacl-tl-release/SKILL.md | 4de77f54a3b288576c75940d534469d0185e6645252a4b380ee7e9287906fca6 | MATCH |
| nacl-tl-reopened | codex-plugin-src/workflow-overlays/nacl-tl-reopened/SKILL.md | 7a0b03b3ceeb127eb80d51559e1d1f44c684ba951f06c6240c9974405edd24c5 | MATCH |
| nacl-tl-review | codex-plugin-src/workflow-overlays/nacl-tl-review/SKILL.md | 57aed632a82a616be67b070d98b20b57352475993b3f9991c475c22e423c28f4 | MATCH |
| nacl-tl-ship | codex-plugin-src/workflow-overlays/nacl-tl-ship/SKILL.md | 5f39d9a3edec565756db1562e295d9c8d99ede925bc02182702097a1a3b86092 | MATCH |
| nacl-tl-status | skills-for-codex/nacl-tl-status/SKILL.md | f80a917db7f7d6417a31a79d421784474f4f4917261c7e047179f69c3eb918d1 | MATCH |
| nacl-tl-stubs | skills-for-codex/nacl-tl-stubs/SKILL.md | 403e2fcd94d1613fadd1b96dc93566c455b4c2f8d0ca66da1046581f21fbf19c | MATCH |
| nacl-tl-sync | skills-for-codex/nacl-tl-sync/SKILL.md | ecda2642f5ad4363ddf2001aa982efb36302d2dcecbdd42271f48b1d1cb7f452 | MATCH |
| nacl-tl-verify | skills-for-codex/nacl-tl-verify/SKILL.md | 1bcda8cb4da8dd60d8f061d3eb082fab3acc1059e659abb4b63b865eb174c253 | MATCH |
| nacl-tl-verify-code | skills-for-codex/nacl-tl-verify-code/SKILL.md | ec5b4835c244869af6ec9f875bdcd29e57207e25d5a816c7cc3285ea8177a47e | MATCH |

Итого: 60 совпадений, 0 отсутствий, 21 объявленных overlays. Независимый reviewer сверил все 61 строку и SHA-256 с Git objects закреплённого SHA; расхождений нет. Ресурсные деревья, transforms, skills-only closure, active routing и исполнение не проверены; см. WP-01-sa-projection-provenance.md и WP-10-preliminary.md.
