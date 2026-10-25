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
  import { Analytics } from '@hcengineering/analytics'
  import type { Blob, BlobMetadata, Ref } from '@hcengineering/core'
  import { SortingOrder } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import ui, {
    Blurhash,
    Hotkey,
    Loading,
    popupstore,
    showPopup,
    themeStore,
    tooltip,
    type AnySvelteComponent,
    type IconComponent,
    Icon
  } from '@hcengineering/ui'
  import { FileNoPreview, IconButton } from '@hcengineering/ui/kit'
  import { createEventDispatcher, onMount } from 'svelte'
  import { get } from 'svelte/store'

  import { ComponentExtensions } from '../../index'
  import { downloadFile, fileBadge, getFileUrl, isTextFile } from '../../file'
  import presentation from '../../plugin'
  import ActionContext from '../ActionContext.svelte'
  import FilePreview from '../FilePreview.svelte'
  import ObjectPopup from '../ObjectPopup.svelte'
  import FileHeader from './FileHeader.svelte'

  interface Part {
    component: AnySvelteComponent
    props?: Record<string, any>
  }

  interface Shape {
    width: number
    height: number
  }

  export let file: Ref<Blob>
  export let name: string
  export let contentType: string
  export let metadata: BlobMetadata | undefined = undefined
  export let props: Record<string, any> & {
    drawings?: any[]
    drawingAvailable?: boolean
    drawingEditable?: boolean
    loadDrawings?: () => Promise<any>
    createDrawing?: (data: any) => Promise<any>
  } = {}

  export let navigation: { prev?: () => void, next?: () => void } | undefined = undefined
  export let extraActions: Array<{ icon: IconComponent, label: IntlString, action: () => void }> = []
  export let subtitle: string | undefined = undefined
  export let size: number | undefined = undefined
  export let viewer: Part | undefined = undefined
  // Read by the popup, which opens the viewer over the whole window.
  export let fullSize: boolean = true
  export let fullWindow: boolean = true
  $: void fullSize
  $: void fullWindow

  const dispatch = createEventDispatcher<{ close: undefined }>()

  const MIN_SCALE = 1
  const MAX_SCALE = 8
  const STEP = 1.5
  // Elements that use the arrows and keys themselves.
  const OWNS_KEYS = 'input, textarea, [contenteditable="true"], video, audio, [role="slider"], [role="listbox"]'

  let pictureLoaded = false
  let pictureFailed = false
  // Real size once loaded: the metadata may be off, e.g. for a photo turned by its EXIF.
  let loadedShape: Shape | undefined
  // A copy already on the page, shown until the original comes.
  let early: string | undefined
  // Measured so the frame has its size before the picture arrives.
  let areaWidth = 0
  let areaHeight = 0

  $: src = getFileUrl(file, name)
  $: drawing = props.drawingEditable === true
  // Drawings are laid over the picture by the model's viewer, so a drawn picture goes there.
  $: drawn = props.drawingAvailable === true && (props.drawings?.length ?? 0) > 0
  $: image = contentType.startsWith('image/') && viewer === undefined && !pictureFailed
  $: picture = image && !drawing && !drawn
  $: sheet = isTextFile(contentType) && viewer === undefined
  $: pdf = contentType === 'application/pdf' && viewer === undefined
  $: media = image || contentType.startsWith('video/')
  $: dark = media && $themeStore.dark
  // A document keeps its full width: the arrows lie over its margins.
  $: paged = navigation !== undefined && !pdf && !sheet

  $: resetPicture(src)
  $: shape = loadedShape ?? metadataShape(metadata)
  $: frame = shape !== undefined && areaWidth > 0 && areaHeight > 0 ? fit(shape, areaWidth, areaHeight) : undefined
  $: blurhash = metadata?.thumbnail?.blurhash as string | undefined

  function resetPicture (_src: string): void {
    pictureLoaded = false
    pictureFailed = false
    loadedShape = undefined
    const known = metadataShape(metadata)
    early = known !== undefined ? shownCopy(file, known) : undefined
  }

  function metadataShape (metadata: BlobMetadata | undefined): Shape | undefined {
    const width = Number(metadata?.originalWidth)
    const height = Number(metadata?.originalHeight)
    return width > 0 && height > 0 ? { width, height } : undefined
  }

  function fit (shape: Shape, width: number, height: number): Shape {
    const ratio = Math.min(1, width / shape.width, height / shape.height)
    return { width: shape.width * ratio, height: shape.height * ratio }
  }

  function shownCopy (file: Ref<Blob>, shape: Shape): string | undefined {
    const id = encodeURIComponent(file)
    const ratio = shape.width / shape.height
    let best: HTMLImageElement | undefined
    for (const img of Array.from(document.images)) {
      if (!img.complete || img.naturalWidth === 0 || !img.currentSrc.includes(id)) continue
      // Whole pictures only: a cropped cover stretched to the frame jumps when the original comes.
      if (Math.abs(img.naturalWidth / img.naturalHeight / ratio - 1) > 0.02) continue
      if (best === undefined || img.naturalWidth > best.naturalWidth) best = img
    }
    return best?.currentSrc
  }

  function onPictureLoad (e: Event): void {
    const img = e.currentTarget as HTMLImageElement
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      loadedShape = { width: img.naturalWidth, height: img.naturalHeight }
    }
    pictureLoaded = true
  }

  let scale = 1
  let x = 0
  let y = 0
  // Where the pointer and the picture were when the drag began.
  let dragging: { pointerX: number, pointerY: number, fromX: number, fromY: number } | undefined

  $: if (!picture) resetZoom()

  function resetZoom (): void {
    scale = 1
    x = 0
    y = 0
  }

  function zoom (factor: number): void {
    scale = Math.min(Math.max(scale * factor, MIN_SCALE), MAX_SCALE)
    if (scale === MIN_SCALE) resetZoom()
  }

  // A trackpad pinch arrives as a wheel with Ctrl.
  function onWheel (e: WheelEvent): void {
    if (!picture) return
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      zoom(Math.exp(-e.deltaY / 200))
    } else if (scale > MIN_SCALE) {
      e.preventDefault()
      x -= e.deltaX
      y -= e.deltaY
    }
  }

  function startDrag (e: PointerEvent): void {
    if (scale === MIN_SCALE || e.button !== 0) return
    e.preventDefault()
    dragging = { pointerX: e.clientX, pointerY: e.clientY, fromX: x, fromY: y }
  }

  function onMove (e: PointerEvent): void {
    if (dragging === undefined) return
    x = dragging.fromX + e.clientX - dragging.pointerX
    y = dragging.fromY + e.clientY - dragging.pointerY
  }

  // A drag, selection or stroke that starts inside and ends on the backdrop still clicks it.
  let pressedOn: EventTarget | null = null

  function close (): void {
    dispatch('close')
  }

  function onStageClick (e: MouseEvent): void {
    if (pressedOn === e.target) close()
  }

  // Keys belong to anything opened above the viewer; by its id, as popups below may close meanwhile.
  const opened = get(popupstore)
  const ownPopup = opened[opened.length - 1]?.id

  function coveredByPopup (): boolean {
    return $popupstore.length > $popupstore.findIndex((it) => it.id === ownPopup) + 1
  }

  function onKeydown (e: KeyboardEvent): void {
    if (e.defaultPrevented || drawing || coveredByPopup()) return
    // Browser zoom and history shortcuts stay the browser's.
    if (e.key !== 'Escape' && (e.altKey || e.ctrlKey || e.metaKey)) return
    if (e.target instanceof Element && e.target.closest(OWNS_KEYS) != null) return
    const action = keyAction(e.key)
    if (action === undefined) return
    e.preventDefault()
    e.stopPropagation()
    action()
  }

  function keyAction (key: string): (() => void) | undefined {
    if (key === 'Escape') return close
    if (key === 'ArrowLeft') return navigation?.prev
    if (key === 'ArrowRight') return navigation?.next
    if (!picture) return undefined
    if (key === '+' || key === '=') {
      return () => {
        zoom(STEP)
      }
    }
    if (key === '-') {
      return () => {
        zoom(1 / STEP)
      }
    }
    if (key === '0') return resetZoom
    return undefined
  }

  let drawingLoading = false

  $: void loadDrawings(file)

  async function loadDrawings (_file: Ref<Blob>): Promise<void> {
    if (props.drawingAvailable !== true || props.loadDrawings === undefined) return
    drawingLoading = true
    try {
      props.drawings = await props.loadDrawings()
    } catch (error: any) {
      Analytics.handleError(error)
    } finally {
      drawingLoading = false
    }
  }

  // A saved drawing goes on top of the list, so the picture shows it at once.
  onMount(() => {
    const save = props.createDrawing
    if (props.drawingAvailable !== true || save === undefined) return
    props.createDrawing = async (data: any): Promise<any> => {
      const created = await save(data)
      props.drawings = [created, ...(props.drawings ?? [])]
      return created
    }
  })

  function selectDrawing (ev: MouseEvent): void {
    const latest = props.drawings?.[0]
    if (latest === undefined) return
    showPopup(
      ObjectPopup,
      {
        _class: latest._class,
        selected: latest._id,
        docQuery: { parent: latest.parent },
        options: { sort: { createdOn: SortingOrder.Descending } },
        searchMode: 'disabled',
        type: 'presenter',
        width: 'auto'
      },
      ev.target as HTMLElement,
      (result) => {
        if (result !== undefined) props.drawings = [result]
      }
    )
  }
