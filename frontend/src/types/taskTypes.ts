import { formatDate } from '../utils/functions'

import { ISimplifiedUser } from './userTypes'
import { DocLinkRole } from './documentTypes'

export interface iComment {
  id: number
  content: string
  taskId: number
  createdBy: ISimplifiedUser
  createdAt: string
  user: ISimplifiedUser
  /**
   * Frontend-only: Temporary ID for optimistic UI updates (not persisted to backend)
   */
  tempId?: string
  /**
   * Frontend-only: Marks comment as optimistic (pending server confirmation)
   */
  optimistic?: boolean
}

export interface iTaskLog {
  id: number
  taskId: number
  text: string
  createdAt: string
  user: ISimplifiedUser
}

function byCreatedAtAscending<T extends { createdAt: string }>(items: T[] | undefined): T[] {
  return (items ?? []).reduce<T[]>((ordered, item) => {
    const itemTime = new Date(item.createdAt).getTime()
    const insertAt = ordered.findIndex((existing) => new Date(existing.createdAt).getTime() > itemTime)
    if (insertAt === -1) return [...ordered, item]
    return [...ordered.slice(0, insertAt), item, ...ordered.slice(insertAt)]
  }, [])
}

export interface iTask {
  id: number
  name: string
  description: string | null
  order: number
  createdBy: ISimplifiedUser | null
  assignee: ISimplifiedUser | null
  assigneeApiKeyId?: string | null
  assigneeApiKey?: { id: string; name?: string | null } | null
  projectColumnId: number | null
  identifier: string
  // Search API returns these
  projectId?: number
  project?: { id: number; name: string; prefix: string }
  status?: string
  priority?: string
  tags?: string
  dueDate?: string
  updating?: boolean
  relatedTask: (iSimplifiedTask & { relationMode: string }) | null
  /** API: related task id (backend returns this with relationMode) */
  relationId?: number | null
  /** API: relation type enum e.g. "blocks", "relates-to", "blocked-by" */
  relationMode?: string | null
  comments: iComment[]
  history: iTaskLog[]
  createdAt: string
  updatedAt?: string
  // Recursive boards
  isContainer?: boolean
  planAccepted?: boolean
  subBoardOutlineColor?: string | null
  parentId?: number | null
  childCount?: number
  children?: iSimplifiedTask[]
  // Document links
  docLinks?: Array<{
    id: number
    role: DocLinkRole | null
    pinnedVersion: number | null
    document: { id: number; title: string; docType: string; version: number }
  }>
}

export class Task implements iTask {
  id: number
  name: string
  description: string | null
  order: number
  createdBy: ISimplifiedUser | null
  assignee: ISimplifiedUser | null
  assigneeApiKeyId?: string | null
  assigneeApiKey?: { id: string; name?: string | null } | null
  projectColumnId: number | null
  identifier: string
  updating?: boolean
  relatedTask: (iSimplifiedTask & { relationMode: string }) | null
  relationId?: number | null
  relationMode?: string | null
  comments: iComment[]
  history: iTaskLog[]
  createdAt: string
  updatedAt?: string
  isContainer?: boolean
  planAccepted?: boolean
  subBoardOutlineColor?: string | null
  parentId?: number | null
  childCount?: number
  children?: iSimplifiedTask[]
  docLinks?: Array<{
    id: number
    role: DocLinkRole | null
    pinnedVersion: number | null
    document: { id: number; title: string; docType: string; version: number }
  }>

  constructor(data: iTask & { relationId?: number | null; relationMode?: string | null }) {
    this.id = data.id
    this.name = data.name
    this.description = data.description
    this.order = data.order
    this.createdBy = data.createdBy ?? null
    const assigneeName =
      data.assignee?.fullName ||
      (data.assignee?.name && data.assignee?.surname ? `${data.assignee.name} ${data.assignee.surname}` : undefined) ||
      data.assignee?.name ||
      ''
    this.assignee = data.assignee
      ? {
          id: data.assignee.id,
          fullName: assigneeName,
          name: data.assignee.name,
          surname: data.assignee.surname,
          avatarUrl: data.assignee.avatarUrl ?? '',
        }
      : null
    this.assigneeApiKeyId = data.assigneeApiKeyId ?? null
    this.assigneeApiKey = data.assigneeApiKey ?? null
    this.projectColumnId = data.projectColumnId
    this.identifier = data.identifier
    this.updating = data.updating
    this.relatedTask = data.relatedTask
    this.relationId = data.relationId != null ? Number(data.relationId) : null
    this.relationMode = data.relationMode ?? null
    // Normalize comment.user so we always have a displayable fullName (backend may send user with fullName undefined and author in createdBy)
    this.comments = byCreatedAtAscending(data.comments).map((comment) => {
      const user = comment.user || {};
      const createdBy = (comment as any).createdBy || {};
      const name = (user as any).name || (createdBy as any).name || '';
      const surname = (user as any).surname || (createdBy as any).surname || '';
      const fullName =
        (user as any).fullName ||
        (createdBy as any).fullName ||
        (name && surname ? `${name} ${surname}` : undefined);
      return {
        ...comment,
        user: {
          ...createdBy,
          ...user,
          fullName,
        },
      };
    });
    this.history = byCreatedAtAscending(data.history)
      .map((log) => ({
        ...log,
        createdAt: formatDate(log.createdAt),
      }))
    this.createdAt = formatDate(data.createdAt)
    this.updatedAt = data.updatedAt ? formatDate(data.updatedAt) : undefined
    this.docLinks = data.docLinks ?? []
    this.children = data.children ?? []
    this.isContainer = data.isContainer ?? false
    this.planAccepted = data.planAccepted ?? false
    this.subBoardOutlineColor = data.subBoardOutlineColor ?? null
    this.parentId = data.parentId ?? null
    this.childCount = data.childCount ?? this.children.length
  }
}

export interface iSimplifiedTask
  extends Pick<
    iTask,
    | 'id'
    | 'name'
    | 'identifier'
    | 'description'
    | 'assignee'
    | 'projectColumnId'
    | 'order'
  > {
  projectId: number;
}

export interface iMoveTaskPayload {
  targetColumnId: number
  targetIndex: number
}
