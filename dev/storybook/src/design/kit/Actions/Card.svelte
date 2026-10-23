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
  // Dialog card of popups (presentation Card): header with close, content, attribute pool and footer
  import { Button, IconClose, Scroller } from '@hcengineering/ui'
  import Forward from '../../../../../../packages/presentation/src/components/icons/Forward.svelte'

  export let title: string = ''
  export let width: 'large' | 'medium' | 'small' | 'x-small' = 'large'
  export let headerNoPadding: boolean = false
  export let hideClose: boolean = false
</script>

<div class="antiCard-wrap">
  <form class="antiCard dialog {width}">
    <div class="antiCard-header" class:noPadding={headerNoPadding}>
      <div class="antiCard-header__title-wrap">
        <slot name="header" />
        <div class="antiCard-header__title-group">
          {#if $$slots.header}
            <span class="antiCard-header__divider"><Forward size="small" /></span>
          {/if}
          <div class="antiCard-header__title">
            <slot name="title">{title}</slot>
          </div>
        </div>
      </div>
      {#if $$slots['header-actions']}
        <div class="ml-auto mr-2 buttons-group small-gap"><slot name="header-actions" /></div>
      {/if}
      {#if !hideClose}
        <div class="ml-2 buttons-group small-gap content-dark-color">
          <Button
            icon={IconClose}
            iconProps={{ size: 'medium', fill: 'var(--theme-dark-color)' }}
            kind="ghost"
            size="small"
          />
        </div>
      {/if}
    </div>
    <div class="antiCard-content">
      <Scroller padding={$$slots.pool ? '.5rem 1.5rem' : '.5rem 1.5rem 1.5rem'}>
        <slot />
      </Scroller>
    </div>
    {#if $$slots.pool}
      <div class="antiCard-pool"><slot name="pool" /></div>
    {/if}
    <div class="antiCard-footer divide reverse">
      <div class="buttons-group text-sm flex-no-shrink"><slot name="buttons" /></div>
      <div class="buttons-group small-gap text-sm"><slot name="footer" /></div>
    </div>
  </form>
</div>

<style lang="scss">
  .antiCard-wrap {
    display: flex;
    align-items: stretch;
    gap: 0.75rem;
    min-height: 0;

    form {
      flex: 0 0 auto;
    }
  }
</style>
