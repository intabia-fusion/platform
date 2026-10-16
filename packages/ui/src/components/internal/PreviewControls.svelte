<script lang="ts">
  // AccentPreview
  // Small preview box shown on the left side of the screen when hovering an accent.
  // Shows several controls (buttons, checkboxes, list) to help choose an accent.
  import type { Asset } from '@hcengineering/platform'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import Button from '../../ui-kit/button/Button.svelte'
  import IconButton from '../../ui-kit/button/IconButton.svelte'
  import MenuButton from '../../ui-kit/button/MenuButton.svelte'
  import {
    Button as LegacyButton,
    ButtonWithDropdown,
    CheckBox,
    ModernCheckbox,
    ListView,
    Label,
    Separator,
    Spinner,
    IconCheckmark,
    IconActivity,
    IconAttachment,
    IconClose,
    IconDown,
    IconColStar,
    IconDropdown
  } from '../..'
  import Loading from '../Loading.svelte'
  import ModernToggle from '../ModernToggle.svelte'
  import ButtonGroup from '../ButtonGroup.svelte'
  import Toggle from '../Toggle.svelte'
  import MiniToggle from '../MiniToggle.svelte'
  import SplitButton from '../SplitButton.svelte'

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

  const listItems = ['Preview item 1', 'Preview item 2', 'Preview item 3']
  const MENU_LABEL_ONE: IntlString = getEmbeddedLabel('One')
  const MENU_LABEL_TWO: IntlString = getEmbeddedLabel('Two')
  const menuItems = [
    { id: 'one', label: MENU_LABEL_ONE },
    { id: 'two', label: MENU_LABEL_TWO }
  ]
  const DROPDOWN_OPTION_1: IntlString = getEmbeddedLabel('Option 1')
  const dropdownItems = [{ id: 'one', label: DROPDOWN_OPTION_1 }]
  const selectedListIndex = 1

  // Labels used inside the preview (cast as IntlString to satisfy components)
  const PREVIEW_LABEL: IntlString = getEmbeddedLabel('Preview')
  const LABEL_PRIMARY: IntlString = getEmbeddedLabel('Primary')
  const LABEL_REGULAR: IntlString = getEmbeddedLabel('Regular')
  const LABEL_SECONDARY: IntlString = getEmbeddedLabel('Secondary')
  const LABEL_TERTIARY: IntlString = getEmbeddedLabel('Tertiary')
  const LABEL_NEGATIVE: IntlString = getEmbeddedLabel('Negative')
  const LABEL_YES: IntlString = getEmbeddedLabel('Yes')
  const LABEL_NO: IntlString = getEmbeddedLabel('No')
  const LABEL_ATTENTION: IntlString = getEmbeddedLabel('Attn')
  const LABEL_CHECKED: IntlString = getEmbeddedLabel('Check')
  const LABEL_DISABLED: IntlString = getEmbeddedLabel('Disab')
  // Extra preview labels for states and variants
  const LABEL_LOADING: IntlString = getEmbeddedLabel('Loading')
  const LABEL_PRESSED: IntlString = getEmbeddedLabel('Pressed')
  const LABEL_GHOST: IntlString = getEmbeddedLabel('Ghost')
  const LABEL_LINK: IntlString = getEmbeddedLabel('Link')
  const LABEL_CONTRAST: IntlString = getEmbeddedLabel('Contr')
  const LABEL_DANGEROUS: IntlString = getEmbeddedLabel('Dang')

  const micOn = 'love:icon:MicEnabled' as Asset
  const micOff = 'love:icon:MicDisabled' as Asset

  const camEnabled = 'love:icon:CamEnabled' as Asset
  const camDisabled = 'love:icon:CamDisabled' as Asset
</script>

<div class="flex flex-col">
  <div class="header-text">
    <Label label={getEmbeddedLabel(accent?.name ?? '')} />
    <Label label={PREVIEW_LABEL} />
  </div>
</div>

