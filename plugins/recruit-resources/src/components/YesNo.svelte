<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
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
  import type { ButtonKind, ButtonSize, TooltipAlignment } from '@hcengineering/ui'
  import ui, { Button, Icon, Label } from '@hcengineering/ui'

  export let label: IntlString
  export let tooltip: IntlString
  export let value: boolean | undefined
  export let disabled: boolean = false
  export let labelDirection: TooltipAlignment | undefined = undefined

  export let kind: ButtonKind = 'no-border'
  export let size: ButtonSize = 'small'
  export let justify: 'left' | 'center' = 'center'
  export let width: string | undefined = 'fit-content'

  export let focusIndex = -1
</script>

<Button
  {focusIndex}
  {kind}
  {size}
  {justify}
  {width}
  {disabled}
  notSelected={value === undefined}
  showTooltip={{ label: tooltip, direction: labelDirection }}
  on:click={() => {
    if (value === true) value = false
    else if (value === false) value = undefined
    else value = true
  }}
>
  <svelte:fragment slot="content">
    <div class="flex-row-center flex-no-wrap pointer-events-none">
      <span class="label overflow-label">
        <Label {label} />
      </span>
      <div class="btn-icon ml-1">
        <Icon
          icon={value === true
            ? ui.icon.CheckCircleSmallFill
            : value === false
              ? ui.icon.CrossCircleSmallFill
              : ui.icon.QuestionCircleSmallFill}
          size="small"
          fill={value === true
            ? 'var(--bg-positive-default)'
            : value === false
              ? 'var(--bg-negative-default)'
              : 'var(--grayscale-grey-03)'}
        />
      </div>
    </div>
  </svelte:fragment>
</Button>

<style lang="scss">
  .btn-icon {
    color: var(--theme-content-color);
    transition: color 0.15s;
    pointer-events: none;
    &:hover {
      color: var(--theme-caption-color);
    }
    &:disabled:hover {
      color: var(--theme-content-color);
    }
  }
</style>
