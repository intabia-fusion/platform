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
  import { afterUpdate, createEventDispatcher, onMount } from 'svelte'

  import IconClose from '../../components/icons/Close.svelte'
  import IconDetails from '../../components/icons/Details.svelte'
  import IconMaxWidth from '../../components/icons/MaxWidth.svelte'
  import IconMinWidth from '../../components/icons/MinWidth.svelte'
  import IconScale from '../../components/icons/Scale.svelte'
  import IconScaleFull from '../../components/icons/ScaleFull.svelte'
  import Scroller from '../../components/Scroller.svelte'
  import Separator from '../../components/Separator.svelte'
  import { deviceOptionsStore as deviceInfo } from '../../index'
  import ui from '../../plugin'
  import { defineSeparators, panelSeparators, resizeObserver } from '../../resize'
  import IconButton from '../button/IconButton.svelte'
  import ButtonGroup from '../button-group/ButtonGroup.svelte'
  import type { ButtonGroupItem } from '../button-group/types'
  import PanelHeader from '../panel-header/PanelHeader.svelte'
  import type { PanelHeaderAdaptive, PanelHeaderSize } from '../panel-header/types'
  import type { PanelEvents, PanelProps, PanelResize } from './types'

  type $$Props = PanelProps
  type $$Events = PanelEvents

  export let closable: boolean = true
  export let isHeader: boolean = true
  export let isAside: boolean = true
  export let floatAside: boolean = false
  export let isFullSize: boolean = false
  export let withoutTitle: boolean = false
  export let embedded: boolean = false
  export let useMaxWidth: boolean | undefined = undefined
  export let showMaxWidthButton: boolean = true
  export let customAside: ButtonGroupItem[] | undefined = undefined
  export let selectedAside: string | boolean = customAside !== undefined ? customAside[0].id : isAside
  export let printHeader: boolean = true
  export let printAside: boolean = false
  export let adaptive: PanelHeaderAdaptive = 'auto'
  export let scrollExtra: boolean = false
  export let innerWidth: number = 0
  export let panelWidth: number = 0
  export let element: HTMLElement | undefined = undefined

  export function getAside (): string | boolean {
    if (customAside !== undefined) return selectedAside
    return asideShown
  }

  export function setAside (id: string | boolean): void {
    if (typeof id === 'string' && customAside !== undefined) {
      if (customAside.findIndex((item) => item.id === id) === -1) return
      selectAside(id)
    } else {
      asideShown = id !== false
      hideAside = !asideShown
      if (id === false) selectedAside = false
    }
  }

  const dispatch = createEventDispatcher<{
    open: null
    close: null
    select: string | boolean
    maxWidth: boolean
    fullsize: null
    resize: PanelResize
  }>()

  // Below this width a docked aside would squeeze the content: it floats over it instead.
  const DOCK_WIDTH = 900

  let asideFloat = false
  let asideShown = selectedAside !== false
  let hideAside = !asideShown
  let fullSize = false
  let lastAside: string | boolean = selectedAside
  let headerSize: PanelHeaderSize | undefined
  let isPrinting = false

  $: if (typeof selectedAside === 'string' && lastAside !== selectedAside) lastAside = selectedAside
  $: setAside(selectedAside)
  $: if (element !== undefined) {
    panelWidth = element.clientWidth
    checkPanel()
  }

  let checkedFor = ''
  let checkTimer: ReturnType<typeof setTimeout> | undefined

  function checkPanel (): void {
    const key = `${panelWidth}-${asideFloat}`
    if (checkedFor === key) return
    checkedFor = key
    if (floatAside) {
      asideFloat = true
    } else if (panelWidth <= DOCK_WIDTH && !asideFloat) {
      asideFloat = true
      if (asideShown) {
        asideShown = false
        if (customAside !== undefined) selectAside(false, false)
      }
    } else if (panelWidth > DOCK_WIDTH) {
      if (asideFloat) asideFloat = false
      if (!asideShown && !hideAside) {
        asideShown = true
        if (customAside !== undefined) selectAside(lastAside, false)
      }
    }
  }

  // The aside reacts to the width after the layout settles, not on every pass of a resize.
  afterUpdate(() => {
    clearTimeout(checkTimer)
    checkTimer = setTimeout(checkPanel, 500)
  })

  afterUpdate(() => {
    if (headerSize !== undefined) dispatch('resize', { panelWidth, innerWidth, ...headerSize })
  })

  onMount(() => {
    dispatch('open', null)
  })

  defineSeparators('panel-aside', panelSeparators)

  function toggleAside (): void {
    asideShown = !asideShown
    hideAside = !asideShown
  }

  function selectAside (id: string | boolean, show: boolean = true): void {
    selectedAside = id
    if (show) {
      asideShown = selectedAside !== false
      hideAside = !asideShown
    }
    dispatch('select', id)
  }
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
  class:withPageHeader={$$slots['page-header']}
  class:withPageFooter={$$slots['page-footer']}
  class:embedded
  use:resizeObserver={(element) => {
    panelWidth = element.clientWidth
    checkPanel()
  }}
