# "Типы пространств" (Space Types settings) unreachable in UI

`models/setting/src/index.ts` registers the `spaceTypes` category (id `setting.ids.ManageSpaces`,
label "Типы пространств") with `setting.class.SettingsCategory`. Every sibling category in the same
`settings-editor` group (Classes, References, Templates, Related issues, Invite settings, Office
settings, ~line 403-483) uses `setting.class.WorkspaceSettingCategory` instead.

Only two components read these categories:
- `plugins/setting-resources/src/components/Settings.svelte` queries `SettingsCategory` (account-level
  group: General, Password, Notifications, Calendar, Office, Sidebar, AI).
- `plugins/setting-resources/src/components/WorkspaceSettings.svelte` queries
  `WorkspaceSettingCategory` (workspace group shown under "РАБОЧЕЕ ПРОСТРАНСТВО").

`spaceTypes` belongs to neither query's result set it's meant for, so it never renders in either
sidebar. Direct navigation to `.../setting/spaceTypes` also shows a blank content pane (category not
found). The three in-app "go to project type settings" links all navigate to the same dead route:
`plugins/task-resources/src/index.ts:104`, `plugins/tracker-resources/src/index.ts:276`,
`plugins/workflow-resources/src/location.ts:41` (`ProjectTypeSettingsLink.svelte` too).

Effect: there is currently no way to reach "Classic project" task type / status / screen / workflow
settings through the UI at all (confirmed on the `--docs` stand, commit `74c4a86c9a`). This blocks
reshooting screenshots for `advanced-settings/task-types` and all `workflow/*` docs pages - flagged to
the user instead of faked. Root-cause fix (not applied, out of scope for a docs session): change
`setting.class.SettingsCategory` to `setting.class.WorkspaceSettingCategory` in the `spaceTypes`
`createDoc` call.
