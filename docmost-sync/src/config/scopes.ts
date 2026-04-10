import { ScopeConfig } from '../types.js';

export const SA_SCOPE: ScopeConfig = {
  name: 'sa',
  manifestFile: '.docmost-sync.json',
  includePatterns: [
    '10-*/**', '11-*/**', '12-*/**', '13-*/**',
    '14-*/**', '15-*/**', '16-*/**', '99-meta/**', '_index.md'
  ],
  excludePatterns: ['00-*/**', '01-*/**', '02-*/**', '03-*/**', '04-*/**'],
  folderTitleMap: {
    '10-architecture': '10. Архитектура',
    '11-domain': '11. Domain Model',
    '11-domain/entities': 'Сущности',
    '11-domain/enumerations': 'Справочники',
    '12-usecases': '12. Use Cases',
    '13-interfaces': '13. Интерфейсы',
    '14-implementation': '14. Реализация',
    '15-guides': '15. Руководства',
    '16-requirements': '16. Требования',
    '99-meta': '99. Метаданные',
  },
  specialFileTitles: {
    '_index.md': 'Оглавление',
    '_domain-model.md': 'Сводная доменная модель',
    '_uc-index.md': 'Реестр Use Cases',
    '_component-catalog.md': 'Каталог компонентов',
    '_form-domain-mapping.md': 'Маппинг форм на доменные типы',
  },
};

export const BA_SCOPE: ScopeConfig = {
  name: 'ba',
  manifestFile: '.docmost-sync-ba.json',
  includePatterns: [
    '00-*/**', '01-*/**', '02-*/**', '03-*/**', '04-*/**',
    '99-meta/glossary.md', '99-meta/ba-validation-report.md'
  ],
  excludePatterns: [
    '10-*/**', '11-*/**', '12-*/**', '13-*/**',
    '14-*/**', '15-*/**', '16-*/**'
  ],
  folderTitleMap: {
    '00-context': '00. Контекст системы',
    '01-business-processes': '01. Бизнес-процессы',
    '01-business-processes/groups': '01.1. Группы процессов',
    '01-business-processes/processes': '01.2. Карточки процессов',
    '01-business-processes/workflows': '01.3. Потоки работ',
    '02-business-entities': '02. Бизнес-сущности',
    '02-business-entities/entities': 'Сущности',
    '02-business-entities/states': 'Жизненные циклы',
    '03-business-roles': '03. Бизнес-роли',
    '03-business-roles/roles': 'Роли',
    '04-business-rules': '04. Бизнес-правила',
    '04-business-rules/rules': 'Правила',
    '99-meta': '99. Метаданные',
  },
  specialFileTitles: {
    '_process-registry.md': 'Реестр бизнес-процессов',
    '_entity-registry.md': 'Реестр бизнес-сущностей',
    '_entity-process-matrix.md': 'Матрица сущностей и процессов',
    '_role-registry.md': 'Реестр бизнес-ролей',
    '_role-process-matrix.md': 'Матрица ролей и процессов',
    '_rules-catalog.md': 'Каталог бизнес-правил',
  },
};
