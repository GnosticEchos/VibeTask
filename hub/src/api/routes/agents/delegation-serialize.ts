import type { AgentDelegation, Project } from '../../../../prisma/generated/prisma/client.js';
import { DelegationMode } from '../../../infrastructure/auth/unified-auth.js';
import { getColumnBoundAllowance } from '../../../infrastructure/auth/agent-permissions.js';

export type DelegationWithProject = AgentDelegation & {
  project: Pick<Project, 'id' | 'name' | 'prefix'>;
};

export function serializeDelegation(d: DelegationWithProject, restrictedColumnName?: string | null) {
  const delegationMode = d.delegationMode as DelegationMode;
  return {
    id: d.id,
    apiKeyId: d.apiKeyId,
    projectId: d.projectId,
    projectName: d.project.name,
    projectPrefix: d.project.prefix,
    permissionLevel: d.permissionLevel,
    delegationMode: d.delegationMode,
    restrictedColumnId: d.restrictedColumnId,
    restrictedColumnName: restrictedColumnName ?? undefined,
    allowedMoveRange: d.allowedMoveRange,
    columnAllowance: getColumnBoundAllowance({
      delegationMode,
      restrictedColumnId: d.restrictedColumnId,
      allowedMoveRange: d.allowedMoveRange,
    }),
    isActive: d.isActive,
    revokedAt: d.revokedAt?.toISOString() ?? null,
    delegatedById: d.delegatedById,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}
