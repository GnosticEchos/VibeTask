<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import type { iProject } from '@/types/projectTypes';
import type { iColumn } from '@/types/columnTypes';

const props = defineProps({
  project: {
    type: Object as PropType<iProject>,
    required: true,
  },
});

const taskStatusSummary = computed<{ name: string; count: number; color: string }[]>(() => {
  if (!props.project.columns) return [];
  return props.project.columns.map((column: iColumn) => ({
    name: column.name,
    count: Array.isArray((column as any).tasks) ? (column as any).tasks.length : 0,
    color: column.color || '#3b82f6' // Default color if not provided
  }));
});

const totalTasks = computed<number>(() => {
  return taskStatusSummary.value.reduce((acc: number, status) => acc + status.count, 0);
});

// const taskRelationSummary = computed<Record<string, number>>(() => {
//   if (!props.project.columns) return {};
//   const relations: Record<string, number> = {};
//   props.project.columns.forEach((column: iColumn) => {
//     const tasks = Array.isArray((column as any).tasks) ? (column as any).tasks : [];
//     tasks.forEach((task: iTask) => {
//       const mode = task.relatedTask?.relationMode;
//       if (mode) {
//         relations[mode] = (relations[mode] || 0) + 1;
//       }
//     });
//   });
//   return relations;
// });

const ensureHex = (color: string) => {
  if (!color) return '#000000';
  if (typeof color === 'string' && color[0] !== '#') return `#${color}`;
  return color;
};

// Calculate total task count for the project
const totalTaskCount = computed<number>(() => {
  let count = 0;
  if (props.project.columns) {
    props.project.columns.forEach((column: iColumn) => {
      const tasks = Array.isArray((column as any).tasks) ? (column as any).tasks : [];
      count += tasks.length;
    });
  }
  return count;
});
</script>

<template>
  <div class="card bg-base-100 shadow-md border border-base-300 hover:shadow-lg transform hover:translate-x-2 hover:translate-y-2 transition-all duration-300 hover:scale-105 rounded-box w-[300px] h-[365px]" style="

--depth: 1; --noise: 1;">
    <div class="card-body p-4">
      <!-- Card header with project name -->
      <div class="text-center mb-2">
        <h2 class="card-title text-base-content font-semibold">{{ project.name }}</h2>
      </div>
      
      <!-- Project description -->
      <p class="text-base-content/80 text-sm mb-4 h-16 overflow-y-auto">{{ project.description }}</p>
      
      <!-- Progress bar for task distribution -->
      <div v-if="totalTasks > 0" class="mb-3">
        <div class="flex justify-between text-xs mb-1">
          <span class="font-medium">Tasks</span>
          <span>{{ totalTaskCount }}</span>
        </div>
        <div class="w-full h-2 bg-base-200 rounded-full overflow-hidden">
          <div 
            v-for="status in taskStatusSummary" 
            :key="status.name"
            class="h-full float-left" 
            :style="{
              width: `${(status.count / totalTasks) * 100}%`,
              backgroundColor: ensureHex(status.color)
            }"
            :title="`${status.name}: ${status.count} tasks`"
          ></div>
        </div>
      </div>
      
      <!-- Column badges -->
      <div class="flex flex-wrap gap-1 mt-2 justify-center">
        <div 
          v-for="(column, index) in project.columns?.slice(0, 3)" 
          :key="column.id" 
          class="badge badge-xs"
          :class="index % 3 === 0 ? 'badge-primary' : index % 3 === 1 ? 'badge-secondary' : 'badge-accent'"
        >
          {{ column.name }}
        </div>
        <div 
          v-if="project.columns && project.columns.length > 3" 
          class="badge badge-xs badge-ghost"
        >
          +{{ project.columns.length - 3 }}
        </div>
      </div>
      
      <!-- Card footer with task count -->
      <div class="card-footer mt-auto pt-2 text-center">
        <div class="badge badge-outline badge-primary">{{ totalTaskCount }} tasks</div>
      </div>
    </div>
  </div>
</template> 