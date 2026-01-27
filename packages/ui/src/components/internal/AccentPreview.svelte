<!--
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
-->
<script lang="ts">
  // AccentPreview
  // Small preview box shown on the left side of the screen when hovering an accent.
  // Shows several controls (buttons, checkboxes, list) to help choose an accent.
  import { createEventDispatcher } from 'svelte'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import {
    Button,
    ButtonMenu,
    ButtonWithDropdown,
    CheckBox,
    ModernCheckbox,
    ListView,
    Label,
    Separator,
    Spinner,
    IconCheck,
    hexToRgb,
    rgbToHex,
    IconCheckmark,
    IconActivity,
    IconAttachment,
    IconClose
  } from '../..'
  import Loading from '../Loading.svelte'
  import ModernToggle from '../ModernToggle.svelte'
  import ButtonIcon from '../ButtonIcon.svelte'
  import ButtonGroup from '../ButtonGroup.svelte'
  import Toggle from '../Toggle.svelte'
  import MiniToggle from '../MiniToggle.svelte'
  import ModernButton from '../ModernButton.svelte'
  import { getCurrentTheme, themeStore } from '@hcengineering/theme'

  interface AccentOption {
    id: string
    name: string
    color: string
  }

  export let accent: AccentOption | undefined = {
    id: 'accent-default',
    name: 'Accent',
    color: '#205DC2'
  }

  // Labels used inside the preview (cast as IntlString to satisfy components)
  const PREVIEW_LABEL: IntlString = getEmbeddedLabel('Preview')
  const LABEL_PRIMARY: IntlString = getEmbeddedLabel('Primary')
  const LABEL_REGULAR: IntlString = getEmbeddedLabel('Regular')
  const LABEL_SECONDARY: IntlString = getEmbeddedLabel('Secondary')
  const LABEL_TERTIARY: IntlString = getEmbeddedLabel('Tertiary')
  const LABEL_NEGATIVE: IntlString = getEmbeddedLabel('Negative')
  const LABEL_YES: IntlString = getEmbeddedLabel('Yes')
  const LABEL_NO: IntlString = getEmbeddedLabel('No')
  const LABEL_ATTENTION: IntlString = getEmbeddedLabel('Attention')
  const LABEL_CHECKED: IntlString = getEmbeddedLabel('Checked')
  const LABEL_DISABLED: IntlString = getEmbeddedLabel('Disabled')
  const LABEL_USE_ACCENT: IntlString = getEmbeddedLabel('Use this accent')
  // Extra preview labels for states and variants
  const LABEL_LOADING: IntlString = getEmbeddedLabel('Loading')
  const LABEL_PRESSED: IntlString = getEmbeddedLabel('Pressed')
  const LABEL_GHOST: IntlString = getEmbeddedLabel('Ghost')
  const LABEL_LINK: IntlString = getEmbeddedLabel('Link')
  const LABEL_CONTRAST: IntlString = getEmbeddedLabel('Contrast')
  const LABEL_DANGEROUS: IntlString = getEmbeddedLabel('Dangerous')

  // Rectangle of hovered element (optional)
  export let anchorRect: DOMRect | null = null

  // keep the dispatcher simple (avoid inline generic which sometimes confuses parsers)
  const dispatch = createEventDispatcher()

  let previewEl: HTMLElement | null = null

  const listItems = ['Preview item 1', 'Preview item 2', 'Preview item 3']
  const MENU_LABEL_ONE: IntlString = getEmbeddedLabel('One')
  const MENU_LABEL_TWO: IntlString = getEmbeddedLabel('Two')
  const menuItems = [
    { id: 'one', label: MENU_LABEL_ONE },
    { id: 'two', label: MENU_LABEL_TWO }
  ]
  const DROPDOWN_OPTION_1: IntlString = getEmbeddedLabel('Option 1')
  const dropdownItems = [{ id: 'one', label: DROPDOWN_OPTION_1 }]
  let selectedListIndex = 0

  function clamp (v: number, a: number, b: number): number {
    return Math.max(a, Math.min(b, v))
  }

  function darken (hex: string, amount = 0.12): string {
    try {
      const { r, g, b } = hexToRgb(hex)
      const factor = 1 - amount
      return rgbToHex({
        r: Math.round(clamp(r * factor, 0, 255)),
        g: Math.round(clamp(g * factor, 0, 255)),
        b: Math.round(clamp(b * factor, 0, 255))
      })
    } catch {
      return hex
    }
  }

  function getContrastColor (hex: string): string {
    const { r, g, b } = hexToRgb(hex)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness > 186 ? '#000000' : '#FFFFFF'
  }

  $: base = accent?.color ?? '#205DC2'
  $: hover = darken(base, 0.12)
  $: pressed = darken(base, 0.22)
  $: textColor = getContrastColor(base)
  // ensure hover/pressed are recognized as used by the type checker
  $: void hover
  $: void pressed

  let posLeft = 12
  let posTop = 120

  // Recompute popup position when anchor or size changes (try to place it next to settings popup)
  $: if (previewEl != null && anchorRect != null) {
    const ph = previewEl.offsetHeight
    const pw = previewEl.offsetWidth
    const proposed = Math.round(anchorRect.top + anchorRect.height / 2 - ph / 2)
    posTop = clamp(proposed, 8, Math.max(8, window.innerHeight - ph - 8))

    // Try to find the nearest settings popup container ('.ap-box') around the anchor
    // and use its rect for horizontal placement so the preview appears next to the popup.
    let rectToUse = anchorRect
    const cx = anchorRect.left + anchorRect.width / 2
    const cy = anchorRect.top + anchorRect.height / 2
    const el = document.elementFromPoint(cx, cy)
    const popupEl = el?.closest('.ap-box')
    if (popupEl != null && popupEl instanceof HTMLElement) {
      rectToUse = popupEl.getBoundingClientRect()
    }

    const gap = 8
    const rightPos = Math.round(rectToUse.right + gap)
    const leftPos = Math.round(rectToUse.left - pw - gap)

    // Prefer left side of the settings popup; if not enough space, place to its right.
    if (leftPos >= 8) {
      posLeft = Math.max(8, leftPos)
    } else if (rightPos + pw + 8 <= window.innerWidth) {
      posLeft = Math.max(8, rightPos)
    } else {
      // fallback: keep inside viewport
      posLeft = Math.max(8, Math.min(leftPos, window.innerWidth - pw - 8))
    }
  } else if (previewEl != null) {
    // Center vertically if no anchor provided
    posTop = Math.round(window.innerHeight / 2 - previewEl.offsetHeight / 2)
    // Default to horizontal center if no anchor available
    posLeft = Math.max(8, Math.round(window.innerWidth / 2 - previewEl.offsetWidth / 2))
  }

  function applyAccent (): void {
    if (accent) {
      dispatch('select', accent.id)
    }
  }

  function handleMouseEnter (): void {
    dispatch('enter')
  }
  function handleMouseLeave (): void {
    dispatch('leave')
  }

  function onListClick (ev: CustomEvent<number>): void {
    selectedListIndex = ev.detail
  }
