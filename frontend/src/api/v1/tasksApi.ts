import { isValidId } from '../../utils/validation'
import { axiosApi } from '../axios'

/**
 * Add a comment to a task. Uses legacy PATCH /tasks/comment/:taskId (backend also supports POST /tasks/:id/comments).
 */
export async function addTaskComment(taskId: number, content: string): Promise<unknown> {
  if (!isValidId(taskId)) return Promise.reject(new Error('Invalid task ID'))
  if (!content || typeof content !== 'string' || !content.trim()) {
    return Promise.reject(new Error('Comment content is required'))
  }
  const response = await axiosApi.patch(`/tasks/comment/${Number(taskId)}`, { content })
  return response.data
}
