<!--
// Copyright © 2022, 2023 Hardcore Engineering Inc.
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
  import { afterUpdate, createEventDispatcher, onMount } from 'svelte'

  import type { ButtonItem, HeaderAdaptive, IHeaderState } from '..'
  import {
    deviceOptionsStore as deviceInfo,
    Separator,
    defineSeparators,
    resizeObserver,
    ButtonGroup,
    Scroller,
    panelSeparators,
    Header
  } from '..'
  import IconButton from '../ui-kit/button/IconButton.svelte'
  import plugin from '../plugin'

  export let innerWidth: number = 0
  export let panelWidth: number = 0
  export let isHeader: boolean = true
  export let isAside: boolean = true
  export let isFullSize: boolean = false
  export let withoutTitle: boolean = false
  export let floatAside: boolean = false
  export let allowClose: boolean = true
  export let embedded: boolean = false
  export let useMaxWidth: boolean | undefined = undefined
  export let showMaxWidthButton: boolean = true
  export let customAside: ButtonItem[] | undefined = undefined
  export let selectedAside: string | boolean = customAside ? customAside[0].id : isAside
  export let printHeader = true
  export let printAside = false
  export let adaptive: HeaderAdaptive = 'default'
  export let hideBefore: boolean = false
  export let hideSearch: boolean = true
  export let hideActions: boolean = false
  export let hideExtra: boolean = false
  export let overflowExtra: boolean = false
  export let element: HTMLElement | undefined = undefined

  export function getAside (): string | boolean {
    if (customAside) return selectedAside
    return asideShown
  }
  export function setAside (id: string | boolean): void {
    if (typeof id === 'string' && customAside) {
      const i = customAside.findIndex((as) => as.id === id)
      if (i === -1) return
      handleSelectAside({ detail: id })
    } else {
      asideShown = id !== false
      hideAside = !asideShown
      if (id === false) selectedAside = false
    }
  }

  const dispatch = createEventDispatcher()

  let asideFloat: boolean = false
  let asideShown: boolean = selectedAside !== false
  let hideAside: boolean = !asideShown
  let fullSize: boolean = false
  let oldAside: string | boolean = selectedAside
  let headerState: IHeaderState

  $: if (typeof selectedAside === 'string' && oldAside !== selectedAside) oldAside = selectedAside
  $: setAside(selectedAside)
  $: if (element !== undefined) {
    panelWidth = element.clientWidth
    checkPanel()
  }

  let oldWidth = ''
  let hideTimer: any | undefined

  const checkPanel = (): void => {
    const k = `${panelWidth}-${asideFloat}`
    if (oldWidth === k) {
      return
    }
    oldWidth = k
    if (floatAside) {
      asideFloat = true
    } else if (panelWidth <= 900 && !asideFloat) {
      asideFloat = true
      if (asideShown) {
        asideShown = false
        if (customAside) handleSelectAside({ detail: false }, false)
      }
    } else if (panelWidth > 900) {
      if (asideFloat) asideFloat = false
      if (!asideShown && !hideAside) {
        asideShown = true
        if (customAside) handleSelectAside({ detail: oldAside }, false)
      }
    }
  }

  afterUpdate(() => {
    if (hideTimer) {
      clearTimeout(hideTimer)
    }
    hideTimer = setTimeout(() => {
      checkPanel()
    }, 500)
  })

  onMount(() => dispatch('open'))

  defineSeparators('panel-aside', panelSeparators)

  const handleAside = (): void => {
    asideShown = !asideShown
    hideAside = !asideShown
  }

  const handleSelectAside = (result: { detail: any }, sw: boolean = true): void => {
    selectedAside = result.detail
    if (sw) {
      asideShown = selectedAside !== false
      hideAside = !asideShown
    }
    dispatch('select', result.detail)
  }

  let isPrinting = false
  afterUpdate(() => {
    dispatch('resize', { panelWidth, innerWidth, ...headerState })
  })
</script>

<svelte:window
  on:beforeprint={() => {
    isPrinting = true
  }}
  on:afterprint={() => {
    isPrinting = false
  }}
/>

<div
  bind:this={element}
  class="popupPanel panel"
  class:withPageHeader={$$slots['page-header'] !== undefined}
  class:withPageFooter={$$slots['page-footer'] !== undefined}
  class:embedded
  use:resizeObserver={(element) => {
    panelWidth = element.clientWidth
    checkPanel()
  }}
