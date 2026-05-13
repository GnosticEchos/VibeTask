import { iColumn, iUpdateColumn } from '../types/columnTypes'
import { defineStore } from 'pinia'
import { useProjectStore } from './project'
import { storeConstructor } from './storeConstructor'

/**
 * Column updates flow:
 * - Bulk (reorder/rename): useProjectMutations().updateColumns(projectId, columns) → api.updateItems('columns', { projectId, columns })
 * - Single create: columnsStore.createColumn(columnData) → store.createItem → api.createItem
 * - Single update: columnsStore.updateColumn(id, data) → store.updateItem → api.updateItem
 * - Single delete: columnsStore.deleteColumn(id) → store.deleteItem → api.deleteItem
 *
 * Task move (Board DnD): Currently we persist via (1) per-task PATCH for each moved task's projectColumnId
 * and (2) bulk updateColumns(projectId, columns) for column order. Backend clarification pending: whether
 * only bulk, only per-task, or both are required; then we can simplify to a single strategy.
 */
export const useColumnsStore = defineStore('columns', () => {
  const store = storeConstructor<iColumn, iColumn>('columns')
  const projectStore = useProjectStore()

  /**
   * Set the columns array reactively. Used by Board.vue after board data fetch.
   * @param {iColumn[]} newItems
   */
  function setItems(newItems: iColumn[]) {
    store.items.value = [...newItems]
  }

  /**
   * Create a new column
   * @param {iUpdateColumn} columnData
   */
  async function createColumn(columnData: iUpdateColumn) {
    const tempId = Date.now() // Temporary ID for UI purposes; used for rollback
    try {
      const newColumn = {
        ...columnData,
        id: tempId,
        tasks: []
      } as iColumn
      
      store.items.value.push(newColumn)
      
      // Update project store as well
      projectStore.project.columns = [...store.items.value]
      
      // Call API to create column
      await store.createItem(columnData)
      
      // Refresh columns to get the real ID from the backend
      await store.getItems()
      
      // Update project store with refreshed data
      projectStore.project.columns = [...store.items.value]
    } catch (error) {
      // Rollback on error
      store.items.value = store.items.value.filter(col => col.id !== tempId)
      projectStore.project.columns = [...store.items.value]
      throw error
    }
  }

  /**
   * Update an existing column
   * @param {number} columnId
   * @param {iUpdateColumn} columnData
   */
  async function updateColumn(columnId: number, columnData: iUpdateColumn) {
    let originalColumn: typeof store.items.value[0] | null = null
    try {
      const index = store.items.value.findIndex(col => col.id === columnId)
      if (index === -1) throw new Error('Column not found')
      originalColumn = { ...store.items.value[index] }
      const updated = { ...store.items.value[index], ...columnData }
      store.items.value[index] = { ...updated, id: updated.id ?? columnId } as typeof store.items.value[0]
      
      // Update project store as well
      const projectColumnIndex = projectStore.project.columns.findIndex(col => col.id === columnId)
      if (projectColumnIndex !== -1) {
        const updatedCol = { ...projectStore.project.columns[projectColumnIndex], ...columnData }
        projectStore.project.columns[projectColumnIndex] = { ...updatedCol, id: updatedCol.id ?? columnId } as typeof projectStore.project.columns[0]
      }
      
      // Call API to update column
      await store.updateItem(columnId, columnData)
    } catch (error) {
      if (originalColumn !== null) {
        const index = store.items.value.findIndex(col => col.id === columnId)
        if (index !== -1) store.items.value[index] = originalColumn
        const projectColumnIndex = projectStore.project.columns.findIndex(col => col.id === columnId)
        if (projectColumnIndex !== -1) projectStore.project.columns[projectColumnIndex] = originalColumn
      }
      throw error
    }
  }

  /**
   * Delete a column
   * @param {number} columnId
   */
  async function deleteColumn(columnId: number) {
    let deletedColumn: typeof store.items.value[0] | null = null
    let deletedIndex = -1
    let deletedProjectIndex = -1
    try {
      const index = store.items.value.findIndex(col => col.id === columnId)
      if (index === -1) throw new Error('Column not found')
      deletedIndex = index
      deletedColumn = { ...store.items.value[index] }
      store.items.value.splice(index, 1)

      const projectColumnIndex = projectStore.project.columns.findIndex(col => col.id === columnId)
      if (projectColumnIndex !== -1) {
        deletedProjectIndex = projectColumnIndex
        projectStore.project.columns.splice(projectColumnIndex, 1)
      }

      await store.deleteItem(columnId)
    } catch (error) {
      if (deletedColumn !== null && deletedIndex !== -1) {
        store.items.value.splice(deletedIndex, 0, deletedColumn)
      }
      if (deletedColumn !== null && deletedProjectIndex !== -1) {
        projectStore.project.columns.splice(deletedProjectIndex, 0, deletedColumn)
      }
      throw error
    }
  }

  /**
   * Reorder columns
   * @param {number[]} columnOrder - Array of column IDs in the new order
   */
  async function reorderColumns(columnOrder: number[]) {
    try {
      // Create a map of current columns by ID for easy lookup
      const columnMap = new Map<number, iColumn>()
      store.items.value.forEach(col => columnMap.set(col.id, col))
      
      // Reorder columns based on the new order
      const reorderedColumns = columnOrder.map(id => columnMap.get(id)).filter(Boolean) as iColumn[]
      
      // Update the order property of each column
      const updatedColumns = reorderedColumns.map((col, index) => ({
        ...col,
        order: index + 1
      }))
      
      // Optimistically update in store
      store.items.value = [...updatedColumns]
      
      // Update project store as well
      projectStore.project.columns = [...updatedColumns]
      
      // Prepare payload for API call
      const payload = updatedColumns.map(col => ({
        id: col.id,
        order: col.order
      }))
      
      // Call API to update column order
      await store.updateItems(payload)
    } catch (error) {
      // In a real implementation, we would rollback to the previous order
      // For now, we'll just rethrow the error
      throw error
    }
  }

  /**
   * Bulk update columns (create, update, delete)
   * @param {iUpdateColumn[]} columnsData
   */
  async function bulkUpdateColumns(columnsData: iUpdateColumn[]) {
    try {
      // Separate new, updated, and deleted columns
      const newColumns = columnsData.filter(col => col.isNew && !col.toDelete)
      const updatedColumns = columnsData.filter(col => col.id && !col.toDelete && !col.isNew)
      const deletedColumns = columnsData.filter(col => col.toDelete)
      
      // Handle new columns
      for (const col of newColumns) {
        await createColumn(col)
      }
      
      // Handle updated columns
      for (const col of updatedColumns) {
        if (col.id) {
          await updateColumn(col.id, col)
        }
      }
      
      // Handle deleted columns
      for (const col of deletedColumns) {
        if (col.id) {
          await deleteColumn(col.id)
        }
      }
      
      // Refresh columns to ensure consistency
      await store.getItems()
      projectStore.project.columns = [...store.items.value]
    } catch (error) {
      // Re-throw the error for the caller to handle
      throw error
    }
  }

  return {
    ...store,
    setItems,
    createColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    bulkUpdateColumns,
  }
})
