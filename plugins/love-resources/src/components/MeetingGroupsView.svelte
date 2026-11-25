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
  The groups tab: every meeting group in one list, each group a section of its meetings. No switch
  here - the groups themselves are what the tab is about. A meeting is created from the meetings
  section, so this tab keeps only the "Merge into group" action.
-->
<script lang="ts">
  import love from '@hcengineering/love'
  import ui, { type AnyComponent } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { SpecialView } from '@hcengineering/workbench-resources'

  import lovePlugin from '../plugin'
  import MeetingListCaption from './MeetingListCaption.svelte'
  import { MEETING_LIST_COLUMNS, MEETING_LIST_MIN_ROW_WIDTH } from '../meetingListColumns'

  // One list only: the table of the same rows is the meetings tab, so the list is not a choice here.
  const descriptors = [view.viewlet.List]
  // The list itself has no caption row: the view draws it above the categories. Fixed columns make a
  // row a grid, so every cell sits under its own caption.
  const caption = MeetingListCaption as unknown as AnyComponent
  const viewletProps = { props: { columnWidths: MEETING_LIST_COLUMNS, minRowWidth: MEETING_LIST_MIN_ROW_WIDTH } }
</script>

<SpecialView
  _class={love.class.PermanentMeeting}
  label={lovePlugin.string.MeetingGroups}
  icon={ui.icon.People}
  {descriptors}
  defaultViewletDescriptor={view.viewlet.List}
  createButton={lovePlugin.component.PermanentMeetingsHeaderActions}
  createComponentProps={{ groupOnly: true }}
  contentHeader={caption}
  {viewletProps}
/>
