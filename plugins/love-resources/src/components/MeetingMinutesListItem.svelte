<!--
// Copyright © 2026 Intabia Fusion.
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
  import { WithLookup } from '@hcengineering/core'
  import { MeetingMinutes } from '@hcengineering/love'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Icon, TimeSince, tooltip } from '@hcengineering/ui'
  import { DocNavLink } from '@hcengineering/view-resources'
  import love from '../plugin'
  import MeetingMinutesStatusPresenter from './MeetingMinutesStatusPresenter.svelte'

  export let value: WithLookup<MeetingMinutes>
  export let disabled: boolean = false
  export let selected: boolean = false
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="listGrid antiList__row row flex-gap-2 flex-grow"
  class:mListGridSelected={selected}
  on:contextmenu
  on:focus
  on:mouseenter
  on:mouseover
>
  <div class="flex-row-center flex-gap-2 min-w-0 flex-grow">
    <div class="icon flex-no-shrink">
      <Icon icon={love.icon.MeetingMinutes} size={'small'} />
    </div>
    <DocNavLink object={value} {disabled} accent noUnderline>
      <span class="overflow-label" use:tooltip={{ label: getEmbeddedLabel(value.name) }}>
        {value.name}
      </span>
    </DocNavLink>
  </div>
  <div class="flex-row-center flex-gap-3 flex-no-shrink">
    <MeetingMinutesStatusPresenter object={value} value={value.status} attributeKey={'status'} />
    {#if value.createdOn}
      <span class="text-sm content-dark-color">
        <TimeSince value={value.createdOn} />
      </span>
    {/if}
    {#if (value.members?.length ?? 0) > 0}
      <span class="text-sm content-dark-color flex-no-shrink">
        {value.members?.length ?? 0}
      </span>
    {/if}
  </div>
</div>
