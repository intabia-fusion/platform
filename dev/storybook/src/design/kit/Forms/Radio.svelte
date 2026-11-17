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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Radio } from '@hcengineering/ui/kit'
  import type { RadioKind, RadioSize } from '@hcengineering/ui/kit'

  export let on: boolean = false
  export let label: string
  // The product Radio has no second line, the hint is drawn under the label
  export let hint: string | undefined = undefined
  export let size: RadioSize | undefined = undefined
  export let kind: RadioKind | undefined = undefined
  export let disabled: boolean = false
</script>

<div class="kit-radio">
  <Radio value="a" group={on ? 'a' : null} {size} {kind} {disabled} label={getEmbeddedLabel(label)} />
  {#if hint !== undefined}<span class="hint" class:small={size === 'small'}>{hint}</span>{/if}
</div>

<style lang="scss">
  .kit-radio {
    display: inline-flex;
    flex-direction: column;
    gap: var(--spacing-0_25);
  }
  .hint {
    padding-left: calc(1rem + var(--spacing-1));
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);

    &.small {
      padding-left: calc(0.875rem + var(--spacing-0_75));
    }
  }
</style>
