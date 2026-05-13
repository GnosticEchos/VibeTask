import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/locale'
import TaskActivityPanel from '@/components/layout/dialog/variants/task/TaskActivityPanel.vue'
import TaskCoreFields from '@/components/layout/dialog/variants/task/TaskCoreFields.vue'
import TaskLinkedDocumentsPanel from '@/components/layout/dialog/variants/task/TaskLinkedDocumentsPanel.vue'

const global = {
  plugins: [i18n],
}

describe('TaskDialog sections', () => {
  it('emits core field updates from editable inputs', async () => {
    const wrapper = mount(TaskCoreFields, {
      global,
      props: {
        name: 'Old task',
        description: 'Existing description',
        projectColumnId: 1,
        assigneeId: 'user:2',
        columnOptions: [{ id: 1, name: 'Todo' }, { id: 2, name: 'Done' }],
        assigneeOptions: [{ value: 'user:2', label: 'Ada Lovelace' }],
      },
    })

    await wrapper.get('input').setValue('Updated task')
    await wrapper.findAll('select')[0].setValue('2')

    expect(wrapper.emitted('update:name')?.[0]).toEqual(['Updated task'])
    expect(wrapper.emitted('update:projectColumnId')?.[0]).toEqual([2])
  })

  it('shows linked document count in collapsed header and emits unlink actions', async () => {
    const wrapper = mount(TaskLinkedDocumentsPanel, {
      global,
      props: {
        links: [{
          id: 10,
          projectId: 1,
          taskId: 2,
          documentId: 3,
          role: 'REFERENCE',
          pinnedVersion: null,
          createdAt: '2026-01-01T00:00:00Z',
          document: { id: 3, title: 'Spec', docType: 'SPECIFICATION', version: 4 },
        }],
        availableDocuments: [{ id: 4, projectId: 1, title: 'Plan', content: '', docType: 'IMPLEMENTATION_PLAN', version: 1, createdById: 1, createdAt: '', updatedAt: '' }],
        selectedDocumentId: '',
      },
    })

    expect(wrapper.text()).toContain('Linked documents')
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('Spec')
    await wrapper.find('button.text-error').trigger('click')

    expect(wrapper.emitted('unlinkDoc')?.[0]).toEqual([10])
  })

  it('shows activity comment count and emits add comment', async () => {
    const wrapper = mount(TaskActivityPanel, {
      global,
      props: {
        comments: [{
          id: 1,
          content: 'Looks good',
          taskId: 2,
          createdBy: { id: 1, fullName: 'Ada', avatarUrl: '' },
          user: { id: 1, fullName: 'Ada', avatarUrl: '' },
          createdAt: '2026-01-01T00:00:00Z',
          optimistic: true,
        }],
        history: [],
        commentText: 'New comment',
        getCommentAuthorDisplayName: () => 'Ada',
      },
    })

    expect(wrapper.text()).toContain('Activity')
    expect(wrapper.text()).toContain('Comments: 1')
    expect(wrapper.text()).toContain('Looks good')
    expect(wrapper.text()).toContain('(sending...)')
    await wrapper.find('button.btn-primary').trigger('click')

    expect(wrapper.emitted('addComment')).toHaveLength(1)
  })
})
