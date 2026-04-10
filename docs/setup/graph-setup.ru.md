[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Графовая инфраструктура

🇬🇧 [English version](graph-setup.md)

# Графовая инфраструктура

Docker-стек Neo4j + Excalidraw для графовых скиллов. Обязателен для всех `graph_*` скиллов.

## Что получите

| Сервис | Назначение | Порт по умолчанию |
|--------|-----------|-------------------|
| Neo4j | Графовая база данных | 3574 (HTTP), 3587 (Bolt) |
| Excalidraw | Визуальная доска | 3580 |
| Excalidraw Room | Совместная работа | 3581 |

## Шаг 1: Запустить Docker-стек

```bash
cd ~/NaCl
cp graph-infra/.env.example graph-infra/.env    # при необходимости измените пароли
docker compose -f graph-infra/docker-compose.yml up -d
```

## Шаг 2: Загрузить схему

Подождите ~30 секунд, затем:

```bash
CONTAINER=$(docker ps --format '{{.Names}}' | grep neo4j | head -1)
NEO4J_PASS=$(grep NEO4J_PASSWORD graph-infra/.env | cut -d= -f2)

for f in graph-infra/schema/ba-schema.cypher graph-infra/schema/sa-schema.cypher graph-infra/schema/tl-schema.cypher; do
  docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASS" < "$f"
done
```

## Шаг 3: MCP-сервер Neo4j

```bash
npm install -g @anthropic/neo4j-mcp
```

Добавьте в `.mcp.json` проекта:

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

Перезапустите Claude Code.

## Шаг 4: Проверка

В Claude Code: `/graph_ba_context` — если начнёт спрашивать о бизнес-домене, всё работает.

## Несколько проектов

Каждый проект получает свой Docker-стек с разными портами. Скилл `/project-init` делает это автоматически.

## Решение проблем

- **Neo4j не стартует**: проверьте, что Docker имеет достаточно памяти (мин. 2ГБ)
- **Схема не загружается**: откройте Neo4j Browser на `http://localhost:3574`, выполните `.cypher` файлы вручную
- **MCP не подключается**: проверьте `which neo4j-mcp`, `.mcp.json` в корне проекта, перезапустите Claude Code
