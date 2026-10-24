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
  import type { IntlString } from '@hcengineering/platform'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import type { IconComponent } from '../../types'
  import type { SectionProps } from './types'

  type $$Props = SectionProps
  interface $$Slots {
    default: Record<string, never>
    actions: Record<string, never>
  }

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let level: 2 | 3 | 4 = 2
  export let id: string | undefined = undefined

  // A declaration default applies only at mount, a level later set to undefined stays undefined.
  $: resolvedLevel = level ?? 2

  const titleId = `section-${Math.random().toString(36).slice(2, 10)}`
</script>

<section class="section" {id} aria-labelledby={titleId}>
  <div class="section__header">
    {#if icon !== undefined}
      <span class="section__icon" aria-hidden="true"><Icon {icon} {iconProps} size="small" /></span>
    {/if}
    <svelte:element this={`h${resolvedLevel}`} id={titleId} class="section__title">
      <Label {label} params={labelParams} />
    </svelte:element>
    <div class="section__actions"><slot name="actions" /></div>
  </div>
  <div class="section__content"><slot /></div>
</section>

<style lang="scss">
  .section {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-width: 0;
    min-height: 0;

    &__header {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      min-height: var(--global-medium-Size);
      border-bottom: 1px solid var(--theme-divider-color);
    }
    &__icon {
      display: inline-flex;
      flex-shrink: 0;
      color: var(--global-primary-TextColor);
    }
    &__title {
      flex-grow: 1;
      margin: 0;
      min-width: 0;
      overflow: hidden;
      font-size: 1rem;
      font-weight: 400;
      line-height: 1.5rem;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--global-primary-TextColor);
    }
    &__actions {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: var(--spacing-0_5);

      &:empty {
        display: none;
      }
    }
    &__content {
      display: flex;
      flex-direction: column;
      margin-top: var(--spacing-0_5);
      min-width: 0;
      min-height: 0;
    }
  }
</style>
