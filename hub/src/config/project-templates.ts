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
      {
        name: '1. Specify',
        order: 0,
        roleType: 'STANDARD',
        description:
          'Specification phase. Clarify requirements, acceptance criteria, and spec documents. Do not implement production code.',
      },
      {
        name: '2. Plan',
        order: 1,
        roleType: 'STANDARD',
        description:
          'Planning phase. Decompose work into tasks and work packages, define dependencies, and prepare implementation plans.',
      },
      {
        name: '3. Implement',
        order: 2,
        roleType: 'STANDARD',
        description:
          'Implementation phase. Write code, tests, and docs per the approved plan. Complete deliverables before moving on.',
      },
      {
        name: '4. Review',
        order: 3,
        roleType: 'STANDARD',
        description:
          'Review phase. Critically assess correctness, security, and spec alignment. Give actionable feedback; avoid scope creep.',
      },
      {
        name: '5. Finalized',
        order: 4,
        roleType: 'COMPLETE',
        description:
          'Completed and accepted work. No further changes unless the task is intentionally reopened.',
      },
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
      {
        name: 'Inbox',
        order: 0,
        roleType: 'STANDARD',
        description:
          'Triage incoming work. Capture enough context for the next agent to act without guessing.',
      },
      {
        name: 'Doing',
        order: 1,
        roleType: 'STANDARD',
        description:
          'Active execution. Complete the scoped task with minimal, well-documented changes.',
      },
      {
        name: 'Waiting',
        order: 2,
        roleType: 'STANDARD',
        description:
          'Blocked or pending external input. Record what is needed before work can continue.',
      },
      {
        name: 'Done',
        order: 3,
        roleType: 'COMPLETE',
        description: 'Completed work. No further action unless the item is reopened.',
      },
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
