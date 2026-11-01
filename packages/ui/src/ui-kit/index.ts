//
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
//

// Entry point of `@hcengineering/ui/kit`: the current base components that replace the legacy ones in ../components.
export { default as AccordionItem } from './accordion/AccordionItem.svelte'
export { default as Breadcrumb } from './breadcrumbs/Breadcrumb.svelte'
export { default as Breadcrumbs } from './breadcrumbs/Breadcrumbs.svelte'
export { default as Button } from './button/Button.svelte'
export { default as ButtonGroup } from './button-group/ButtonGroup.svelte'
export { default as Calendar } from './calendar/Calendar.svelte'
export { default as Checkbox } from './checkbox/Checkbox.svelte'
export { default as Chip } from './chip/Chip.svelte'
export { default as CodeInput } from './code-input/CodeInput.svelte'
export { default as DateInput } from './date/DateInput.svelte'
export { default as DateLabel } from './date/DateLabel.svelte'
export { default as DatePicker } from './date/DatePicker.svelte'
export { default as DateSelect } from './date/DateSelect.svelte'
export { default as Dialog } from './dialog/Dialog.svelte'
export { default as Dropdown } from './dropdown/Dropdown.svelte'
export { default as EmptyState } from './empty-state/EmptyState.svelte'
export { default as FilterButton } from './filter-button/FilterButton.svelte'
export { default as IconBox } from './icon-box/IconBox.svelte'
export { default as IconButton } from './button/IconButton.svelte'
export { default as Kbd } from './kbd/Kbd.svelte'
export { default as Link } from './link/Link.svelte'
export { default as List } from './list/List.svelte'
export { default as Loading } from './loading/Loading.svelte'
export { default as Menu } from './menu/Menu.svelte'
export { default as MenuButton } from './button/MenuButton.svelte'
export { default as NavGroup } from './nav-group/NavGroup.svelte'
export { default as NavItem } from './nav-item/NavItem.svelte'
export { default as NumberInput } from './number-input/NumberInput.svelte'
export { default as Panel } from './panel/Panel.svelte'
export { default as PanelHeader } from './panel-header/PanelHeader.svelte'
export { default as ProgressBar } from './progress-bar/ProgressBar.svelte'
export { default as ProgressCircle } from './progress-circle/ProgressCircle.svelte'
export { default as Radio } from './radio/Radio.svelte'
export { default as RadioGroup } from './radio/RadioGroup.svelte'
export { default as RelativeTime } from './relative-time/RelativeTime.svelte'
export { default as SearchInput } from './search-input/SearchInput.svelte'
export { default as Section } from './section/Section.svelte'
export { default as SegmentedControl } from './segmented-control/SegmentedControl.svelte'
export { default as SelectButton } from './select-button/SelectButton.svelte'
export { default as ShowMore } from './show-more/ShowMore.svelte'
export { default as Slider } from './slider/Slider.svelte'
export { default as Spinner } from './spinner/Spinner.svelte'
export { default as SplitButton } from './split-button/SplitButton.svelte'
export { default as StatusIcon } from './status-icon/StatusIcon.svelte'
export { default as Callout } from './callout/Callout.svelte'
export { default as SettingRow } from './setting-row/SettingRow.svelte'
export { default as MonthView } from './month-view/MonthView.svelte'
export { default as YearView } from './year-view/YearView.svelte'
export { default as StatusMessage } from './status-message/StatusMessage.svelte'
export { default as Steps } from './steps/Steps.svelte'
export { default as Tabs } from './tabs/Tabs.svelte'
export { default as TextArea } from './text-area/TextArea.svelte'
export { default as TextInput } from './text-input/TextInput.svelte'
export { default as Toast } from './toast/Toast.svelte'
export { default as Toggle } from './toggle/Toggle.svelte'
export { default as TypingIndicator } from './typing/TypingIndicator.svelte'
export { default as WizardDialog } from './wizard-dialog/WizardDialog.svelte'
export { default as WorkbenchTab } from './workbench-tab/WorkbenchTab.svelte'
export { default as WorkspaceLogo } from './workspace-logo/WorkspaceLogo.svelte'
export { fromLegacySelectWidth } from './button/legacy'
export { formatDateValue } from './date/format'
export type { AccordionItemEvents, AccordionItemProps, AccordionItemSize } from './accordion/types'
export type {
  BreadcrumbEvents,
  BreadcrumbProps,
  BreadcrumbsEvents,
  BreadcrumbsItem,
  BreadcrumbsProps
} from './breadcrumbs/types'
export type { ButtonGroupEvents, ButtonGroupItem, ButtonGroupKind, ButtonGroupProps } from './button-group/types'
export type {
  ButtonAttributes,
  ButtonEvents,
  ButtonKind,
  ButtonProps,
  ButtonShape,
  ButtonSize,
  ButtonType,
  IconButtonProps,
  MenuButtonEvents,
  MenuButtonProps
} from './button/types'

