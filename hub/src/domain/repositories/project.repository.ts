import type { Project, Prisma, PrismaClient } from '../../../prisma/generated/prisma/client.js';

export interface IProjectRepository {
  findById(id: number): Promise<Project | null>;
  findByIdWithColumns(id: number): Promise<Project | null>;
  findByIdWithBoard(id: number): Promise<Project | null>;
  findMany(params: {
    where?: Prisma.ProjectWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.ProjectOrderByWithRelationInput;
    include?: Prisma.ProjectInclude;
  }): Promise<Project[]>;
  create(data: Prisma.ProjectCreateInput): Promise<Project>;
  update(id: number, data: Prisma.ProjectUpdateInput): Promise<Project>;
  delete(id: number): Promise<void>;
  count(where?: Prisma.ProjectWhereInput): Promise<number>;
  transaction<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T>;
}