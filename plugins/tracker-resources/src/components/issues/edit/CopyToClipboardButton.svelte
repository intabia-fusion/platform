<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import type { IntlString } from '@hcengineering/platform'
  import { copyTextToClipboard } from '@hcengineering/presentation'
  import { IconCheck, type IconComponent } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { onDestroy } from 'svelte'

  export let icon: IconComponent
  export let title: IntlString
  export let text: string
  export let dataId: string | undefined = undefined

  let copied = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy (): Promise<void> {
    try {
      await copyTextToClipboard(text)
    } catch {
      // No check when the browser refuses clipboard access
      return
    }
    copied = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      copied = false
    }, 1500)
  }

  onDestroy(() => {
    clearTimeout(timer)
  })
</script>

<!-- A quiet confirmation: the icon turns into a check for a moment, the tooltip says it is copied -->
<span class="copy-button" class:copied>
  <IconButton
    size="small"
    icon={copied ? IconCheck : icon}
    iconSize="medium"
    kind="ghost"
    tooltip={{ label: copied ? view.string.Copied : title, direction: 'bottom' }}
    data-id={dataId}
    on:click={copy}
  />
</span>

<style lang="scss">
  .copy-button {
    display: contents;
  }
  .copied :global(.button__icon) {
    animation: copied-pop 0.2s ease-out;
  }
  @keyframes copied-pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .copied :global(.button__icon) {
      animation: none;
    }
  }
</style>
