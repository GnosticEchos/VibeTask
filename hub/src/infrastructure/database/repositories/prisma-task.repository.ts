import type { PrismaClient, Task, Prisma } from '../../../../prisma/generated/prisma/client.js';
import { ITaskRepository } from '../../../domain/repositories/task.repository.js';

export class PrismaTaskRepository implements ITaskRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: number): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  async findByIdWithColumn(id: number): Promise<Task | null> {
    return this.prisma.task.findUnique({
      where: { id },
      include: { column: true },
    });
  }

  async findByProject(projectId: number): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async create(data: Prisma.TaskCreateInput): Promise<Task> {
    return this.prisma.task.create({ data });
  }

  async update(id: number, data: Prisma.TaskUpdateInput): Promise<Task> {
    return this.prisma.task.update({ where: { id }, data });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.task.delete({ where: { id } });
  }

  async move(id: number, columnId: number, orderIndex: number): Promise<void> {
    await this.prisma.$transaction(async (tx: any) => {
      // Update task's column
      await tx.task.update({
        where: { id },
        data: {
          projectColumnId: columnId,
          order: orderIndex,
        },
      });

      // Reorder other tasks in the target column
      const tasksInColumn = await tx.task.findMany({
        where: {
          projectColumnId: columnId,
          id: { not: id },
        },
        orderBy: { order: 'asc' },
      });

      for (let i = 0; i < tasksInColumn.length; i++) {
        const t = tasksInColumn[i];
        const newOrder = i >= orderIndex ? i + 1 : i;
        if (t.order !== newOrder) {
          await tx.task.update({
            where: { id: t.id },
            data: { order: newOrder },
          });
        }
      }
    });
  }

  async count(where?: Prisma.TaskWhereInput): Promise<number> {
    return this.prisma.task.count({ where });
  }

  async findMany(params: {
    where?: Prisma.TaskWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.TaskOrderByWithRelationInput;
    include?: Prisma.TaskInclude;
  }): Promise<Task[]> {
    return this.prisma.task.findMany(params);
  }

  async transaction<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
