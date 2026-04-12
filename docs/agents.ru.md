[Главная](../README.ru.md) > Архитектура агентов

# Архитектура агентов

NaCl назначает каждому скиллу когнитивный профиль: какая модель Claude его выполняет, насколько глубоко рассуждает и какие инструменты доступны. Шесть определений агентов в `.claude/agents/` кодируют эти профили. Скиллы-оркестраторы автоматически делегируют работу нужному агенту.

## Зачем нужен выбор модели

Модели Claude различаются по глубине рассуждений и стоимости:

| Модель | Сильная сторона | Стоимость (за MTok out) | Применение |
|--------|----------------|------------------------|------------|
| **Opus** | Глубокие рассуждения, кросс-системный анализ | $25 | Архитектура, валидация, ревью, планирование |
| **Sonnet** | Баланс скорости и качества | $15 | Генерация кода, структурный контент, тестирование |
| **Haiku** | Быстрый, низкая задержка | $5 | Запросы статуса, быстрые справки, синхронизация |

Запускать все 51 скилл на Opus -- расточительство бюджета на задачах, с которыми Sonnet справляется одинаково хорошо. Запускать всё на Haiku -- потеря качества там, где важны рассуждения. Архитектура агентов маршрутизирует каждый скилл на правильную модель.

## Frontmatter скилла

Каждый SKILL.md объявляет модель и уровень усилий:

```yaml
---
name: nacl-tl-review
model: opus
effort: high
description: |
  Code review for completed tasks...
---
```

| Поле | Значения | Эффект |
|------|----------|--------|
| `model` | `opus`, `sonnet`, `haiku` | Какая модель Claude выполняет скилл |
| `effort` | `high`, `medium`, `low` | Глубина рассуждений (бюджет адаптивного мышления) |

## Шесть агентов

Агенты расположены в `.claude/agents/` и при установке симлинкуются в `~/.claude/agents/` (тот же паттерн, что и скиллы). Каждый агент определяет модель, уровень усилий, ограничения инструментов и системный промпт с описанием когнитивного профиля.

### strategist -- Opus, high effort (12 скиллов)

Думающий мозг. Читает, анализирует, выносит суждения -- никогда не пишет код.

**Инструменты:** Read, Grep, Glob, Bash (без Write и Edit)

**Скиллы:**
- SA-архитектура: `nacl-sa-architect`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-sa-uc`
- BA-валидация: `nacl-ba-validate`
- TL-планирование: `nacl-tl-plan`, `nacl-tl-intake`, `nacl-tl-diagnose`, `nacl-tl-reconcile`
- TL-качество: `nacl-tl-review`, `nacl-tl-hotfix`

**Почему Opus:** Эти скиллы принимают решения, которые каскадно влияют на всё последующее. Неправильная архитектура обесценивает всю разработку. Пропущенные замечания на ревью становятся продакшен-багами.

### analyst -- Sonnet, medium effort (11 скиллов)

Доменный моделист. Создаёт структурированные артефакты BA/SA из доменных знаний.

**Инструменты:** Read, Grep, Glob, Write

**Скиллы:**
- BA-фазы: `nacl-ba-context`, `nacl-ba-process`, `nacl-ba-workflow`, `nacl-ba-entities`, `nacl-ba-roles`, `nacl-ba-glossary`, `nacl-ba-rules`, `nacl-ba-handoff`
- SA-контент: `nacl-sa-roles`, `nacl-sa-ui`, `nacl-sa-finalize`

**Почему Sonnet:** Эти скиллы заполняют структурированные шаблоны доменными знаниями от пользователя. Вызов здесь -- формализация, а не изобретение.

### developer -- Sonnet, medium effort (6 скиллов)

Генератор кода. Реализует фичи через TDD из спецификаций.

**Инструменты:** Read, Write, Edit, Grep, Glob, Bash

**Скиллы:** `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-docs`, `nacl-tl-reopened`

**Почему Sonnet:** Генерация кода из готовых спецификаций -- задача трансляции. Sonnet сравним с Opus по качеству (в пределах 2-3%), но работает быстрее и дешевле.

### verifier -- Sonnet, medium effort (5 скиллов)

Контроль качества. Тестирует, верифицирует, отчитывается -- не модифицирует код.

**Инструменты:** Read, Grep, Glob, Bash

**Скиллы:** `nacl-tl-verify`, `nacl-tl-verify-code`, `nacl-tl-qa`, `nacl-tl-sync`, `nacl-tl-stubs`

**Почему Sonnet:** Верификация -- системный процесс: трассировка потоков данных, сопоставление API-контрактов, выполнение E2E-сценариев. Поиск паттернов, а не творческие рассуждения.

### operator -- Sonnet, low effort (7 скиллов)

Шипинг. Git-операции, мониторинг CI/CD, публикация.

**Инструменты:** Read, Grep, Bash

**Скиллы:** `nacl-tl-ship`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-release`, `nacl-render`, `nacl-publish`, `nacl-ba-from-board`

