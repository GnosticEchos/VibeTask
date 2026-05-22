import type { ProjectUser, Prisma, PrismaClient } from '../../../prisma/generated/prisma/client.js';

export interface IMemberRepository {
  findById(id: number): Promise<ProjectUser | null>;
  findByProjectAndUser(projectId: number, userId: number): Promise<ProjectUser | null>;
  findMany(params: {
    where?: Prisma.ProjectUserWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.ProjectUserOrderByWithRelationInput;
    include?: Prisma.ProjectUserInclude;
  }): Promise<ProjectUser[]>;
  create(data: Prisma.ProjectUserCreateInput): Promise<ProjectUser>;
  update(id: number, data: Prisma.ProjectUserUpdateInput): Promise<ProjectUser>;
  delete(id: number): Promise<void>;
  count(where?: Prisma.ProjectUserWhereInput): Promise<number>;
  transaction<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T>;
}