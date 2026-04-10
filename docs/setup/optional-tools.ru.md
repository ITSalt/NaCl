[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Дополнительные инструменты

🇬🇧 [English version](optional-tools.md)

# Дополнительные инструменты

Эти интеграции **не обязательны**. Скиллы работают без них — результаты выводятся в терминал и локальные файлы.

## Docmost

[Docmost](https://docmost.com/) — self-hosted wiki. NaCl может публиковать результаты анализа в страницы Docmost.

**MCP-сервер** (с поддержкой комментариев):
```bash
git clone https://github.com/ITSalt/docmost-mcp.git
cd docmost-mcp && npm install && npm run build
```

**CLI-инструмент** (токен-эффективная публикация):
```bash
cd ~/NaCl/docmost-sync && npm install && npm run build
```

## YouGile

[YouGile](https://yougile.com/) — система управления проектами. NaCl может создавать задачи и перемещать их по колонкам.

**MCP-сервер**:
```bash
git clone https://github.com/ichinya/yougile-mcp.git
cd yougile-mcp && npm install && npm run build
```

**CLI-инструмент** (настройка досок):
```bash
cd ~/NaCl/yougile-setup && npm install && npm run build
```

## Без дополнительных инструментов

- Данные графа остаются в Neo4j. Экспорт в Markdown через `/nacl-render`
- Задачи управляются через файлы `.tl/tasks/` и git
- Все скиллы анализа и разработки работают нормально