export { default as FileBadge } from './file/FileBadge.svelte'
export { default as FileCard } from './file/FileCard.svelte'
export { default as FileCover } from './file/FileCover.svelte'
export { default as FileImage } from './file/FileImage.svelte'
export { default as FileNoPreview } from './file/FileNoPreview.svelte'
export { default as FileTile } from './file/FileTile.svelte'
export { default as MediaToolbar } from './file/MediaToolbar.svelte'
export { default as PageThumb } from './file/PageThumb.svelte'
export { formatFileSize, formatMediaDuration } from './file/format'
export type { FileBadgeData, ImageSource } from './file/types'

export { default as AudioBar } from './audio/AudioBar.svelte'
export { default as AudioCard } from './audio/AudioCard.svelte'
export { default as AudioCover } from './audio/AudioCover.svelte'
export { default as VoiceRecorderBar } from './audio/VoiceRecorderBar.svelte'
export { sharedPlayback } from './audio/playback'
export type { Playback } from './audio/types'

export { default as LinkCard } from './link/LinkCard.svelte'
export { default as LinkCoverCard } from './link/LinkCoverCard.svelte'
export { default as SiteIcon } from './link/SiteIcon.svelte'
export { linkHref, linkTarget, openLink } from './link/utils'

export type { CalendarEvents, CalendarNavigation, CalendarProps, CalendarRange } from './calendar/types'
export type { CheckboxAttributes, CheckboxEvents, CheckboxKind, CheckboxProps, CheckboxSize } from './checkbox/types'
export type { ChipEvents, ChipKind, ChipProps, ChipSize, ChipTone } from './chip/types'
export type { CodeInputEvents, CodeInputProps, CodeInputSize } from './code-input/types'
export type {
  DateInputEvents,
  DateInputKind,
  DateInputPart,
  DateInputProps,
  DateInputSize,
  DateLabelProps,
  DatePickerEvents,
  DatePickerProps,
  DatePickerResult,
  DateSelectEvents,
  DateSelectProps,
  DateTone
} from './date/types'
export type {
  DialogProps,
  DialogEvents,
  DialogSlots,
  DialogWidth,
  DialogPadding,
  DialogSubmitKind
} from './dialog/types'
export type {
  DropdownEvents,
  DropdownItem,
  DropdownItemId,
  DropdownProps,
  DropdownSeparator,
  DropdownSlots
} from './dropdown/types'
export type { EmptyStateEvents, EmptyStateKind, EmptyStateProps, EmptyStateSize } from './empty-state/types'
export type {
  FilterButtonActiveFilter,
  FilterButtonCategory,
  FilterButtonEvents,
  FilterButtonIndicator,
  FilterButtonKind,
  FilterButtonOption,
  FilterButtonProps,
  FilterButtonSize
} from './filter-button/types'
export type { IconBoxProps, IconBoxSize } from './icon-box/types'
export type { KbdProps } from './kbd/types'
export type { LinkEvents, LinkProps, LinkTruncate } from './link/types'
export type { ListEvents, ListProps, ListTone } from './list/types'
export type { LoadingProps } from './loading/types'
export type {
  MenuEvents,
  MenuHeadings,
  MenuItem,
  MenuItemId,
  MenuItemPopup,
  MenuProps,
  MenuSlots,
  MenuWidth
} from './menu/types'
export type { NavGroupEvents, NavGroupKind, NavGroupProps } from './nav-group/types'
export type { NavItemEvents, NavItemKind, NavItemProps } from './nav-item/types'
export type { NumberInputEvents, NumberInputProps, NumberInputSize } from './number-input/types'
export type { PanelEvents, PanelProps, PanelResize } from './panel/types'
export type { PanelHeaderAdaptive, PanelHeaderEvents, PanelHeaderProps, PanelHeaderSize } from './panel-header/types'
export type { ProgressBarKind, ProgressBarProps, ProgressBarSegment, ProgressBarSize } from './progress-bar/types'
export type { ProgressCircleProps, ProgressCircleSize } from './progress-circle/types'
export type {
  RadioAttributes,
  RadioEvents,
  RadioGroupEvents,
  RadioGroupItem,
  RadioGroupProps,
  RadioKind,
  RadioProps,
  RadioSize
} from './radio/types'
export type { RelativeTimeEvents, RelativeTimeFormat, RelativeTimeProps } from './relative-time/types'
export type { SearchInputEvents, SearchInputKind, SearchInputProps, SearchInputSize } from './search-input/types'
export type { SectionProps } from './section/types'
export type {
  SegmentedControlEvents,
  SegmentedControlId,
  SegmentedControlItem,
  SegmentedControlProps,
  SegmentedControlSize
} from './segmented-control/types'
export type {
  SelectButtonChevron,
  SelectButtonJustify,
  SelectButtonKind,
  SelectButtonProps,
  SelectButtonSize
} from './select-button/types'
export type { ShowMoreEvents, ShowMoreProps } from './show-more/types'
export type { SliderAttributes, SliderEvents, SliderProps, SliderSize } from './slider/types'
export type { SpinnerKind, SpinnerProps, SpinnerSize } from './spinner/types'
export type { SplitButtonEvents, SplitButtonKind, SplitButtonProps, SplitButtonSize } from './split-button/types'
export type { StatusIconKind, StatusIconProps, StatusIconSize, StatusIconTone } from './status-icon/types'
export type { CalloutProps, CalloutTone } from './callout/types'
export type { SettingRowProps, SettingRowSlots, SettingRowVariant } from './setting-row/types'
export type { MonthViewProps, MonthViewWeekdayFormat } from './month-view/types'
export type { YearViewProps } from './year-view/types'
export type { StatusMessageProps } from './status-message/types'
export type { StepsProps, StepsItem } from './steps/types'
export type { TabsEvents, TabsId, TabsItem, TabsProps, TabsSize } from './tabs/types'
export type { TextAreaEvents, TextAreaKind, TextAreaProps, TextAreaSize } from './text-area/types'
export type {
  TextInputEvents,
  TextInputKind,
  TextInputMode,
  TextInputProps,
  TextInputSize,
  TextInputType
} from './text-input/types'
export type { ToastEvents, ToastProps, ToastTone } from './toast/types'
export type {
  ToggleAttributes,
  ToggleEvents,
  ToggleKind,
  ToggleLabelPosition,
  ToggleProps,
  ToggleSize
} from './toggle/types'
export type { TypingIndicatorProps } from './typing/types'
export type { WizardDialogProps, WizardDialogEvents, WizardDialogSlots } from './wizard-dialog/types'
export type {
  WorkbenchTabEvents,
  WorkbenchTabKind,
  WorkbenchTabOrientation,
  WorkbenchTabProps
} from './workbench-tab/types'
export type { WorkspaceLogoProps, WorkspaceLogoSize } from './workspace-logo/types'
