import { axiosApi } from '../axios'
import type { ProjectDocument, CreateDocumentPayload, UpdateDocumentPayload } from '../../types/documentTypes'

export const documentsApi = {
  async getDocuments(projectId: number, params?: { page?: number; limit?: number; type?: string }) {
    const res = await axiosApi.get(`/projects/${projectId}/docs`, { params })
    return res.data
  },

  async createDocument(projectId: number, payload: CreateDocumentPayload): Promise<ProjectDocument> {
    const res = await axiosApi.post(`/projects/${projectId}/docs`, payload)
    return res.data
  },

  async getDocument(projectId: number, docId: number): Promise<ProjectDocument> {
    const res = await axiosApi.get(`/projects/${projectId}/docs/${docId}`)
    return res.data
  },

  async updateDocument(projectId: number, docId: number, payload: UpdateDocumentPayload): Promise<ProjectDocument> {
    const res = await axiosApi.patch(`/projects/${projectId}/docs/${docId}`, payload)
    return res.data
  },

  async deleteDocument(projectId: number, docId: number): Promise<void> {
    await axiosApi.delete(`/projects/${projectId}/docs/${docId}`)
  },

  async getLinkedTasks(projectId: number, docId: number) {
    const res = await axiosApi.get(`/projects/${projectId}/docs/${docId}/linked-tasks`)
    return res.data
  },
}
