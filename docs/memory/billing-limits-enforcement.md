# Billing limits enforcement

Область: [Биллинг](../features/billing.md)

- Seat-set = первые N active employee по `(rolePriority, account uuid)`: rolePriority Owner=0/Maintainer=1/иначе 2, тай-брейк по uuid (детерминированный, не по дате создания). `AccountRole.Admin` в подсчёт мест не входит вовсе. - `rolePriority`/`eligibleMembers`/`seatEligible`, `foundations/server/packages/middleware/src/seatLimits.ts`.
- `contextVars` в server-pipeline - shallow copy на каждый workspace pipeline, иначе `PLAN_LIMITS_VAR`/spaceCounts перетираются между воркспейсами. - `server/server-pipeline/src/pipeline.ts`.
- `transcriptLimit = meetingMinutesLimit * 60` - конверсия минут в секунды, отдельного поля лимита нет. - `services/billing/pod-billing/src/limits.ts`.
- Fail-open лимитов и seat-лимитов - осознанно, при недоступном на старте аккаунт-сервисе запись разрешена. - `foundations/server/packages/middleware/src/planLimitsMiddleware.ts`, `seatLimits.ts`.
- `PlanLimitExceeded` ловится в `ReadOnlyAccessMiddleware` и показывается нотификацией, а не падает силентно. - `plugins/view-resources/src/middleware.ts`.
- `joinByInvite` глотал `PlatformError` от `PlanLimitExceeded` и возвращал `undefined` - UI показывал generic "invalid otp"/JoinWorkspaceError вместо реальной причины отказа. - `plugins/login-resources/src/utils.ts`, `Join.svelte`.
- CLI `create-workspace` не даёт членства воркспейса - нужен отдельный `assign-workspace` (+`set-user-role` для Owner), иначе `selectWorkspace` -> Forbidden. - `dev/tool`.

## Связанные документы

- [Биллинг](../features/billing.md)
- [Billing dev stand quirks](billing_dev_stand_quirks.md)
