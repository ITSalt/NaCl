[Главная](../README.ru.md) > Быстрый старт

🇬🇧 [English version](quickstart.md)

# Быстрый старт

От нуля до первого запуска скилла за 10 минут.

## Предварительные требования

- [Claude Code CLI](https://claude.ai/code) установлен и аутентифицирован
- [Docker](https://docs.docker.com/get-docker/) установлен и запущен
- [Git](https://git-scm.com/)
- [Node.js 18+](https://nodejs.org/) (только для опциональных CLI-инструментов)

## Шаг 1: Клонировать репозиторий

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl
```

> Измените `~/NaCl` на удобный вам путь. Далее в инструкциях используется `$NACL_DIR`.

## Шаг 2: Подключить скиллы к Claude Code

```bash
mkdir -p ~/.claude/skills

for dir in ~/NaCl/*/; do
  if [ -f "$dir/SKILL.md" ]; then
    name=$(basename "$dir")
    ln -sf "$dir" ~/.claude/skills/"$name"
  fi
done

echo "Подключено $(ls ~/.claude/skills/ | wc -l) скиллов"
```

Создаёт симлинки, чтобы Claude Code находил скиллы как слэш-команды.

## Шаг 3: Запустить графовую инфраструктуру

```bash
cd ~/NaCl
cp graph-infra/.env.example graph-infra/.env
docker compose -f graph-infra/docker-compose.yml up -d
```

Подождите ~30 секунд, пока Neo4j стартует, затем загрузите схему:

```bash
CONTAINER=$(docker ps --format '{{.Names}}' | grep neo4j | head -1)
NEO4J_PASS=$(grep NEO4J_PASSWORD graph-infra/.env | cut -d= -f2)

for f in graph-infra/schema/ba-schema.cypher graph-infra/schema/sa-schema.cypher graph-infra/schema/tl-schema.cypher; do
  docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASS" < "$f"
done
```

## Шаг 4: Настроить MCP-сервер Neo4j

Установите MCP-сервер Neo4j:

```bash
npm install -g @anthropic/neo4j-mcp
```

Добавьте в `.mcp.json` вашего проекта:

```json
{
  "mcpServers": {
    "neo4j": {
      "type": "stdio",
      "command": "neo4j-mcp",
      "env": {
        "NEO4J_URI": "bolt://localhost:3587",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "neo4j_graph_dev",
        "NEO4J_DATABASE": "neo4j"
      }
    }
  }
}
```

Перезапустите Claude Code для подключения MCP-сервера.

## Шаг 5: Инициализировать первый проект

Откройте Claude Code в директории вашего проекта:

```
/nacl-init "Название проекта"
```

Создаст `CLAUDE.md` и `config.yaml`. Затем запустите полный пайплайн:

```
/nacl-ba-full
```

Claude проведёт вас через бизнес-анализ интерактивно, сохраняя всё в Neo4j-граф.

## Что дальше?

- **Полный пайплайн**: [Сценарии](workflows.ru.md) — готовые end-to-end сценарии
- **Все скиллы**: [Каталог скиллов](skills-reference.ru.md) — полный справочник
- **Архитектура**: [Архитектура](architecture.ru.md) — как всё устроено
- **Установка**: [macOS](setup/install-macos.ru.md) | [Linux](setup/install-linux.ru.md) | [Windows](setup/install-windows.ru.md)
- **Доп. инструменты**: [Docmost и YouGile](setup/optional-tools.ru.md)
