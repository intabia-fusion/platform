<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->

<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { IntlString } from '@hcengineering/platform'
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
