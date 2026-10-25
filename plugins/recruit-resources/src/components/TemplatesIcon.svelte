<script lang="ts">
  import ui, { Icon } from '@hcengineering/ui'
  import type { IconSize } from '@hcengineering/ui'

  export let size: IconSize = 'small'
</script>

<div class="flex-center template-icon">
  <Icon icon={ui.icon.Briefcase} {size} />
</div>

<style lang="scss">
  .template-icon {
    width: 100%;
    height: 100%;
  }
</style>