>
  <PanelHeader
    adaptive={$deviceInfo.isMobile ? 'disabled' : adaptive}
    {scrollExtra}
    noPrint={!printHeader}
    on:resize={(event) => {
      headerSize = event.detail
    }}
  >
    <svelte:fragment slot="before">
      {#if closable}
        <IconButton
          id="btnPClose"
          focusIndex={10001}
          icon={IconClose}
          kind="ghost"
          size="small"
          iconSize="medium"
          tooltip={{ label: ui.string.Close }}
          on:click={() => {
            dispatch('close', null)
          }}
        />
        {#if $$slots.before}<span class="panel__divider" />{/if}
      {/if}
      <slot name="before" />
    </svelte:fragment>

    {#if !withoutTitle}<slot name="title" />{/if}

    <svelte:fragment slot="presence"><slot name="presence" /></svelte:fragment>
    <svelte:fragment slot="search"><slot name="search" /></svelte:fragment>
    <svelte:fragment slot="extra"><slot name="extra" /></svelte:fragment>
    <svelte:fragment slot="actions">
      <slot name="actions" />
      <slot name="pre-utils" />
      <slot name="utils" />
      {#if useMaxWidth !== undefined && showMaxWidthButton}
        <IconButton
          focusIndex={10009}
          icon={useMaxWidth ? IconMaxWidth : IconMinWidth}
          kind="ghost"
          size="small"
          iconSize="medium"
          selected={useMaxWidth}
          tooltip={{ label: ui.string.UseMaxWidth, direction: 'bottom' }}
          on:click={() => {
            useMaxWidth = !useMaxWidth
            dispatch('maxWidth', useMaxWidth)
          }}
        />
      {/if}
      {#if isFullSize}
        <IconButton
          focusIndex={10010}
          icon={fullSize ? IconScale : IconScaleFull}
          kind="ghost"
          size="small"
          iconSize="medium"
          selected={fullSize}
          tooltip={{ label: ui.string.FullSize, direction: 'bottom' }}
          on:click={() => {
            fullSize = !fullSize
            dispatch('fullsize', null)
          }}
        />
      {/if}
      {#if $$slots.aside && isAside}
        <!-- Sets the aside toggles apart from the actions; alone in the group it has nothing to part from. -->
        <span class="panel__divider panel__aside-divider" />
        {#if customAside !== undefined}
          <ButtonGroup
            items={customAside}
            iconSize="medium"
            selected={typeof selectedAside === 'string' ? selectedAside : undefined}
            on:select={(event) => {
              selectAside(event.detail ?? false)
            }}
          />
        {:else}
          <IconButton
            id="btnPAside"
            focusIndex={10008}
            icon={IconDetails}
            iconProps={{ filled: asideShown }}
            kind="ghost"
            size="small"
            iconSize="medium"
            selected={asideShown}
            tooltip={{ label: ui.string.Properties, direction: 'bottom' }}
            on:click={toggleAside}
          />
        {/if}
      {/if}
      <slot name="post-utils" />
    </svelte:fragment>
  </PanelHeader>

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
  .panel__divider {
    flex-shrink: 0;
    width: 1px;
    height: 1.25rem;
    margin: 0 var(--spacing-0_5);
    background-color: var(--global-ui-BorderColor);
  }
  // Nothing before the toggle in the group: no line to set it apart.
  .panel__aside-divider:first-child {
    display: none;
  }
</style>
