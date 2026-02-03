<script lang="ts">
  // AccentPreview
  // Small preview box shown on the left side of the screen when hovering an accent.
  // Shows several controls (buttons, checkboxes, list) to help choose an accent.
  import { Asset, getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
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
    IconClose,
    IconDown,
    IconColStar,
    IconDropdown
  } from '../..'
  import Loading from '../Loading.svelte'
  import ModernToggle from '../ModernToggle.svelte'
  import ButtonIcon from '../ButtonIcon.svelte'
  import ButtonGroup from '../ButtonGroup.svelte'
  import Toggle from '../Toggle.svelte'
  import MiniToggle from '../MiniToggle.svelte'
  import ModernButton from '../ModernButton.svelte'
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
  const LABEL_ATTENTION: IntlString = getEmbeddedLabel('Attention')
  const LABEL_CHECKED: IntlString = getEmbeddedLabel('Checked')
  const LABEL_DISABLED: IntlString = getEmbeddedLabel('Disabled')
  // Extra preview labels for states and variants
  const LABEL_LOADING: IntlString = getEmbeddedLabel('Loading')
  const LABEL_PRESSED: IntlString = getEmbeddedLabel('Pressed')
  const LABEL_GHOST: IntlString = getEmbeddedLabel('Ghost')
  const LABEL_LINK: IntlString = getEmbeddedLabel('Link')
  const LABEL_CONTRAST: IntlString = getEmbeddedLabel('Contrast')
  const LABEL_DANGEROUS: IntlString = getEmbeddedLabel('Dangerous')

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
    <Button kind="primary" label={LABEL_PRIMARY} />
    <Button kind="regular" label={LABEL_REGULAR} />
    <Button kind="secondary" label={LABEL_SECONDARY} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <Button kind="primary" label={LABEL_LOADING} loading />
    <Button kind="primary" label={LABEL_PRESSED} pressed />
    <Button kind="primary" label={LABEL_DISABLED} disabled />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <Button kind="positive" label={LABEL_YES} />
    <Button kind="positive" pressed label={LABEL_YES} />
    <Button kind="positive" pressed disabled label={LABEL_YES} />
    <Button kind="negative" label={LABEL_NO} />
    <Button kind="negative" pressed label={LABEL_NO} />
    <Button kind="negative" pressed disabled label={LABEL_NO} />
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <Button kind="attention" label={LABEL_ATTENTION} />
    <Button kind="attention" pressed label={LABEL_ATTENTION} />
    <Button kind="attention" disabled label={LABEL_ATTENTION} />
    <Button kind="attention" pressed disabled label={LABEL_ATTENTION} />
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <Button kind="dangerous" label={LABEL_DANGEROUS} />
    <Button kind="dangerous" pressed label={LABEL_DANGEROUS} />
    <Button kind="dangerous" disabled label={LABEL_DANGEROUS} />
    <Button kind="dangerous" pressed disabled label={LABEL_DANGEROUS} />
  </div>
  <div class="flex flex-row-center p-1 gap-2">
    <Button kind="contrast" label={LABEL_CONTRAST} />
    <Button kind="contrast" pressed label={LABEL_CONTRAST} />
    <Button kind="contrast" disabled label={LABEL_CONTRAST} />
    <Button kind="contrast" pressed disabled label={LABEL_CONTRAST} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <Button kind="ghost" label={LABEL_GHOST} />
    <Button kind="link" label={LABEL_LINK} />
    <Button kind="link-bordered" label={LABEL_LINK} />
    <Button kind="no-border" label={getEmbeddedLabel('No border')} />
    <Button kind="stepper" label={getEmbeddedLabel('Stepper')} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <ModernButton kind="primary" label={LABEL_PRIMARY} />
    <ModernButton kind="secondary" label={LABEL_SECONDARY} />
    <ModernButton kind="tertiary" label={LABEL_TERTIARY} />
    <ModernButton kind="negative" label={LABEL_NEGATIVE} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <Button kind="primary" label={LABEL_PRIMARY} />
    <ButtonMenu label={LABEL_PRIMARY} items={menuItems} />
    <ButtonWithDropdown
      {dropdownItems}
      label={LABEL_PRIMARY}
      hasDropdown={true}
      icon={IconColStar}
      dropdownIcon={IconDropdown}
    />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <SplitButton kind={'primary'} label={getEmbeddedLabel('Split Primary')} secondIcon={IconDown} />
    <SplitButton kind={'secondary'} label={getEmbeddedLabel('Split Secondary')} secondIcon={IconDown} />
    <SplitButton kind={'regular'} label={getEmbeddedLabel('Split Regular')} secondIcon={IconDown} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
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
  <div class="flex flex-row-center p-1 gap-2">
    <ButtonIcon kind="primary" icon={IconClose} size={'min'} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <SplitButton kind="secondary" icon={micOn} size={'medium'} secondIcon={micOff} />
    <SplitButton kind="secondary" icon={camEnabled} size={'medium'} secondIcon={camDisabled} />
  </div>

  <div class="flex flex-row-center p-1 gap-2">
    <ModernCheckbox label={'Checked'} checked />
    <ModernCheckbox label={'Disabled'} disabled />
    <div class="legacy-check">
      <CheckBox checked />
      <span class="check-label">
        <Label label={LABEL_CHECKED} />
      </span>
    </div>
    <ModernToggle />
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
      colorsSchema={'default'}
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
