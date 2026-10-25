<script lang="ts">
  import type { IconSize } from '@hcengineering/ui'
  import ui, { Icon } from '@hcengineering/ui'

  export let size: IconSize = 'small'
  export let fill: string | undefined = undefined
</script>

<div class="flex-center template-icon">
  <Icon icon={ui.icon.FolderTab} {size} {fill} />
</div>

<style lang="scss">
  .template-icon {
    width: 100%;
    height: 100%;
  }
</style>
