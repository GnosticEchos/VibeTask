<script setup>
import { ref } from 'vue'
import { Field, DataType } from 'data-grid-vue'

const columns = [
  { field: new Field('id'), title: 'ID', dataType: DataType.number, isKey: true },
  { field: new Field('name'), title: 'Name', dataType: DataType.alphanumeric }
]
const rows = ref([
  { id: 1, name: 'Test 1' },
  { id: 2, name: 'Test 2' }
])
</script>

<template>
  <dgv-data-grid
    :columns="columns"
    :data="rows"
    rowKey="id"
    rowMode="true"
    rowSelectionMode="single"
    dragDropMode="row"
    @rowClick="row => console.log('Row clicked', row)"
    @rowDblClick="row => console.log('Row double clicked', row)"
    @rowKeydown="(e, row) => console.log('Row keydown', e, row)"
    class="bg-base-100 text-base-content rounded-box shadow-lg"
  />
</template> 