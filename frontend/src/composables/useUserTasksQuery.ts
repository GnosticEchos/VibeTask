import { useQuery } from '@tanstack/vue-query'
import { axiosApi } from '@/api/axios'
import { REWRITE_MAX_LIST_PAGE_SIZE, unwrapListItems } from '@/utils/paginatedListResponse'

export interface UserTaskItem {
  id: number
  name: string
  projectId?: number
  [key: string]: unknown
}

async function fetchUserTasks(): Promise<UserTaskItem[]> {
  const response = await axiosApi.get('/tasks', {
    params: { limit: REWRITE_MAX_LIST_PAGE_SIZE },
  })
  const { items } = unwrapListItems(response.data)
  return items as UserTaskItem[]
}

export function useUserTasksQuery() {
  return useQuery({
    queryKey: ['userTasks'],
    queryFn: fetchUserTasks,
  })
}