<div class="ap-content">
  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="primary" label={LABEL_PRIMARY} />
    <LegacyButton kind="regular" label={LABEL_REGULAR} />
    <LegacyButton kind="secondary" label={LABEL_SECONDARY} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="primary" label={LABEL_LOADING} loading />
    <LegacyButton kind="primary" label={LABEL_PRESSED} pressed />
    <LegacyButton kind="primary" label={LABEL_DISABLED} disabled />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="positive" label={LABEL_YES} />
    <LegacyButton kind="positive" label={LABEL_YES} loading />
    <LegacyButton kind="positive" pressed label={LABEL_YES} />
    <LegacyButton kind="positive" pressed disabled label={LABEL_YES} />
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="negative" label={LABEL_NO} />
    <LegacyButton kind="negative" label={LABEL_NO} loading />
    <LegacyButton kind="negative" pressed label={LABEL_NO} />
    <LegacyButton kind="negative" pressed disabled label={LABEL_NO} />
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="attention" label={LABEL_ATTENTION} />
    <LegacyButton kind="attention" label={LABEL_ATTENTION} loading />
    <LegacyButton kind="attention" pressed label={LABEL_ATTENTION} />
    <LegacyButton kind="attention" disabled label={LABEL_ATTENTION} />
    <LegacyButton kind="attention" pressed disabled label={LABEL_ATTENTION} />
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="dangerous" label={LABEL_DANGEROUS} />
    <LegacyButton kind="dangerous" label={LABEL_DANGEROUS} loading />
    <LegacyButton kind="dangerous" pressed label={LABEL_DANGEROUS} />
    <LegacyButton kind="dangerous" disabled label={LABEL_DANGEROUS} />
    <LegacyButton kind="dangerous" pressed disabled label={LABEL_DANGEROUS} />
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="contrast" label={LABEL_CONTRAST} />
    <LegacyButton kind="contrast" label={LABEL_CONTRAST} loading />
    <LegacyButton kind="contrast" pressed label={LABEL_CONTRAST} />
    <LegacyButton kind="contrast" disabled label={LABEL_CONTRAST} />
    <LegacyButton kind="contrast" pressed disabled label={LABEL_CONTRAST} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="ghost" label={LABEL_GHOST} />
    <LegacyButton kind="ghost" label={LABEL_GHOST} loading />
    <LegacyButton kind="link" label={LABEL_LINK} />
    <LegacyButton kind="link" label={LABEL_LINK} loading />
    <LegacyButton kind="link-bordered" label={LABEL_LINK} />
    <LegacyButton kind="link-bordered" label={LABEL_LINK} loading />
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="no-border" label={getEmbeddedLabel('No border')} />
    <LegacyButton kind="no-border" label={getEmbeddedLabel('No border')} loading />
    <LegacyButton kind="stepper" label={getEmbeddedLabel('Stepper')} />
    <LegacyButton kind="stepper" label={getEmbeddedLabel('Stepper')} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <Button kind="primary" label={LABEL_PRIMARY} />
    <Button kind="secondary" label={LABEL_SECONDARY} />
    <Button kind="tertiary" label={LABEL_TERTIARY} />
    <Button kind="negative" label={LABEL_NEGATIVE} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <LegacyButton kind="primary" label={LABEL_PRIMARY} />
    <MenuButton label={LABEL_PRIMARY} items={menuItems} />
    <ButtonWithDropdown
      {dropdownItems}
      label={LABEL_PRIMARY}
      hasDropdown={true}
      icon={IconColStar}
      dropdownIcon={IconDropdown}
    />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <SplitButton kind="primary" label={getEmbeddedLabel('Split Primary')} secondIcon={IconDown} />
    <SplitButton kind="secondary" label={getEmbeddedLabel('Split Secondary')} secondIcon={IconDown} />
    <SplitButton kind="regular" label={getEmbeddedLabel('Split Regular')} secondIcon={IconDown} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <IconButton kind="primary" icon={IconCheckmark} size="small" tooltip={{ label: getEmbeddedLabel('Checkmark') }} />
    <IconButton
      kind="primary"
      pressed
      icon={IconCheckmark}
      size="small"
      tooltip={{ label: getEmbeddedLabel('Checkmark') }}
    />\
    <IconButton kind="secondary" icon={IconCheckmark} size="small" tooltip={{ label: getEmbeddedLabel('Checkmark') }} />
    <IconButton
      kind="secondary"
      pressed
      icon={IconCheckmark}
      size="small"
      tooltip={{ label: getEmbeddedLabel('Checkmark') }}
    />
    <IconButton
      kind="tertiary"
      icon={IconCheckmark}
      size="small"
      tooltip={{ label: getEmbeddedLabel('Checkmark') }}
      noPrint
    />
    <IconButton
      kind="tertiary"
      pressed
      icon={IconCheckmark}
      size="small"
      tooltip={{ label: getEmbeddedLabel('Checkmark') }}
    />
    <IconButton kind="negative" icon={IconCheckmark} size="small" tooltip={{ label: getEmbeddedLabel('Checkmark') }} />
    <IconButton
      kind="negative"
      pressed
      icon={IconCheckmark}
      size="small"
      tooltip={{ label: getEmbeddedLabel('Checkmark') }}
    />
    <ButtonGroup
      items={[
        { id: 'b1', icon: IconActivity },
        { id: 'b2', icon: IconAttachment }
      ]}
    />
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <IconButton kind="primary" icon={IconClose} size="min" tooltip={{ label: getEmbeddedLabel('Close') }} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <SplitButton kind="secondary" icon={micOn} size="medium" secondIcon={micOff} />
    <SplitButton kind="secondary" icon={camEnabled} size="medium" secondIcon={camDisabled} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <ModernCheckbox label="Checked" checked />
    <ModernCheckbox label="Disabled" disabled />
    <div class="legacy-check">
      <CheckBox checked />
      <span class="check-label">
        <Label label={LABEL_CHECKED} />
      </span>
    </div>
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <ModernToggle />
    <ModernToggle checked />
    <ModernToggle disabled />
    <Toggle on={true} />
    <Toggle />
    <div class="mini-toggle-wrapper">
      <MiniToggle on={true} label={getEmbeddedLabel('On')} />
      <MiniToggle label={getEmbeddedLabel('Off')} />
    </div>
  </div>

  <div class="flex flex-row-center p-1 gap-2">
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

  <div class="flex flex-row-center p-1 gap-2">
    <ListView
      items={listItems}
      count={listItems.length}
      selection={selectedListIndex}
      minHeight="6rem"
      colorsSchema="default"
      kind="thin"
    >
      <svelte:fragment slot="item" let:item>{listItems[item]}</svelte:fragment>
    </ListView>
  </div>
</div>

<style lang="scss">
  .check-label {
    color: var(--global-accent-TextColor);
  }
</style>
