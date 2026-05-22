import type { PrismaClient, ProjectUser, Prisma } from '../../../../prisma/generated/prisma/client.js';
import { IMemberRepository } from '../../../domain/repositories/member.repository.js';

export class PrismaMemberRepository implements IMemberRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: number): Promise<ProjectUser | null> {
    return this.prisma.projectUser.findUnique({ where: { id } });
  }

  async findByProjectAndUser(projectId: number, userId: number): Promise<ProjectUser | null> {
    return this.prisma.projectUser.findFirst({
      where: { projectId, userId },
    });
  }

  async findMany(params: {
    where?: Prisma.ProjectUserWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.ProjectUserOrderByWithRelationInput;
    include?: Prisma.ProjectUserInclude;
  }): Promise<ProjectUser[]> {
    return this.prisma.projectUser.findMany(params);
  }

  async create(data: Prisma.ProjectUserCreateInput): Promise<ProjectUser> {
    return this.prisma.projectUser.create({ data });
  }

  async update(id: number, data: Prisma.ProjectUserUpdateInput): Promise<ProjectUser> {
    return this.prisma.projectUser.update({ where: { id }, data });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.projectUser.delete({ where: { id } });
  }

  async count(where?: Prisma.ProjectUserWhereInput): Promise<number> {
    return this.prisma.projectUser.count({ where });
  }

  async transaction<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}