</script>

<!-- Capture: the list the viewer was opened from may still hold the focus and move on arrows itself. -->
<svelte:window
  on:keydown|capture={onKeydown}
  on:pointermove={onMove}
  on:pointercancel={() => (dragging = undefined)}
  on:pointerdown|capture={(e) => (pressedOn = e.target)}
  on:pointerup={() => (dragging = undefined)}
/>

<ActionContext context={{ mode: 'browser' }} />
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="scrim" on:click|self={onStageClick}>
  <div class="file-viewer" class:plain={!dark}>
    <FileHeader {name} {contentType} {subtitle} {size} plate={dark}>
      {#if props.drawingAvailable === true}
        {#if props.drawings !== undefined && props.drawings.length > 0}
          <IconButton
            icon={ui.icon.ClockCounterClockwise}
            kind="ghost"
            size="small"
            iconSize="medium"
            disabled={drawingLoading || drawing}
            tooltip={{ label: presentation.string.DrawingHistory }}
            on:click={selectDrawing}
          />
        {/if}
        <IconButton
          icon={ui.icon.Scribble}
          kind="ghost"
          size="small"
          iconSize="medium"
          disabled={drawingLoading}
          pressed={drawing}
          tooltip={{ label: presentation.string.StartDrawing }}
          on:click={() => {
            props.drawingEditable = !drawing
          }}
        />
      {/if}
      <IconButton
        icon={ui.icon.Download}
        kind="ghost"
        size="small"
        iconSize="medium"
        tooltip={{
          label: props.drawingAvailable === true ? presentation.string.DownloadOriginal : presentation.string.Download
        }}
        on:click={() => {
          downloadFile(file, name)
        }}
      />
      {#each extraActions as extra}
        <IconButton
          icon={extra.icon}
          kind="ghost"
          size="small"
          iconSize="medium"
          tooltip={{ label: extra.label }}
          on:click={extra.action}
        />
      {/each}
      <ComponentExtensions
        extension={presentation.extension.FilePreviewPopupActions}
        props={{ file, name, contentType, metadata, size }}
      />
      <span class="divider" />
      <span class="key" aria-hidden="true"><Hotkey key="Esc" /></span>
      <IconButton
        icon={ui.icon.Cross}
        kind="ghost"
        size="small"
        iconSize="medium"
        tooltip={{ label: presentation.string.Close }}
        on:click={close}
      />
    </FileHeader>

    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div
      class="stage"
      class:bleed={pdf || sheet}
      class:paged
      class:picture
      on:click|self={onStageClick}
      on:wheel={onWheel}
    >
      {#if picture}
        {#if !pictureLoaded}
          <div class="loading"><Loading /></div>
        {/if}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="fit" bind:clientWidth={areaWidth} bind:clientHeight={areaHeight} on:click|self={onStageClick}>
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="frame"
            class:sized={frame !== undefined}
            class:zoomed={scale > MIN_SCALE}
            class:dragging={dragging !== undefined}
            style:width={frame !== undefined ? `${frame.width}px` : undefined}
            style:height={frame !== undefined ? `${frame.height}px` : undefined}
            style:transform={`translate(${x}px, ${y}px) scale(${scale})`}
            on:pointerdown={startDrag}
            on:dblclick={() => {
              if (scale > MIN_SCALE) resetZoom()
              else zoom(STEP * STEP)
            }}
          >
            {#if frame !== undefined}
              {#if early !== undefined}
                <img class="early" class:gone={pictureLoaded} src={early} alt="" draggable="false" />
              {:else if blurhash !== undefined}
                <span class="early" class:gone={pictureLoaded}><Blurhash {blurhash} /></span>
              {/if}
            {/if}
            <img
              class="photo"
              class:shown={pictureLoaded}
              {src}
              alt={name}
              draggable="false"
              on:load={onPictureLoad}
              on:error={() => (pictureFailed = true)}
            />
          </div>
        </div>
      {:else if pictureFailed}
        <div class="content">
          <FileNoPreview {name} badge={fileBadge(name, contentType)} url={src} />
        </div>
      {:else}
        <div class="content" class:paper={sheet}>
          <FilePreview
            {file}
            {contentType}
            {name}
            {metadata}
            props={pdf ? { ...props, view: 'Fit' } : sheet ? { ...props, frame: false } : props}
            {viewer}
            fit
          />
        </div>
      {/if}
    </div>

    <!-- No page count: the total is rarely known exactly. -->
    {#if navigation?.prev !== undefined}
      <button
        class="nav prev"
        use:tooltip={{ label: presentation.string.Previous }}
        on:click={() => navigation?.prev?.()}
      >
        <Icon icon={ui.icon.ChevronLeft} size="medium" />
      </button>
    {/if}
    {#if navigation?.next !== undefined}
      <button class="nav next" use:tooltip={{ label: presentation.string.Next }} on:click={() => navigation?.next?.()}>
        <Icon icon={ui.icon.ChevronRight} size="medium" />
      </button>
    {/if}

    {#if picture}
      <div class="zoom">
        <IconButton
          icon={ui.icon.Minus}
          kind="ghost"
          size="small"
          shape="round"
          disabled={scale <= MIN_SCALE}
          tooltip={{ label: presentation.string.ZoomOut }}
          on:click={() => {
            zoom(1 / STEP)
          }}
        />
        <button class="percent" use:tooltip={{ label: presentation.string.ActualSize }} on:click={resetZoom}>
          {Math.round(scale * 100)}%
        </button>
        <IconButton
          icon={ui.icon.Plus}
          kind="ghost"
          size="small"
          shape="round"
          disabled={scale >= MAX_SCALE}
          tooltip={{ label: presentation.string.ZoomIn }}
          on:click={() => {
            zoom(STEP)
          }}
        />
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .scrim {
    display: flex;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 1.5rem;
    background-color: var(--global-media-OverlayColor);

    @media (max-width: 600px) {
      padding: 0.5rem;
    }
  }

  .file-viewer {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--theme-popup-divider);
    border-radius: var(--large-BorderRadius);
    box-shadow: var(--global-modal-ShadowX) var(--global-modal-ShadowY) var(--global-modal-ShadowBlur)
      var(--global-modal-ShadowSpread) var(--global-popover-ShadowColor);
    color: var(--viewer-text);
    background-color: var(--viewer-bg);
    user-select: none;

    --viewer-bg: var(--theme-popup-color);
    --viewer-plate: var(--theme-popup-color);
    --viewer-text: var(--global-on-media-TextColor);
    --viewer-muted: color-mix(in srgb, var(--global-on-media-TextColor) 65%, transparent);
    --viewer-icon: var(--global-on-media-TextColor);
    --viewer-hover: color-mix(in srgb, var(--global-on-media-TextColor) 12%, transparent);
    --viewer-active: color-mix(in srgb, var(--global-on-media-TextColor) 18%, transparent);
    --viewer-pill: var(--global-media-OverlayColor);
    --viewer-divider: color-mix(in srgb, var(--global-on-media-TextColor) 12%, transparent);
    --viewer-shadow: 0 0.75rem 3rem color-mix(in srgb, var(--global-popover-ShadowColor) 45%, transparent);

    &.plain {
      --viewer-text: var(--theme-caption-color);
      --viewer-muted: var(--theme-content-color);
      --viewer-icon: var(--theme-content-color);
      --viewer-hover: color-mix(in srgb, var(--theme-caption-color) 8%, transparent);
      --viewer-active: color-mix(in srgb, var(--theme-caption-color) 14%, transparent);
      --viewer-pill: color-mix(in srgb, var(--theme-panel-color) 85%, transparent);
      --viewer-divider: var(--theme-divider-color);
      --viewer-shadow: 0 0.5rem 2rem color-mix(in srgb, var(--global-popover-ShadowColor) 16%, transparent);
    }

    // Kit buttons take the accent by default; here they stay neutral on any picture.
    --button-tertiary-IconColor: var(--viewer-icon);
    --button-tertiary-icon-IconColor: var(--viewer-icon);
    --button-tertiary-hover-BackgroundColor: var(--viewer-hover);
    --button-tertiary-active-BackgroundColor: var(--viewer-active);
  }

  .key {
    display: flex;
    color: var(--viewer-muted);
  }

  .divider {
    width: 1px;
    height: 1.25rem;
    margin: 0 0.25rem;
    background-color: var(--viewer-divider);
  }

  // Room at the bottom for the zoom and on the sides for the arrows, so they never cover the file.
  .stage {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-grow: 1;
    min-height: 0;
    padding: 0.75rem 1.5rem 1.5rem;
    overflow: hidden;

    &.picture {
      padding-bottom: 4.25rem;
    }

    // A document fills the width; the PDF toolbar then reads as the header's second row.
    &.bleed {
      padding: 0;
    }

    &.paged {
      padding-left: 4.5rem;
      padding-right: 4.5rem;
    }
  }

  .fit {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .frame {
    position: relative;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: var(--small-BorderRadius);
    transition: transform 0.12s ease-out;
    cursor: zoom-in;

    // Without the size in the metadata the picture sizes itself once loaded, hidden until then.
    &:not(.sized) {
      display: flex;
      max-width: 100%;
      max-height: 100%;

      .photo {
        max-width: 100%;
        max-height: 100%;
      }
    }

    &.sized .photo {
      width: 100%;
      height: 100%;
    }

    // A finger moves the zoomed picture instead of scrolling the page.
    &.zoomed {
      cursor: grab;
      touch-action: none;
    }

    &.dragging {
      cursor: grabbing;
      transition: none;
    }
  }

  .photo {
    position: relative;
    display: block;
    object-fit: contain;
    // The copy shown first lost the HDR of a phone photo: the original in full brightness would flash.
    dynamic-range-limit: standard;
    opacity: 0;
    transition: opacity 0.15s ease-out;

    &.shown {
      opacity: 1;
    }
  }

  // Soft until the original covers it; removed after the fade so a transparent picture shows no ghost.
  .early {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;

    &.gone {
      visibility: hidden;
      transition: visibility 0s 0.15s;
    }
  }

  .content {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;

    > :global(*) {
      flex-grow: 1;
    }

    &.paper {
      overflow: hidden;
      color: var(--theme-content-color);
      user-select: text;
    }
  }

  .nav {
    position: absolute;
    top: calc(50% + 1.75rem);
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    margin-top: -1.25rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    color: var(--viewer-text);
    background-color: var(--viewer-hover);
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover {
      background-color: var(--viewer-active);
    }

    &.prev {
      left: 1rem;
    }

    &.next {
      right: 1rem;
    }
  }

  .zoom {
    position: absolute;
    left: 1rem;
    bottom: 1rem;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.125rem;
    padding: 0.25rem;
    border-radius: 2rem;
    background-color: var(--viewer-pill);
    box-shadow: var(--viewer-shadow);
    backdrop-filter: blur(0.5rem);
  }

  .percent {
    min-width: 3.25rem;
    padding: 0.25rem;
    border: none;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--viewer-text);
    background: none;
    cursor: pointer;

    &:hover {
      background-color: var(--viewer-hover);
    }
  }
</style>