>
  <Header
    type="type-panel"
    noPrint={!printHeader}
    adaptive={$deviceInfo.isMobile ? 'disabled' : adaptive}
    {hideBefore}
    {hideSearch}
    {hideActions}
    {hideExtra}
    {overflowExtra}
    on:resize={(event) => {
      if (event.detail.headerWidth === undefined) return
      headerState = event.detail
    }}
  >
    <svelte:fragment slot="beforeTitle">
      {#if allowClose}
        <IconButton
          id="btnPClose"
          focusIndex={10001}
          icon={plugin.icon.Cross}
          kind="ghost"
          size="small"
          iconSize="medium"
          tooltip={{ label: plugin.string.Close }}
          noPrint
          on:click={() => {
            dispatch('close')
          }}
        />
        {#if $$slots.beforeTitle}
          <div class="hulyHeader-divider short no-print" />
        {/if}
      {/if}
      <slot name="beforeTitle" />
    </svelte:fragment>

    {#if !withoutTitle}<slot name="title" />{/if}

    <svelte:fragment slot="search">
      <slot name="search" />
    </svelte:fragment>
    <svelte:fragment slot="actions">
      <slot name="actions" />
      <slot name="presence" />
      <slot name="pre-utils" />
      <slot name="utils" />
      {#if useMaxWidth !== undefined && showMaxWidthButton}
        <IconButton
          focusIndex={10009}
          icon={useMaxWidth ? plugin.icon.ArrowsOutLineHorizontal : plugin.icon.ArrowsInLineHorizontal}
          kind="ghost"
          size="small"
          iconSize="medium"
          selected={useMaxWidth}
          tooltip={{ label: plugin.string.UseMaxWidth, direction: 'bottom' }}
          on:click={() => {
            useMaxWidth = !useMaxWidth
            dispatch('maxWidth', useMaxWidth)
          }}
        />
      {/if}
      {#if isFullSize}
        <IconButton
          focusIndex={100010}
          icon={fullSize ? plugin.icon.ArrowsIn : plugin.icon.ArrowSquareOut}
          kind="ghost"
          size="small"
          iconSize="medium"
          selected={fullSize}
          tooltip={{ label: plugin.string.FullSize, direction: 'bottom' }}
          on:click={() => {
            fullSize = !fullSize
            dispatch('fullsize')
          }}
        />
      {/if}
      {#if $$slots.aside && isAside}
        <!-- Sets the aside toggles apart from the document actions -->
        <div class="aside-divider" />
        {#if customAside}
          <ButtonGroup
            items={customAside}
            props={{ kind: 'icon', iconProps: { size: 'medium' } }}
            bind:selected={selectedAside}
            on:select={handleSelectAside}
          />
        {:else}
          <IconButton
            id="btnPAside"
            focusIndex={10008}
            icon={asideShown ? plugin.icon.PanelRightFill : plugin.icon.PanelRightLine}
            kind="ghost"
            size="small"
            iconSize="medium"
            selected={asideShown}
            tooltip={{ label: plugin.string.Properties, direction: 'bottom' }}
            on:click={handleAside}
          />
        {/if}
      {/if}
      <slot name="post-utils" />
    </svelte:fragment>
    <svelte:fragment slot="extra">
      <slot name="extra" />
    </svelte:fragment>
  </Header>
  <div class="popupPanel-body {$deviceInfo.isMobile ? 'mobile' : 'main'}" class:asideShown>
    {#if $deviceInfo.isMobile}
      <div
        class="popupPanel-body__mobile"
        use:resizeObserver={(element) => {
          innerWidth = element.clientWidth
        }}
      >
        <Scroller horizontal padding=".5rem .75rem">
          {#if $$slots.header && isHeader}
            <div class="popupPanel-body__header mobile bottom-divider" class:max={useMaxWidth}>
              <slot name="header" />
            </div>
          {/if}
          <slot />
        </Scroller>
      </div>
    {:else}
      <div
        class="popupPanel-body__main"
        use:resizeObserver={(element) => {
          innerWidth = element.clientWidth
        }}
      >
        {#if $$slots.header && isHeader}
          <div class="popupPanel-body__header-wrapper">
            <div class="popupPanel-body__header main" class:max={useMaxWidth}>
              <slot name="header" />
            </div>
          </div>
        {/if}
        <slot />
        {#if isPrinting && printAside}
          <div class="only-print pagebreak">
            <slot name="aside" />
          </div>
        {/if}
      </div>
    {/if}

    {#if $$slots.aside && isAside && asideShown}
      <Separator name="panel-aside" float={asideFloat} index={0} />
      <div class="popupPanel-body__aside no-print" class:float={asideFloat} class:shown={asideShown}>
        <Separator name="panel-aside" float={asideFloat ? 'aside' : true} index={0} />
        <div class="antiPanel-wrap__content">
          <slot name="aside" />
        </div>
      </div>
    {/if}
  </div>
  {#if $$slots['panel-footer']}
    <div class="popupPanel-footer">
      <slot name="panel-footer" />
    </div>
  {/if}
  <div class="popupPanel-pageHeader only-print" id="page-header">
    <slot name="page-header" />
  </div>
  <div class="popupPanel-pageFooter only-print" id="page-footer">
    <slot name="page-footer" />
  </div>
</div>

<style lang="scss">
  .aside-divider {
    flex-shrink: 0;
    width: 1px;
    height: 1.25rem;
    margin: 0 var(--spacing-0_5);
    background-color: var(--global-ui-BorderColor);
  }
</style>
