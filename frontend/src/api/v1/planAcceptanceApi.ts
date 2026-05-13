import { axiosApi } from '../axios'

export const planAcceptanceApi = {
  async acceptPlan(projectId: number, taskId: number) {
    const res = await axiosApi.post(`/projects/${projectId}/accept-plan/${taskId}`)
    return res.data
  },
}
