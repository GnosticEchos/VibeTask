import { ProjectColumn, Prisma, PrismaClient } from '@prisma/client';

export interface IColumnRepository {
  findById(id: number): Promise<ProjectColumn | null>;
  findByProject(projectId: number): Promise<ProjectColumn[]>;
  findMembership(projectId: number, userId: number): Promise<{ role: string } | null>;
  create(data: Prisma.ProjectColumnCreateInput): Promise<ProjectColumn>;
  update(id: number, data: Prisma.ProjectColumnUpdateInput): Promise<ProjectColumn>;
  delete(id: number): Promise<void>;
  count(where?: Prisma.ProjectColumnWhereInput): Promise<number>;
  findMany(params: {
    where?: Prisma.ProjectColumnWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.ProjectColumnOrderByWithRelationInput;
    include?: Prisma.ProjectColumnInclude;
  }): Promise<ProjectColumn[]>;
  transaction<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T>;
}
