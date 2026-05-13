export type DocType = 'CONSTITUTION' | 'SPECIFICATION' | 'BRAINSTORM' | 'POST_MORTEM' | 'IMPLEMENTATION_PLAN' | 'OTHER'

export type DocLinkRole = 'SPECIFICATION' | 'IMPLEMENTATION_PLAN' | 'REFERENCE' | 'ATTACHMENT'

export interface ProjectDocument {
  id: number
  projectId: number
  title: string
  content: string
  docType: DocType
  version: number
  createdById: number
  createdBy?: {
    id: number
    name: string | null
    surname: string | null
  }
  createdAt: string
  updatedAt: string
}

export interface TaskDocumentLink {
  id: number
  projectId: number
  taskId: number
  documentId: number
  role: DocLinkRole | null
  pinnedVersion: number | null
  createdAt: string
  createdBy?: number | null
  document?: {
    id: number
    title: string
    docType: DocType
    version: number
  }
}

export interface CreateDocumentPayload {
  title: string
  content?: string
  docType?: DocType
}

export interface UpdateDocumentPayload {
  title?: string
  content?: string
  docType?: DocType
}

export interface CreateDocLinkPayload {
  documentId: number
  role?: DocLinkRole
  pinnedVersion?: number
}

export interface UpdateDocLinkPayload {
  role?: DocLinkRole | null
  pinnedVersion?: number | null
}

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  columns: Array<{
    name: string
    order: number
    color?: string
    type?: string | null
    description?: string | null
    roleType?: string
  }>
  settings: Record<string, unknown>
}

export interface ColumnProtectionPolicy {
  enter?: 'Editor' | 'Maintainer' | 'Owner'
  inside?: {
    allowAgentEdits?: boolean
    allowComments?: boolean
  }
  exit?: 'Maintainer' | 'Owner'
}

export interface ProjectSettings {
  columnProtection?: Record<string, ColumnProtectionPolicy>
  monitors?: Record<string, { enabled: boolean; checkFields?: string[] }>
  enableEpicExpansion?: boolean
  subBoardOutlineColor?: string
}

export interface ActiveWorkspace {
  id: number
  name: string
  identifier: string
  subBoardOutlineColor: string | null
  parentId: number | null
}

export interface MonitorPass {
  id: number
  taskId: number
  columnId: number
  passed: boolean
  passedAt: string | null
}
