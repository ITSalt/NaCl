// Synthetic placeholder for the project-alpha shared Task / FileType.
// Real source: packages/shared/src/task-105.ts in the Project-Alpha monorepo.
export type FileType = 'image' | 'video' | 'audio' | 'document';

export interface Task {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}
