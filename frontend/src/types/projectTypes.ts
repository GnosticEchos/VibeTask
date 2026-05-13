import { iColumn } from './columnTypes'
import { iTask } from './taskTypes'
import { ISimplifiedUser } from './userTypes'
import { ProjectSettings } from './documentTypes'

export interface iProject {
  id: number
  name: string
  description: string
  role: string
  prefix: string
  members: ISimplifiedUser[]
  columns: iColumn[]
  tasks: iTask[]
  settings?: ProjectSettings
}

export type iSimplifiedProject = Pick<
  iProject,
  'id' | 'name' | 'description' | 'role' | 'prefix'
> & {
  isMember?: boolean
  taskMetadata?: {
    total: number
    blocked: number
  }
}

/** Payload for creating a new project */
export interface CreateProjectPayload {
  name: string
  description?: string
  prefix?: string
  template?: string
  columns?: Array<{ name: string; order?: number; color?: string; type?: string; description?: string }>
  settings?: ProjectSettings
}

export interface ProjectTemplateOption {
  id: string
  name: string
  description: string
  columns: Array<{ name: string; order: number; roleType?: string }>
  settings: Record<string, unknown>
}