</script>

<div
  bind:this={previewEl}
  class="accent-preview {accent?.id ??
    'accent-huly'} {`accent-${$themeStore.dark ? 'dark' : 'light'}-${(accent?.id ?? 'accent-huly').replace('accent-', '')}`}"
  role="dialog"
  aria-label="Accent preview"
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
  style="
    left: {posLeft}px;
    top: {posTop}px;
    --primary-button-color: {textColor};
  "
>
  <div class="ap-header">
    <div class="swatch" style="background-color: {base}; color: {textColor}">
      <div class="swatch-inner" aria-hidden="true" />
    </div>
    <div class="header-text">
      <div class="accent-name">{accent?.name}</div>
      <div class="accent-desc"><Label label={PREVIEW_LABEL} /></div>
    </div>
  </div>

  <div class="ap-content">
    <div class="row btn-row">
      <Button kind="primary" label={LABEL_PRIMARY} />
      <Button kind="regular" label={LABEL_REGULAR} />
      <Button kind="secondary" label={LABEL_SECONDARY} />
    </div>

    <div class="row btn-row">
      <Button kind="primary" label={LABEL_LOADING} loading />
      <Button kind="primary" label={LABEL_PRESSED} pressed />
      <Button kind="primary" label={LABEL_DISABLED} disabled />
    </div>

    <div class="row btn-row small">
      <Button kind="positive" label={LABEL_YES} />
      <Button kind="positive" pressed label={LABEL_YES} />
      <Button kind="positive" pressed disabled label={LABEL_YES} />
      <Button kind="negative" label={LABEL_NO} />
      <Button kind="negative" pressed label={LABEL_NO} />
      <Button kind="negative" pressed disabled label={LABEL_NO} />
    </div>
    <div class="row btn-row small">
      <Button kind="attention" label={LABEL_ATTENTION} />
      <Button kind="attention" pressed label={LABEL_ATTENTION} />
      <Button kind="attention" disabled label={LABEL_ATTENTION} />
      <Button kind="attention" pressed disabled label={LABEL_ATTENTION} />
    </div>
    <div class="row btn-row small">
      <Button kind="dangerous" label={LABEL_DANGEROUS} />
      <Button kind="dangerous" pressed label={LABEL_DANGEROUS} />
      <Button kind="dangerous" disabled label={LABEL_DANGEROUS} />
      <Button kind="dangerous" pressed disabled label={LABEL_DANGEROUS} />
    </div>
    <div class="row btn-row small">
      <Button kind="contrast" label={LABEL_CONTRAST} />
      <Button kind="contrast" pressed label={LABEL_CONTRAST} />
      <Button kind="contrast" disabled label={LABEL_CONTRAST} />
      <Button kind="contrast" pressed disabled label={LABEL_CONTRAST} />
    </div>

    <div class="row btn-row small">
      <Button kind="ghost" label={LABEL_GHOST} />
      <Button kind="link" label={LABEL_LINK} />
      <Button kind="link-bordered" label={LABEL_LINK} />
      <Button kind="no-border" label={getEmbeddedLabel('No border')} />
      <Button kind="stepper" label={getEmbeddedLabel('Stepper')} />
    </div>

    <div class="row btn-row small">
      <ModernButton kind="primary" label={LABEL_PRIMARY} />
      <ModernButton kind="secondary" label={LABEL_SECONDARY} />
      <ModernButton kind="tertiary" label={LABEL_TERTIARY} />
      <ModernButton kind="negative" label={LABEL_NEGATIVE} />
    </div>

    <div class="row btn-row small">
      <Button kind="primary" label={LABEL_PRIMARY} />
      <ButtonMenu label={LABEL_PRIMARY} items={menuItems} />
      <ButtonWithDropdown {dropdownItems} label={LABEL_PRIMARY} />
    </div>

    <div class="row btn-row small">
      <ButtonIcon kind="primary" icon={IconCheckmark} size={'small'} />
      <ButtonIcon kind="primary" pressed icon={IconCheckmark} size={'small'} />\
      <ButtonIcon kind="secondary" icon={IconCheckmark} size={'small'} />
      <ButtonIcon kind="secondary" pressed icon={IconCheckmark} size={'small'} />
      <ButtonIcon kind="tertiary" icon={IconCheckmark} size={'small'} noPrint />
      <ButtonIcon kind="tertiary" pressed icon={IconCheckmark} size={'small'} />
      <ButtonIcon kind="negative" icon={IconCheckmark} size={'small'} />
      <ButtonIcon kind="negative" pressed icon={IconCheckmark} size={'small'} />
      <ButtonGroup
        items={[
          { id: 'b1', icon: IconActivity },
          { id: 'b2', icon: IconAttachment }
        ]}
      />
    </div>
    <div class="row btn-row small">
      <ButtonIcon kind="primary" icon={IconClose} size={'min'} />
    </div>

    <div class="row checks">
      <ModernCheckbox label={'Checked'} checked />
      <ModernCheckbox label={'Disabled'} disabled />
      <div class="legacy-check">
        <CheckBox checked color={base} />
        <span class="check-label"><Label label={LABEL_CHECKED} /></span>
      </div>
      <div class="icon-check">
        <IconCheck size="medium" fill={base} />
      </div>
      <ModernToggle />
      <Toggle on={true} />
      <Toggle />
      <div class="mini-toggle-wrapper">
        <MiniToggle on={true} label={getEmbeddedLabel('On')} />
        <MiniToggle label={getEmbeddedLabel('Off')} />
      </div>
    </div>

    <div class="row extras">
      <div class="spinner-box">
        <Spinner size="small" />
      </div>
      <div class="separator-box">
        <Separator name="accent-preview" index={0} />
      </div>
      <div class="separator-box">
        <Loading />
      </div>
    </div>

    <div class="row list">
      <ListView
        items={listItems}
        count={listItems.length}
        selection={selectedListIndex}
        minHeight="6rem"
        kind="thin"
        on:click={onListClick}
      >
        <svelte:fragment slot="item" let:item>{listItems[item]}</svelte:fragment>
      </ListView>
    </div>
  </div>
