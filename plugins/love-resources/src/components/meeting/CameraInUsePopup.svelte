<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { type IntlString } from '@hcengineering/platform'
  import { Label, Modal } from '@hcengineering/ui'
  import media from '@hcengineering/media'
  import love from '../../plugin'

  export let message: IntlString
  export let onRetry: () => void

  const dispatch = createEventDispatcher()

  function handleCancel (): void {
    dispatch('close')
  }

  function handleRetry (): void {
    onRetry()
    dispatch('close')
  }
</script>

<Modal
  label={love.string.Camera}
  type="type-popup"
  padding="0"
  okLabel={media.string.CameraInUseRetry}
  okAction={handleRetry}
  canSave
  onCancel={handleCancel}
  on:close
>
  <div class="camera-popup-content">
    <Label label={message} />
  </div>
</Modal>

<style lang="scss">
  .camera-popup-content {
    padding: 1.25rem;
    max-width: 32rem;
    overflow-wrap: break-word;
  }
</style>
