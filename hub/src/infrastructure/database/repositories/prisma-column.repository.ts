import type { PrismaClient, ProjectColumn, Prisma } from '../../../../prisma/generated/prisma/client.js';
import { IColumnRepository } from '../../../domain/repositories/column.repository.js';

export class PrismaColumnRepository implements IColumnRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: number): Promise<ProjectColumn | null> {
    return this.prisma.projectColumn.findUnique({ where: { id } });
  }

  async findByProject(projectId: number): Promise<ProjectColumn[]> {
    return this.prisma.projectColumn.findMany({ 
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async findMembership(projectId: number, userId: number): Promise<{ role: string } | null> {
    const membership = await this.prisma.projectUser.findFirst({
      where: { projectId, userId },
    });
    return membership ? { role: membership.role } : null;
  }

  async create(data: Prisma.ProjectColumnCreateInput): Promise<ProjectColumn> {
    return this.prisma.projectColumn.create({ data });
  }

  async update(id: number, data: Prisma.ProjectColumnUpdateInput): Promise<ProjectColumn> {
    return this.prisma.projectColumn.update({ where: { id }, data });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.projectColumn.delete({ where: { id } });
  }

  async count(where?: Prisma.ProjectColumnWhereInput): Promise<number> {
    return this.prisma.projectColumn.count({ where });
  }

  async findMany(params: {
    where?: Prisma.ProjectColumnWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.ProjectColumnOrderByWithRelationInput;
    include?: Prisma.ProjectColumnInclude;
  }): Promise<ProjectColumn[]> {
    return this.prisma.projectColumn.findMany(params);
  }

  async transaction<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
