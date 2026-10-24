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
  import { List, type ListProps } from '@hcengineering/ui/kit'

  interface Person {
    name: string
    email: string
  }

  // Storybook adds event_* args for the actions panel: they are not component props.
  export let props: Partial<ListProps<Person>> = {}
  $: own = Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith('event_')))
  export let count: number = 5
  export let width: string = '18rem'
  export let surface: 'popup' | 'panel' = 'popup'
  export let selection: number = 0

  const people: Person[] = [
    { name: 'Anna Petrova', email: 'anna@example.com' },
    { name: 'Boris Ivanov', email: 'boris@example.com' },
    { name: 'Clara Smith', email: 'clara@example.com' },
    { name: 'Daniel Kim', email: 'daniel@example.com' },
    { name: 'Eva Novak', email: 'eva@example.com' },
    { name: 'Felix Braun', email: 'felix@example.com' }
  ]

  let activated = ''

  $: items = people.slice(0, count)
</script>

<!-- The list takes the keys itself once focused: arrows, Home / End, PageUp / PageDown, Enter. -->
<div class="list-example list-example--{surface}" style:width>
  <List
    bind:selection
    count={items.length}
    {items}
    aria-label="People"
    {...own}
    {...$$restProps}
    on:activate={(e) => (activated = items[e.detail]?.name ?? '')}
  >
    <div slot="item" class="list-example__row" let:value>
      <span class="list-example__avatar">{value?.name.charAt(0)}</span>
      <span class="list-example__name">{value?.name}</span>
      <span class="list-example__email">{value?.email}</span>
    </div>
  </List>
  {#if activated !== ''}<div class="list-example__picked">Picked: {activated}</div>{/if}
</div>

<style lang="scss">
  .list-example {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-0_5) 0;
    max-height: 16rem;
    border-radius: var(--small-BorderRadius);

    &--popup {
      background-color: var(--theme-popup-color);
      border: 1px solid var(--theme-popup-divider);
      box-shadow: var(--global-popover-ShadowX) var(--global-popover-ShadowY) var(--global-popover-ShadowBlur)
        var(--global-popover-ShadowSpread) var(--global-popover-ShadowColor);
    }
    &--panel {
      background-color: var(--theme-navpanel-color);
    }
    &__row {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      padding: var(--spacing-1);
      min-width: 0;
      font-size: 0.875rem;
      line-height: 1.25rem;
      cursor: pointer;
    }
    &__avatar {
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      width: 1.5rem;
      height: 1.5rem;
      font-size: 0.75rem;
      color: var(--global-primary-TextColor);
      background-color: var(--kit-button-secondary-BackgroundColor);
      border-radius: 50%;
    }
    &__name {
      color: var(--global-primary-TextColor);
    }
    &__email {
      overflow: hidden;
      font-size: 0.75rem;
      line-height: 1rem;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--global-secondary-TextColor);
    }
    &__picked {
      padding: var(--spacing-1) var(--spacing-1_5) var(--spacing-0_5);
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
    }
  }
</style>
