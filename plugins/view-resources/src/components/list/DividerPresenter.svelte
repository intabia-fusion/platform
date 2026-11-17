<script lang="ts">
  export let compact = false
</script>

<span class="root" class:compact />

<style lang="scss">
  .root {
    flex-shrink: 0;
    margin: 0 0.375rem 0 0.875rem;
    width: 1px;
    height: 1.5rem;
    min-width: 1px;
    background-color: var(--theme-list-divider-color);
  }
  .root.compact {
    margin: 0 0.125rem 0 0.25rem;
  }
</style>
