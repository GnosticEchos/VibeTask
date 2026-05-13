/**
 * Project Templates
 *
 * Default configurations for new projects. Templates seed columns and settings
 * but do not create a separate persistence model — everything maps to Project,
 * Column, and Task.
 */

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  columns: Array<{
    name: string;
    order: number;
    color?: string;
    type?: string | null;
    description?: string | null;
    roleType?: string;
  }>;
  settings: Record<string, unknown>;
}

export const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
  LIFECYCLE_EPIC: {
    id: 'LIFECYCLE_EPIC',
    name: 'Lifecycle / Epic',
    description: 'Full lifecycle with sub-board expansion: Specify → Plan → Implement → Review → Finalized',
    columns: [
      { name: '1. Specify', order: 0, roleType: 'STANDARD' },
      { name: '2. Plan', order: 1, roleType: 'STANDARD' },
      { name: '3. Implement', order: 2, roleType: 'STANDARD' },
      { name: '4. Review', order: 3, roleType: 'STANDARD' },
      { name: '5. Finalized', order: 4, roleType: 'COMPLETE' },
    ],
    settings: {
      enableEpicExpansion: true,
      subBoardOutlineColor: '#8B5CF6',
    },
  },
  ADHOC_OPS: {
    id: 'ADHOC_OPS',
    name: 'Ad-hoc Ops / Research',
    description: 'Lightweight queue for ops and research work: Inbox → Doing → Waiting → Done',
    columns: [
      { name: 'Inbox', order: 0, roleType: 'STANDARD' },
      { name: 'Doing', order: 1, roleType: 'STANDARD' },
      { name: 'Waiting', order: 2, roleType: 'STANDARD' },
      { name: 'Done', order: 3, roleType: 'COMPLETE' },
    ],
    settings: {
      enableEpicExpansion: false,
    },
  },
};

export function getTemplateById(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES[id];
}

export function listTemplates(): ProjectTemplate[] {
  return Object.values(PROJECT_TEMPLATES);
}
