# `generate-planner-data` tool command (FUSIO-1308)

Область: [Планировщик / Календарь](../features/planner-calendar.md)

`dev/tool/src/plannerData.ts` + `generate-planner-data <workspace>` command in `dev/tool/src/index.ts`. Populates a workspace with tracker projects/issues, personal todos, work slots and calendar events for eyeballing Team Planner/calendar. Run:

```bash
cd tests && ./tool-pg.sh generate-planner-data <workspace> [--accounts user1,user2,user3] [--password 1234] [--url http://localhost:8083]
```

Needs `pnpm bundle --to @hcengineering/tool` first (or run through `tests/tool-pg.sh`, which falls back to the pre-built `dev/tool/bundle/bundle.js`).

## No custom ProjectType needed

Every workspace's model migration (`createDefaultProject` in `models/tracker/src/migration.ts`) already seeds a well-known classic project type and default task type: `tracker.ids.ClassingProjectType`, `tracker.taskTypes.Issue`. `createIssueHandler` (`server-plugins/time-resources/src/index.ts`) fires the `ProjectToDo` auto-creation trigger on any status whose category is `task.statusCategory.ToDo`/`Active`, which the default statuses satisfy. A new `tracker.class.Project` can be created directly with `type: tracker.ids.ClassingProjectType` - no `createProjectType`/`createProjectTypeWith`, no per-project `createMixin` (only needed for custom project types).

## `create-workspace <name> <owner_social_id>` does NOT add the owner as a member

The `owner_social_id` arg is just who the DB record is attributed to. Every account, owner included, needs an explicit `assign-workspace <email> <workspace>` (+ `set-user-role <email>
<workspace> OWNER` for the owner) before it can log in - otherwise `selectWorkspace` returns
`platform:status:Forbidden`. Also needs `set-workspace-plan <workspace> business` (a fresh workspace has no plan, same `Forbidden` on login).

## Verifying created data

No REST endpoint shortcut - `getWorkspaceToken(url, {email, password, workspace}, config)` resolves the actual transactor endpoint (`token.endpoint`); the base platform URL (`http://localhost:8083`) is NOT a valid REST client endpoint on its own (`findAll` returns the index.html shell, `JSON.parse` blows up on `<!doctype`).
