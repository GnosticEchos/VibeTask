import { axiosApi } from '../axios'
import type { TaskDocumentLink, CreateDocLinkPayload, UpdateDocLinkPayload } from '../../types/documentTypes'

export const taskDocLinksApi = {
  async getLinks(projectId: number, taskId: number): Promise<{ data: TaskDocumentLink[] }> {
    const res = await axiosApi.get(`/projects/${projectId}/tasks/${taskId}/doc-links`)
    return res.data
  },

  async createLink(projectId: number, taskId: number, payload: CreateDocLinkPayload): Promise<TaskDocumentLink> {
    const res = await axiosApi.post(`/projects/${projectId}/tasks/${taskId}/doc-links`, payload)
    return res.data
  },

  async updateLink(projectId: number, taskId: number, linkId: number, payload: UpdateDocLinkPayload): Promise<TaskDocumentLink> {
    const res = await axiosApi.patch(`/projects/${projectId}/tasks/${taskId}/doc-links/${linkId}`, payload)
    return res.data
  },

  async deleteLink(projectId: number, taskId: number, linkId: number): Promise<void> {
    await axiosApi.delete(`/projects/${projectId}/tasks/${taskId}/doc-links/${linkId}`)
  },
}
