import { z } from 'zod';
import { prisma } from '../../../infrastructure/auth/index.js';
import { DelegationMode as DelegationModeEnum } from '../../../../prisma/generated/prisma/client.js';
import { BadRequestError } from '../../../infrastructure/http/middleware/error-handler.js';

export const delegationModeSchema = z.enum(['FULL', 'COLUMN_BOUND']);

export const latticeFieldsSchema = z.object({
  delegationMode: delegationModeSchema.optional(),
  restrictedColumnId: z.number().int().positive().optional().nullable(),
  allowedMoveRange: z.number().int().min(0).max(2).optional(),
});

export type LatticeInput = z.infer<typeof latticeFieldsSchema>;

export async function assertRestrictedColumnInProject(projectId: number, columnId: number): Promise<void> {
  const column = await prisma.projectColumn.findFirst({
    where: { id: columnId, projectId },
    select: { id: true },
  });
  if (!column) {
    throw new BadRequestError('restrictedColumnId must belong to the delegated project');
  }
}

export function resolveLatticeForCreate(input: {
  delegationMode?: 'FULL' | 'COLUMN_BOUND';
  restrictedColumnId?: number | null;
  allowedMoveRange?: number;
}): {
  delegationMode: DelegationModeEnum;
  restrictedColumnId: number | null;
  allowedMoveRange: number;
} {
  const mode = input.delegationMode ?? 'FULL';
  if (mode === 'COLUMN_BOUND') {
    if (input.restrictedColumnId == null) {
      throw new BadRequestError('restrictedColumnId is required when delegationMode is COLUMN_BOUND');
    }
    return {
      delegationMode: DelegationModeEnum.COLUMN_BOUND,
      restrictedColumnId: input.restrictedColumnId,
      allowedMoveRange: input.allowedMoveRange ?? 1,
    };
  }
  return {
    delegationMode: DelegationModeEnum.FULL,
    restrictedColumnId: null,
    allowedMoveRange: input.allowedMoveRange ?? 1,
  };
}

export async function resolveLatticeForUpdate(
  existing: { delegationMode: DelegationModeEnum; restrictedColumnId: number | null; allowedMoveRange: number },
  input: LatticeInput,
  projectId: number,
): Promise<{
  delegationMode: DelegationModeEnum;
  restrictedColumnId: number | null;
  allowedMoveRange: number;
}> {
  const mode =
    input.delegationMode != null
      ? input.delegationMode === 'COLUMN_BOUND'
        ? DelegationModeEnum.COLUMN_BOUND
        : DelegationModeEnum.FULL
      : existing.delegationMode;

  const allowedMoveRange = input.allowedMoveRange ?? existing.allowedMoveRange;

  if (mode === DelegationModeEnum.COLUMN_BOUND) {
    const restrictedColumnId =
      input.restrictedColumnId !== undefined
        ? input.restrictedColumnId
        : existing.restrictedColumnId;
    if (restrictedColumnId == null) {
      throw new BadRequestError('restrictedColumnId is required when delegationMode is COLUMN_BOUND');
    }
    await assertRestrictedColumnInProject(projectId, restrictedColumnId);
    return {
      delegationMode: DelegationModeEnum.COLUMN_BOUND,
      restrictedColumnId,
      allowedMoveRange,
    };
  }

  return {
    delegationMode: DelegationModeEnum.FULL,
    restrictedColumnId: null,
    allowedMoveRange,
  };
}
