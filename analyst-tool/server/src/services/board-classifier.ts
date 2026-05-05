export type BoardKind =
  | 'domain-model'
  | 'context-map'
  | 'activity'
  | 'process'
  | 'import'
  | 'other';

export type BoardClassification = {
  kind: BoardKind;
  relatedId: string | null;
  displayName: string;
  group: string;
};

export function classifyBoard(basename: string): BoardClassification {
  if (basename === 'domain-model') {
    return {
      kind: 'domain-model',
      relatedId: null,
      displayName: 'Domain Model',
      group: 'Domain Model',
    };
  }

  if (basename === 'context-map') {
    return {
      kind: 'context-map',
      relatedId: null,
      displayName: 'Context Map',
      group: 'Context Map',
    };
  }

  const activityMatch = /^activity-(.+)$/.exec(basename);
  if (activityMatch) {
    return {
      kind: 'activity',
      relatedId: activityMatch[1],
      displayName: activityMatch[1],
      group: 'Activities (UC)',
    };
  }

  const processMatch = /^process-(.+)$/.exec(basename);
  if (processMatch) {
    return {
      kind: 'process',
      relatedId: processMatch[1],
      displayName: processMatch[1],
      group: 'Processes (BP)',
    };
  }

  const importMatch = /^(.+)-board$/.exec(basename);
  if (importMatch) {
    return {
      kind: 'import',
      relatedId: importMatch[1],
      displayName: importMatch[1],
      group: 'Imports',
    };
  }

  return {
    kind: 'other',
    relatedId: null,
    displayName: basename,
    group: 'Other',
  };
}
