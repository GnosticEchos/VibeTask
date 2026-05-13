import { iMemberItem } from '../../types/userTypes'
import { isValidId } from '../../utils/validation'
import { axiosApi } from '../axios'

type invitedMemberType = {
  id: number
  role: string
}

const checkMemberEmail = async (params: {
  email: string
  projectId: number
}): Promise<iMemberItem> => {
  if (!isValidId(params.projectId)) {
    return Promise.reject(new Error('Invalid project ID'))
  }

  const validatedParams = {
    ...params,
    projectId: Number(params.projectId)
  }

  const response = await axiosApi.get('/members/check_email', { params: validatedParams })
  return response.data
}

const inviteMembers = async (params: {
  users: invitedMemberType[]
  projectId: number
}): Promise<iMemberItem[]> => {
  if (!isValidId(params.projectId)) {
    return Promise.reject(new Error('Invalid project ID'))
  }

  const validatedParams = {
    ...params,
    projectId: Number(params.projectId)
  }

  const response = await axiosApi.post('/members/invite', validatedParams)
  return response.data
}

/**
 * Remove a member from a project. Backend requires projectId in query.
 */
const deleteMember = async (projectId: number, memberId: number): Promise<void> => {
  if (!isValidId(projectId) || !isValidId(memberId)) {
    return Promise.reject(new Error('Invalid project ID or member ID'))
  }
  await axiosApi.delete(`/members/${Number(memberId)}`, {
    params: { projectId: Number(projectId) },
  })
}

export default {
  checkMemberEmail,
  inviteMembers,
  deleteMember,
}
