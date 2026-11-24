# Love meetings: single source, two calendars

- A meeting created in the "Meetings" tab is a `PermanentMeeting`; only `Event` is created beside it, in the calendar `<uuid>_meetings_calendar` (`MEETINGS_CALENDAR_SUFFIX` in `plugins/love-resources/src/permanentMeetingSchedule.ts`).
- The Planner hides that calendar by name: `!(p._id as string).endsWith('_meetings_calendar')` in `plugins/time-resources/src/components/team/WithTeamData.svelte` and `plugins/time-resources/src/components/PlanningCalendar.svelte`. A renamed suffix breaks the split silently.
- Calendar of the section and Planner are different surfaces: `div.hulyHeader-container` vs `button#app-time:string:Planner`. A requirement about one does not hold for the other.
- List section headers pass the group document as the `object` prop, not in `value`: `plugins/view-resources/src/components/list/ListHeader.svelte` (`value={categoryValue}`, `object={categoryRefDoc}`). A presenter that reads only `value` gets a ref and cannot render per-document actions.
- `deleteMeetingGroup` (`plugins/love-resources/src/groups.ts`) unsets `group` on meetings before removing the group; calendar series are untouched.
- Love migrations run only when the workspace version differs: lower `version_patch` in `global_account.workspace_status` to make workspace-service pick it up.
