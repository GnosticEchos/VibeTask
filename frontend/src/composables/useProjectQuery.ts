import { useQuery } from '@tanstack/vue-query'
import projectsApi from '../api/v1/projectApi'
import { isValidId } from '../utils/validation'

const fetchProject = async (id: number) => {
  if (!isValidId(id)) {
    return null
  }
  const response = await projectsApi.getSingleProject(id)
  return response
}

export function useProjectQuery(id: number) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id),
    enabled: isValidId(id),
  })
} 