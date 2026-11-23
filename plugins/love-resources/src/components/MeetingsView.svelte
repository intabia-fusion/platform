<!--
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
-->
<!--
  The meetings section: the calendar of the series and the table of the permanent meetings, the two
  views the owner kept here. The list of meetings lives in the groups tab, where the rows are split by
  the meeting group and by whether the meeting is in the calendar.
-->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import love from '@hcengineering/love'
  import type { Asset, IntlString } from '@hcengineering/platform'
  import ui, { type AnyComponent } from '@hcengineering/ui'
  import view, { type ViewletDescriptor } from '@hcengineering/view'
  import { SpecialView } from '@hcengineering/workbench-resources'

  import lovePlugin from '../plugin'
  import CreatePermanentMeetingPopup from './CreatePermanentMeetingPopup.svelte'
  import MeetingViewSwitch from './MeetingViewSwitch.svelte'

  type MeetingView = 'calendar' | 'table'

  // Only the model declares the calendar descriptor, the client plugin has no id for it, so the
  // descriptor list is what pins this tab to the calendar: a viewlet picked before (the list, say)
  // would otherwise win over the default and the tab would open as a list.
  const CALENDAR_VIEWLET = 'calendar:viewlet:Calendar' as Ref<ViewletDescriptor>

  let selected: MeetingView = 'calendar'

  $: views = [
    { id: 'calendar', label: lovePlugin.string.CalendarMeetingView as IntlString, icon: ui.icon.Calendar as Asset },
    { id: 'table', label: view.string.Table as IntlString, icon: ui.icon.Table as Asset }
  ]

  function selectView (id: string): void {
    selected = id as MeetingView
  }

  const viewSwitch = MeetingViewSwitch as unknown as AnyComponent
  // The calendar grid asks the viewlet for a create dialog; the property is a resource id, not a
  // component, so the component is handed over as one.
  const createDialog = CreatePermanentMeetingPopup as unknown as AnyComponent
</script>

{#if selected === 'calendar'}
  <!-- A materialised occurrence keeps the mixin the calendar mirrors onto every copy, so without a
       filter every edited or cancelled occurrence would sit here as a second meeting. -->
  <SpecialView
    _class={love.mixin.MeetingEventLink}
    baseQuery={{ recurringEventId: { $exists: false } }}
    label={lovePlugin.string.Meetings}
    icon={love.icon.Cam}
    descriptors={[CALENDAR_VIEWLET]}
    defaultViewletDescriptor={CALENDAR_VIEWLET}
    createComponent={createDialog}
    createButton={lovePlugin.component.PermanentMeetingsHeaderActions}
    createComponentProps={{ initialKind: 'one-off' }}
    hideViewSettings
    beforeTitle={viewSwitch}
    beforeTitleProps={{ items: views, selected, onSelect: selectView }}
  />
{:else}
  <!-- The table of the permanent meetings, with the columns it always had. -->
  <SpecialView
    _class={love.class.PermanentMeeting}
    label={lovePlugin.string.PermanentMeetings}
    icon={love.icon.MeetingMinutes}
    descriptors={[view.viewlet.Table]}
    defaultViewletDescriptor={view.viewlet.Table}
    createButton={lovePlugin.component.PermanentMeetingsHeaderActions}
    beforeTitle={viewSwitch}
    beforeTitleProps={{ items: views, selected, onSelect: selectView }}
  />
{/if}
