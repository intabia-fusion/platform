<script lang="ts">
  import type { AnySvelteComponent } from '@hcengineering/ui'
  import { Icon, Label } from '@hcengineering/ui'
  import type { Asset } from '@hcengineering/platform'
  import type { IntlString } from '@hcengineering/platform'
  import type { ComponentType } from 'svelte'

  export let icon: Asset | AnySvelteComponent | ComponentType
  export let label: IntlString
</script>

<div class="hulyComponent-content flex-col flex-gap-4">
  <div class="flex-row-center">
    <span class="mr-2">
      <Icon {icon} size={'medium'} />
    </span>
    <span class="title">
      <Label {label} />
    </span>
  </div>
  <div class="container">
    <slot />
  </div>
</div>

<style lang="scss">
  .title {
    margin: 0.25rem;
    font-weight: 500;
    font-size: 1rem;
  }
  .container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
