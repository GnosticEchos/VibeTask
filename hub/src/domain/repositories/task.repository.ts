import { Task, Prisma, PrismaClient } from '@prisma/client';

export interface ITaskRepository {
  findById(id: number): Promise<Task | null>;
  findByIdWithColumn(id: number): Promise<Task | null>;
  findByProject(projectId: number): Promise<Task[]>;
  create(data: Prisma.TaskCreateInput): Promise<Task>;
  update(id: number, data: Prisma.TaskUpdateInput): Promise<Task>;
  delete(id: number): Promise<void>;
  move(id: number, columnId: number, orderIndex: number): Promise<void>;
  count(where?: Prisma.TaskWhereInput): Promise<number>;
  findMany(params: {
    where?: Prisma.TaskWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.TaskOrderByWithRelationInput;
    include?: Prisma.TaskInclude;
  }): Promise<Task[]>;
  transaction<T>(fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T>;
}