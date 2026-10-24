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
  import { Severity, type Status } from '@hcengineering/platform'
  import { onDestroy } from 'svelte'

  import StatusLabel from '../../components/StatusLabel.svelte'
  import StatusIcon from '../status-icon/StatusIcon.svelte'
  import type { StatusIconTone } from '../status-icon/types'
  import type { StatusMessageProps } from './types'

  type $$Props = StatusMessageProps

  export let status: Status
  export let wrap: boolean = false

  const tones: Record<Severity, StatusIconTone | undefined> = {
    [Severity.OK]: undefined,
    [Severity.INFO]: 'info',
    [Severity.WARNING]: 'warning',
    [Severity.ERROR]: 'error'
  }

  $: tone = tones[status.severity]

  // A polite live region inserted together with its text is often not read: the text follows the region.
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  $: if (tone === undefined) {
    clearTimeout(timer)
    settled = false
  } else if (!settled) {
    clearTimeout(timer)
    timer = setTimeout(() => {
      settled = true
    }, 0)
  }

  onDestroy(() => {
    clearTimeout(timer)
  })
</script>

{#if tone !== undefined}
  <div
    class="status-message status-message--{tone}"
    class:status-message--wrap={wrap}
    role={tone === 'error' ? 'alert' : 'status'}
  >
    {#if settled || tone === 'error'}
      <!-- Info is only news: a ring keeps it quieter than a warning or an error, as in the toast. -->
      <StatusIcon {tone} kind={tone === 'info' ? 'outline' : 'solid'} />
      <span class="status-message__text"><StatusLabel {status} /></span>
    {/if}
  </div>
{/if}

<style lang="scss">
  .status-message {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--_text);
    user-select: none;

    &__text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    &--wrap {
      align-items: flex-start;
    }
    &--wrap &__text {
      white-space: normal;
      overflow-wrap: anywhere;
    }

    &--error {
      --_text: var(--global-error-TextColor);
    }
    &--warning {
      --_text: var(--theme-warning-color);
    }
    &--info {
      --_text: var(--global-primary-TextColor);
    }
  }
</style>
