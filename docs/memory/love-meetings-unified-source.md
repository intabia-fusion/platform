# Love meetings: single source, two calendars

- A meeting created in the "Meetings" tab is a `PermanentMeeting`; only `Event` is created beside it, in the calendar `<uuid>_meetings_calendar` (`MEETINGS_CALENDAR_SUFFIX` in `plugins/love-resources/src/permanentMeetingSchedule.ts`).
- The Planner hides that calendar by name: `!(p._id as string).endsWith('_meetings_calendar')` in `plugins/time-resources/src/components/team/WithTeamData.svelte` and `plugins/time-resources/src/components/PlanningCalendar.svelte`. A renamed suffix breaks the split silently.
- Calendar of the section and Planner are different surfaces: `div.hulyHeader-container` vs `button#app-time:string:Planner`. A requirement about one does not hold for the other.
- List section headers pass the group document as the `object` prop, not in `value`: `plugins/view-resources/src/components/list/ListHeader.svelte` (`value={categoryValue}`, `object={categoryRefDoc}`). A presenter that reads only `value` gets a ref and cannot render per-document actions.
- `deleteMeetingGroup` (`plugins/love-resources/src/groups.ts`) unsets `group` on meetings before removing the group; calendar series are untouched.
- Love migrations run only when the workspace version differs: lower `version_patch` in `global_account.workspace_status` to make workspace-service pick it up.

- Meeting description is plain **text** in `PermanentMeeting.description` (a `TypeString` attribute of `Space`, shown by the panel as-is); the markup lives only in `calendar.class.Event.description`. Writing markup into the meeting document made the panel show raw JSON (`plugins/love-resources/src/permanentMeetingSchedule.ts`).
- `room` on the meeting and `repeatEvery` are exclusive: the writer clears one with `$unset` when setting the other, because the love service starts a session in `MeetingEventLink.room`.
- The event link is kept on the meeting as `PermanentMeeting.event` (`@Hidden`): a query by the link mixin's nested field (`love:mixin:MeetingEventLink.permanentMeeting`) answered empty often enough that the writer created duplicate events.
- Panel attribute presenters cannot be attached to an inherited attribute: `createAttributePresenter(..., love.class.PermanentMeeting, 'description')` and `@Prop` re-declaration in the subclass both do nothing for `Space.description`.
- HMR on `description.ts` / model edits prints `[HMR] Cannot apply update. Need to do a full reload!` — the open tab keeps the old bundle; Ctrl+Shift+R is required before any visual check.
