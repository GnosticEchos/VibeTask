<script setup lang="ts">
// import { useMembersStore } from '@/stores/members'
// ... existing script setup ...
</script>

<template>
  <!-- ... existing template code ... -->
</template>

<style lang="scss" scoped>
.selected-members-wrapper {
  color: hsl(var(--p));
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  position: relative;
  border-bottom: 2px solid hsl(var(--b3));
  padding-bottom: 5px;
  max-height: 120px;
  overflow-y: auto;

  &--active {
    border-bottom: 2px solid hsl(var(--p));
  }

  .selected-member {
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 4px;
    background-color: hsl(var(--b2));
    padding: 2px 4px;
    margin-right: 5px;
    margin-bottom: 5px;
    font-size: 12px;
    font-weight: 500;
  }
}
</style>

