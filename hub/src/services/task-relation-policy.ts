/**
 * Task relation policies for move operations.
 */

import { prisma } from '../infrastructure/auth/index.js';
import { ForbiddenError } from '../infrastructure/http/middleware/error-handler.js';

type ColumnLike = { type?: string | null; name?: string | null } | null | undefined;

/** Column types that count as "done" for blocked-by enforcement. */
export function isCompletionColumn(column: ColumnLike): boolean {
  if (!column) return false;
  const type = String(column.type ?? '').toLowerCase();
  const name = String(column.name ?? '').toLowerCase();
  return type === 'end' || type === 'done' || name.includes('done');
}

/**
 * When moving into a completion column, reject if this task is blocked-by
 * another task that is not yet in a completion column.
 */
export async function assertMoveAllowedWhenBlocked(
  task: { relationMode: string | null; relationId: number | null },
  targetColumnId: number,
): Promise<void> {
  if (task.relationMode !== 'blocked-by' || task.relationId == null) {
    return;
  }

  const targetColumn = await prisma.projectColumn.findUnique({
    where: { id: targetColumnId },
    select: { type: true, name: true },
  });

  if (!isCompletionColumn(targetColumn)) {
    return;
  }

  const blocker = await prisma.task.findUnique({
    where: { id: task.relationId },
    select: {
      identifier: true,
      column: { select: { type: true, name: true } },
    },
  });

  if (!blocker) {
    return;
  }

  if (!isCompletionColumn(blocker.column)) {
    throw new ForbiddenError(
      `Cannot complete this task: it is blocked by ${blocker.identifier}, which is not in a Done column yet`,
    );
  }
}
