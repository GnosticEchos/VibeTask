import membersApi from '../api/v1/membersApi'
import { iMemberItem } from '../types/userTypes'
import { falseLoadingState } from '../utils/functions'
import { validateProjectId } from '../utils/validation'
import { defineStore } from 'pinia'

import { storeConstructor } from './storeConstructor'

export const useMembersStore = defineStore('members', () => {
  const store = storeConstructor<iMemberItem, iMemberItem>('members')
  const { loadingItem } = store

  /**
   * Set the members array reactively. Used by Board.vue after board data fetch.
   * @param {iMemberItem[]} newItems
   */
  function setItems(newItems: iMemberItem[]) {
    store.items.value = [...newItems]
  }

  const checkMemberEmail = async (params: {
    email: string
    projectId: number
  }): Promise<iMemberItem> => {
    try {
      // Validate project ID
      const validProjectId = validateProjectId(params.projectId);
      
      loadingItem.value = true;
      const validatedParams = {
        ...params,
        projectId: validProjectId
      };

      const response = await membersApi
        .checkMemberEmail(validatedParams)
        .finally(async () => {
          loadingItem.value = await falseLoadingState();
        });
      return response;
    } catch (err) {
      const error = err as Error;
      return Promise.reject(error);
    }
  }

  type invitedMemberType = {
    id: number
    role: string
  }

  const inviteMembers = async (params: {
    users: invitedMemberType[]
    projectId: number
  }): Promise<iMemberItem[]> => {
    try {
      // Validate project ID
      const validProjectId = validateProjectId(params.projectId);
      
      loadingItem.value = true;
      const validatedParams = {
        ...params,
        projectId: validProjectId
      };

      const response = await membersApi
        .inviteMembers(validatedParams)
        .finally(async () => {
          loadingItem.value = await falseLoadingState();
        });
      return response;
    } catch (err) {
      const error = err as Error;
      return Promise.reject(error);
    }
  }

  /**
   * Remove a member from a project. Sends projectId in query as required by the API.
   */
  const deleteMember = async (projectId: number, memberId: number): Promise<void> => {
    loadingItem.value = true
    try {
      await membersApi.deleteMember(projectId, memberId)
      const index = store.items.value.findIndex((i) => i.id === memberId)
      if (index !== -1) store.items.value.splice(index, 1)
      if (store.item.value?.id === memberId) store.item.value = {} as iMemberItem
    } finally {
      loadingItem.value = await falseLoadingState()
    }
  }

  return {
    ...store,
    checkMemberEmail,
    inviteMembers,
    deleteMember,
    setItems,
  }
})