</div>

<style lang="scss">
  .accent-preview {
    position: fixed;
    width: 450px;
    padding: 0.75rem;
    background: var(--theme-bg-color);
    border-radius: 0.5rem;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.16);
    z-index: 10000;
    pointer-events: auto;
    border: 1px solid var(--theme-divider-color);
    transition:
      transform 0.12s ease,
      opacity 0.12s ease;
    transform-origin: left center;
    color: var(--theme-content-color);

    .ap-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 0.5rem;

      .swatch {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border: 2px solid rgba(0, 0, 0, 0.04);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);

        .swatch-inner {
          width: 100%;
          height: 100%;
          border-radius: 50%;
        }
      }
      .header-text {
        display: flex;
        flex-direction: column;

        .accent-name {
          font-weight: 600;
          font-size: 0.95rem;
        }
        .accent-desc {
          color: var(--theme-caption-color);
          font-size: 0.81rem;
        }
      }
    }

    .ap-content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .row {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .btn-row.small Button {
        padding: 0 0.5rem;
        font-size: 0.9rem;
      }

      /* removed unused selectors */

      .icon-check {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .spinner-box {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .separator-box {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .checks {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        flex-wrap: wrap;
      }

      .mini-toggle-wrapper {
        display: flex;
        gap: 1rem;
        align-items: center;
      }

      .list {
        margin-top: 0.25rem;
        max-height: 8.5rem;
        overflow: auto;
        padding-right: 0.25rem;
      }
    }

    .ap-footer {
      display: flex;
      justify-content: flex-end;
      margin-top: 0.5rem;
    }
  }

  /* no extra overrides required */
</style>