**Почему Sonnet + low effort:** Эти скиллы следуют жёстким сценариям из `config.yaml`. Никаких оценочных суждений -- только выполнение и отчёт.

### scout -- Haiku, low effort (6 скиллов)

Быстрая разведка. Запросы статуса и лёгкие операции.

**Инструменты:** Read, Grep, Glob

**Скиллы:** `nacl-tl-status`, `nacl-tl-next`, `nacl-ba-analyze`, `nacl-ba-sync`, `nacl-ba-import-doc`, `nacl-init`

**Почему Haiku:** Эти скиллы выполняют простые запросы к Neo4j или разбирают структурированные данные. Скорость важнее глубины.

## Оркестраторы

Четыре оркестратора (`nacl-ba-full`, `nacl-sa-full`, `nacl-tl-conductor`, `nacl-tl-full`) работают в **контексте основной сессии** с `model: opus` и `effort: high`. Они -- мозг, который делегирует. Они никогда не получают `context: fork`.

Оркестраторы делегируют работу агентам через инструмент Agent:

```
L0: Оркестратор (основная сессия, Opus)
  |
  +-- Agent(strategist) -> /nacl-tl-review UC028
  +-- Agent(developer)  -> /nacl-tl-dev-be UC028
  +-- Agent(verifier)   -> /nacl-tl-verify UC028
  +-- Agent(operator)   -> /nacl-tl-ship
```

Скиллы **не** предзагружаются в агентов. Оркестратор передаёт конкретное имя скилла в промпте при делегировании. Это предотвращает раздувание контекста от загрузки 200-400 строк на скилл заранее.

## Распределение моделей

```
                opus (16)             sonnet (29)           haiku (6)
              ┌─────────────┐    ┌──────────────────┐    ┌──────────┐
  effort:high │ strategist  │    │                  │    │          │
              │ (12 скиллов)│    │                  │    │          │
              │ orchestrator│    │                  │    │          │
              │ (4 скилла)  │    │                  │    │          │
              ├─────────────┤    ├──────────────────┤    │          │
effort:medium │             │    │ analyst (11)     │    │          │
              │             │    │ developer (6)    │    │          │
              │             │    │ verifier (5)     │    │          │
              ├─────────────┤    ├──────────────────┤    ├──────────┤
  effort:low  │             │    │ operator (7)     │    │ scout(6) │
              └─────────────┘    └──────────────────┘    └──────────┘
```

## Установка

Агенты устанавливаются вместе со скиллами через симлинки:

```bash
# Unix/macOS/Linux
mkdir -p ~/.claude/agents
for file in ~/NaCl/.claude/agents/*.md; do
  [ -f "$file" ] && ln -sf "$file" ~/.claude/agents/"$(basename "$file")"
done
```

```powershell
# Windows (PowerShell, от администратора)
$agentsDir = "$env:USERPROFILE\.claude\agents"
New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null
Get-ChildItem -Path "$HOME\NaCl\.claude\agents" -Filter "*.md" | ForEach-Object {
    $target = Join-Path $agentsDir $_.Name
    if (Test-Path $target) { Remove-Item $target -Force }
    New-Item -ItemType SymbolicLink -Path $target -Target $_.FullName | Out-Null
}
```

Платформенные руководства: [macOS](setup/install-macos.ru.md) | [Linux](setup/install-linux.ru.md) | [Windows](setup/install-windows.ru.md)

## Принципы проектирования

1. **Думатели не пишут.** У strategist нет инструментов Write и Edit. Он читает, анализирует и выносит вердикты. Разделение суждения и реализации не позволяет ревьюеру тихо "починить" код во время ревью.

2. **Скиллы загружаются по запросу.** Агенты не предзагружают скиллы через поле `skills:` в frontmatter. 12 скиллов по 200-400 строк каждый -- это 2400-4800 строк контекста, съеденных до начала работы.

3. **Оркестраторы никогда не форкаются.** Оркестраторы работают в основной сессии, чтобы взаимодействовать с пользователем на точках согласования. Делегирование -- через инструмент Agent, а не `context: fork`.

4. **Назначения устареют.** По мере улучшения моделей Sonnet может справляться с задачами, сейчас назначенными Opus. Пересматривайте назначения при выходе новых версий моделей. Статья Anthropic о Managed Agents предупреждает: "harnesses encode assumptions about what Claude can't do on its own. Those assumptions need to be frequently questioned."
